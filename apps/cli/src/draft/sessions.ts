import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { redact, redactPath } from './redact';

export type SessionSummary = {
  id: string;
  title: string;
  cwd: string;
  branch: string | null;
  startedAt: string;
  endedAt: string;
  prompts: string[];
  files: string[];
};

type ReadSessionsInput = {
  dir?: string;
  since: Date;
  until: Date;
  env?: Record<string, string | undefined>;
};

type SessionFile = { path: string; size: number };

type Accumulator = {
  id: string;
  titles: string[];
  cwds: Map<string, number>;
  branches: Map<string, number>;
  start: number;
  end: number;
  prompts: string[];
  files: Set<string>;
  inWindow: boolean;
};

export type SessionReadLimits = { maxWholeBytes: number; tailBytes: number };

const DEFAULT_LIMITS: SessionReadLimits = {
  maxWholeBytes: 50 * 1024 * 1024,
  tailBytes: 20 * 1024 * 1024,
};
const SKIPPED_PREFIXES = [
  '<command-',
  '<local-command-',
  '<bash-input',
  '<bash-stdout',
  '<bash-stderr',
  '<task-notification',
  'This session is being continued',
  '[Request interrupted',
];
const MAX_PROMPTS = 5;
const MAX_PROMPT_CHARS = 300;
const MAX_TITLE_CHARS = 120;
const MAX_FILES = 20;
const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const REMINDER = /<system-reminder>[\s\S]*?<\/system-reminder>/g;
const UNCLOSED_REMINDER = /<system-reminder>[\s\S]*$/;

export async function readSessions(
  input: ReadSessionsInput,
  limits: SessionReadLimits = DEFAULT_LIMITS,
): Promise<SessionSummary[]> {
  const env = input.env ?? process.env;
  if (env.STANDCAST_SESSIONS === 'off') return [];
  try {
    const dir = input.dir ?? env.STANDCAST_CLAUDE_DIR ?? join(homedir(), '.claude', 'projects');
    const window = { since: input.since.getTime(), until: input.until.getTime() };
    const sessions = new Map<string, Accumulator>();
    for (const file of await sessionFiles(dir, window.since)) {
      await readFile(file, limits, window, sessions);
    }
    return [...sessions.values()]
      .map(summarize)
      .filter((s): s is SessionSummary => s !== null)
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  } catch {
    return [];
  }
}

