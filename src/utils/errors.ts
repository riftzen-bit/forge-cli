export function handleFatal(err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`\nforge: fatal: ${msg}\n`);
  if (process.env.FORGE_DEBUG && err instanceof Error && err.stack) {
    process.stderr.write(err.stack + '\n');
  }
  process.exit(1);
}
