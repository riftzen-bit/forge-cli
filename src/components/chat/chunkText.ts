// Splits a long string into fixed-width slices for line-by-line rendering
// inside Ink components. Used by SubagentPanel and StreamingPreview so the
// dynamic render region stays bounded even when the underlying text grows
// without limit during streaming.
//
// Iterates by code points (not UTF-16 units) so surrogate pairs (emoji)
// are never split. This does not fully solve visual width for CJK
// fullwidth or combining marks — for preview panels that's an acceptable
// trade-off since the goal is bounded height, not pixel-perfect columns.

export function chunkText(s: string, width: number): string[] {
  if (!s) return [];
  if (width <= 0) return [s];
  const out: string[] = [];
  const codePoints = Array.from(s);
  for (let i = 0; i < codePoints.length; i += width) {
    out.push(codePoints.slice(i, i + width).join(''));
  }
  return out;
}
