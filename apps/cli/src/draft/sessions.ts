import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { redact } from './redact';

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

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_PROMPTS = 5;
const MAX_PROMPT_CHARS = 300;
const MAX_TITLE_CHARS = 120;
const MAX_FILES = 20;
const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const REMINDER = /<system-reminder>[\s\S]*?<\/system-reminder>/g;

export async function readSessions(input: ReadSessionsInput): Promise<SessionSummary[]> {
  const env = input.env ?? process.env;
  if (env.STANDCAST_SESSIONS === 'off') return [];
  try {
    const dir = input.dir ?? env.STANDCAST_CLAUDE_DIR ?? join(homedir(), '.claude', 'projects');
    const window = { since: input.since.getTime(), until: input.until.getTime() };
    const sessions = new Map<string, Accumulator>();
    for (const file of await sessionFiles(dir, window.since)) {
      await readFile(file, window, sessions);
    }
    return [...sessions.values()]
      .map(summarize)
      .filter((s): s is SessionSummary => s !== null)
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  } catch {
    return [];
  }
}

async function sessionFiles(dir: string, since: number): Promise<string[]> {
  const files: string[] = [];
  for (const project of await safeReaddir(dir)) {
    const projectDir = join(dir, project);
    for (const name of await safeReaddir(projectDir)) {
      if (!name.endsWith('.jsonl')) continue;
      const path = join(projectDir, name);
      try {
        const info = await stat(path);
        if (!info.isFile() || info.size > MAX_FILE_BYTES || info.mtimeMs < since) continue;
        files.push(path);
      } catch {}
    }
  }
  return files.sort();
}

async function safeReaddir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

async function readFile(
  path: string,
  window: { since: number; until: number },
  sessions: Map<string, Accumulator>,
): Promise<void> {
  try {
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of Bun.file(path).stream()) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) handleLine(line, window, sessions);
    }
    buffer += decoder.decode();
    handleLine(buffer, window, sessions);
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
    if (line.isMeta === true || acc.prompts.length >= MAX_PROMPTS) return;
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
  let text: string;
  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    text = content
      .filter((b): b is { type: 'text'; text: string } => isRecord(b) && b.type === 'text')
      .filter((b) => typeof b.text === 'string')
      .map((b) => b.text)
      .join('\n');
  } else {
    return null;
  }
  const head = text.trimStart();
  if (head.startsWith('<command-') || head.startsWith('<local-command-')) return null;
  const clean = text.replace(REMINDER, '').trim();
  return clean ? clean : null;
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
  const cwd = mostFrequent(acc.cwds) ?? '';
  const branch = mostFrequent(acc.branches);
  const lastTitle = acc.titles.at(-1);
  const title = lastTitle
    ? redact(lastTitle)
    : redact(acc.prompts[0] ?? '').slice(0, MAX_TITLE_CHARS);
  return {
    id: acc.id,
    title,
    cwd,
    branch: branch && branch !== 'HEAD' ? branch : null,
    startedAt: new Date(acc.start).toISOString(),
    endedAt: new Date(acc.end).toISOString(),
    prompts,
    files: relativeFiles(acc.files, cwd),
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