async function sessionFiles(dir: string, since: number): Promise<SessionFile[]> {
  const files: SessionFile[] = [];
  for (const project of await safeReaddir(dir)) {
    const projectDir = join(dir, project);
    for (const name of await safeReaddir(projectDir)) {
      if (!name.endsWith('.jsonl')) continue;
      const path = join(projectDir, name);
      try {
        const info = await stat(path);
        if (!info.isFile() || info.mtimeMs < since) continue;
        files.push({ path, size: info.size });
      } catch {}
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function safeReaddir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

async function readFile(
  file: SessionFile,
  limits: SessionReadLimits,
  window: { since: number; until: number },
  sessions: Map<string, Accumulator>,
): Promise<void> {
  try {
    const decoder = new TextDecoder();
    const start = file.size > limits.maxWholeBytes ? Math.max(0, file.size - limits.tailBytes) : 0;
    const source = start > 0 ? Bun.file(file.path).slice(start, file.size) : Bun.file(file.path);
    let skipPartial = start > 0;
    const pieces: string[] = [];
    const emit = (text: string) => {
      pieces.push(text);
      const line = pieces.join('');
      pieces.length = 0;
      if (skipPartial) {
        skipPartial = false;
        return;
      }
      handleLine(line, window, sessions);
    };
    const consume = (text: string) => {
      let from = 0;
      let at = text.indexOf('\n', from);
      while (at !== -1) {
        emit(text.slice(from, at));
        from = at + 1;
        at = text.indexOf('\n', from);
      }
      if (from < text.length) pieces.push(text.slice(from));
    };
    for await (const chunk of source.stream()) consume(decoder.decode(chunk, { stream: true }));
    consume(decoder.decode());
    if (pieces.length > 0) emit('');
  } catch {}
}

function handleLine(
  raw: string,
  window: { since: number; until: number },
  sessions: Map<string, Accumulator>,
): void {
  if (!raw.trim()) return;
  let line: unknown;
  try {
    line = JSON.parse(raw);
  } catch {
    return;
  }
  if (!isRecord(line) || typeof line.sessionId !== 'string' || !line.sessionId) return;
  const type = line.type;
  if (type !== 'user' && type !== 'assistant' && type !== 'ai-title') return;
  if (line.isSidechain === true) return;

  if (type === 'ai-title') {
    if (typeof line.aiTitle !== 'string' || !line.aiTitle.trim()) return;
    if (typeof line.timestamp === 'string' && !inWindow(line.timestamp, window)) return;
    session(sessions, line.sessionId).titles.push(line.aiTitle.trim());
    return;
  }

  if (typeof line.timestamp !== 'string' || !inWindow(line.timestamp, window)) return;
  const at = Date.parse(line.timestamp);
  const acc = session(sessions, line.sessionId);
  acc.inWindow = true;
  acc.start = Math.min(acc.start, at);
  acc.end = Math.max(acc.end, at);
  if (typeof line.cwd === 'string' && line.cwd) count(acc.cwds, line.cwd);
  if (typeof line.gitBranch === 'string') count(acc.branches, line.gitBranch);

  const message = isRecord(line.message) ? line.message : null;
  if (!message) return;
  if (type === 'user') {
    if (line.isMeta === true || line.isCompactSummary === true) return;
    if (line.isVisibleInTranscriptOnly === true || acc.prompts.length >= MAX_PROMPTS) return;
    const prompt = promptText(message.content);
    if (prompt) acc.prompts.push(prompt);
    return;
  }
  if (Array.isArray(message.content)) {
    for (const block of message.content) {
      const file = editedFile(block);
      if (file) acc.files.add(file);
    }
  }
}

function promptText(content: unknown): string | null {
  let texts: string[];
  if (typeof content === 'string') {
    texts = [content];
  } else if (Array.isArray(content)) {
    texts = content
      .filter((b): b is { type: 'text'; text: unknown } => isRecord(b) && b.type === 'text')
      .map((b) => b.text)
      .filter((text): text is string => typeof text === 'string');
  } else {
    return null;
  }
  const kept = texts.map(cleanBlock).filter((text): text is string => text !== null);
  return kept.length > 0 ? kept.join('\n') : null;
}

function cleanBlock(text: string): string | null {
  const clean = text.replace(REMINDER, '').replace(UNCLOSED_REMINDER, '').trim();
  if (!clean || SKIPPED_PREFIXES.some((prefix) => clean.startsWith(prefix))) return null;
  return clean;
}

function editedFile(block: unknown): string | null {
  if (!isRecord(block) || block.type !== 'tool_use') return null;
  if (typeof block.name !== 'string' || !FILE_TOOLS.has(block.name)) return null;
  if (!isRecord(block.input)) return null;
  const path = block.input.file_path ?? block.input.notebook_path;
  return typeof path === 'string' && path ? path : null;
}

function summarize(acc: Accumulator): SessionSummary | null {
  if (!acc.inWindow || acc.prompts.length === 0) return null;
  const prompts = acc.prompts.map((p) => redact(p).slice(0, MAX_PROMPT_CHARS));
  const rawCwd = mostFrequent(acc.cwds) ?? '';
  const cwd = redactPath(rawCwd);
  const branch = mostFrequent(acc.branches);
  const lastTitle = acc.titles.at(-1);
  const title = redact(lastTitle ?? acc.prompts[0] ?? '').slice(0, MAX_TITLE_CHARS);
  return {
    id: acc.id,
    title,
    cwd,
    branch: branch && branch !== 'HEAD' ? redactPath(branch) : null,
    startedAt: new Date(acc.start).toISOString(),
    endedAt: new Date(acc.end).toISOString(),
    prompts,
    files: relativeFiles(acc.files, rawCwd).map(redactPath),
  };
}

function relativeFiles(files: Iterable<string>, cwd: string): string[] {
  const out: string[] = [];
  for (const file of files) {
    const path = cwd && file.startsWith(cwd + sep) ? relative(cwd, file) : file;
    if (!out.includes(path)) out.push(path);
    if (out.length >= MAX_FILES) break;
  }
  return out;
}

function session(sessions: Map<string, Accumulator>, id: string): Accumulator {
  let acc = sessions.get(id);
  if (!acc) {
    acc = {
      id,
      titles: [],
      cwds: new Map(),
      branches: new Map(),
      start: Number.POSITIVE_INFINITY,
      end: Number.NEGATIVE_INFINITY,
      prompts: [],
      files: new Set(),
      inWindow: false,
    };
    sessions.set(id, acc);
  }
  return acc;
}

function inWindow(timestamp: string, window: { since: number; until: number }): boolean {
  const at = Date.parse(timestamp);
  return !Number.isNaN(at) && at >= window.since && at <= window.until;
}

function count(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function mostFrequent(map: Map<string, number>): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const [key, n] of map) {
    if (n > bestCount) {
      best = key;
      bestCount = n;
    }
  }
  return best;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
