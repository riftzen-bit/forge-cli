// Splits a long string into fixed-width slices for line-by-line rendering
// inside Ink components. Used by SubagentPanel and StreamingPreview so the
// dynamic render region stays bounded even when the underlying text grows
// without limit during streaming.

export function chunkText(s: string, width: number): string[] {
  if (!s) return [];
  const out: string[] = [];
  for (let i = 0; i < s.length; i += width) out.push(s.slice(i, i + width));
  return out;
}
