import { withTestPostgres } from './test-postgres';

const command = Bun.argv.slice(2);
if (command.length === 0) throw new Error('a test command is required');

const exitCode = await withTestPostgres(process.env, async (env) => {
  const child = Bun.spawn(command, {
    cwd: process.cwd(),
    env,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const forwardSignal = (signal: NodeJS.Signals) => child.kill(signal);
  const interrupt = () => forwardSignal('SIGINT');
  const terminate = () => forwardSignal('SIGTERM');
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', terminate);
  try {
    return await child.exited;
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', terminate);
  }
});

process.exitCode = exitCode;
