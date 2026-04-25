// Central glyph dictionary. One source of truth so the visual identity
// stays consistent — never type a literal '✓' / '●' / '◇' inline in a
// component, pull it from here instead. Substitutes for older ASCII
// markers ('● ', '* ', '[ ] ') that read as "rough" terminal-90s.
//
// All glyphs are single-cell unicode points that render in modern
// Windows Terminal, iTerm2, Alacritty, Kitty, and gnome-terminal. The
// few box-drawing chars used (├ └ ─) are POSIX standard, no surprises.

export const G = {
  // Identity / brand
  star: '✦',           // streaming preview, banner accent, ready state
  diamond: '◆',         // assistant role marker
  diamondHollow: '◇',   // plan-mode marker
  hexagon: '⬢',         // yolo-mode marker
  squareDotted: '⊡',    // auto-accept marker

  // Tool status — always single-cell, semantic, color-paired
  toolRun: '▸',         // pending / running
  toolOk: '✓',
  toolErr: '✗',
  toolQueued: '⏵',

  // Conversation flow
  prompt: '❯',          // user input prompt + 'you' badge
  prefixYou: '❯',
  prefixForge: '✦',

  // Todos
  todoPending: '○',
  todoDoing: '◐',
  todoDone: '●',

  // Tree / list connectors
  branch: '├',
  branchEnd: '└',
  branchVert: '│',
  hr: '─',
  arrow: '→',
  bullet: '·',
  ellipsis: '…',
} as const;

// Spinner frames. Smooth braille rotation, 10 frames at 80–120ms cadence
// reads as a continuous arc — much more "alive" than '| / - \'.
export const SPINNER_BRAILLE: readonly string[] = [
  '⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏',
];

// Pulse for streaming text (filling/emptying disk). Slower cadence, gives
// the live preview a heartbeat without competing with the active-tool
// spinner for attention.
export const PULSE: readonly string[] = ['◌', '◍', '◎', '●', '◎', '◍'];

// Unicode block ladder for context-fill bars. Eight steps per cell yields
// 8× resolution vs '#'/'.' ASCII at the same width.
export const BLOCK_FILL: readonly string[] = [
  ' ', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█',
];
