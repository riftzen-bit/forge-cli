// /explain — explain a file or range of lines.

export function explainTaskPrompt(target: string): string {
  const m = target.match(/^(.+?):(\d+)(?:-(\d+))?$/);
  if (m) {
    const [, path, a, b] = m;
    const range = b ? `lines ${a}-${b}` : `line ${a}`;
    return `Explain ${range} of ${path}.

Read the file (and any imports/callers you need). Explain:
  1. What the code does.
  2. Why it exists (invariants, edge cases).
  3. How it interacts with surrounding code.

Be concise. Plain prose. Reference exact identifiers. No preamble.`;
  }
  return `Explain ${target}.

Read the file and relevant imports/callers. Cover purpose, data flow, key invariants.
Plain prose, no preamble, reference exact identifiers.`;
}
