// UI taste guidelines. Loaded only when the active turn mentions UI work
// (the dynamic selector keys on /\b(ui|ux|design|css|html|jsx|tsx|tailwind|figma|landing|component|page|layout|style)\b/i).
//
// Always-on inclusion was costing 1.2KB / ~300 tokens on every backend or
// CLI turn — a clear regression for the 95% of tasks that do not produce
// UI code. Keep this piece short and concrete; if the model needs more
// detail it can ask.

export const DESIGN_TASTE = `# UI taste — avoid the AI-generated look

Default to restrained, professional design. Common smell to avoid: rainbow gradients, glassmorphism stacks, neon accents, multi-layer shadows, six font weights per screen, animated borders, parallax heroes.

Per-surface limits (default; user override wins):
- Colors: ≤ 4 swatches per section (bg, fg, muted, one accent). One accent per design, not per card.
- Gradients: avoid. If genuinely needed, two stops, small hue delta.
- Shadows: ≤ 1 elevation per surface. Never four-layer neumorphic stacks.
- Border radius: one scale (e.g. 4 / 8 / 12) used consistently.
- Fonts: ≤ 2 families, ≤ 3 weights (400/500/700).
- Spacing: 4px or 8px base; no arbitrary 13/17/23.

Banned by default (require explicit user request): glassmorphism, neon glow, animated gradient backgrounds, particles, bouncy/spring motion, auto-rotating carousels, decorative emojis in headers.

Lean toward: generous whitespace, hierarchy via size+weight (not color), greyscale baseline + one accent, alignment over decoration. When user says "modern" / "premium" / "beautiful" they mean calm and considered, not more effects.`;
