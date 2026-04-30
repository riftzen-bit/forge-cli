export type ThemeName = 'dark' | 'light';

export type Theme = {
  accent: string;
  accentDim: string;
  warn: string;
  error: string;
  success: string;
  info: string;
  muted: string;
  text: string;
  inverse: string;
  selection: string;
  borderIdle: string;
  borderActive: string;
  diffAdd: string;
  diffDel: string;
  diffCtx: string;
  userBg: string;
  toolTag: string;
  // Permission-mode banner / border colors. One per non-default mode.
  modePlan: string;
  modeYolo: string;
  modeAutoAccept: string;
};

// Layout/chrome tokens. Kept separate from the color theme because they
// don't change between dark/light variants — they're a single source of
// truth for spacing + radius across all panels so we don't sprinkle magic
// numbers in every component.
export const Spacing = {
  xs: 0,
  sm: 1,
  md: 2,
  lg: 3,
} as const;

export type Radius = 'round' | 'single' | 'classic' | 'bold' | 'double';

export const Chrome = {
  radius: 'round' as Radius,
  paddingX: Spacing.sm,
  paddingY: Spacing.xs,
  panelGap: Spacing.sm,
} as const;

const darkTheme: Theme = {
  accent:       '#5fd7af',
  accentDim:    '#3fa37a',
  warn:         '#e6b450',
  error:        '#f07178',
  success:      '#a0e7a0',
  info:         '#7aa2f7',
  muted:        '#707070',
  text:         '#e6e6e6',
  inverse:      '#0a0a0a',
  selection:    '#2a2a2a',
  borderIdle:   '#3a3a3a',
  borderActive: '#5fd7af',
  diffAdd:      '#87d787',
  diffDel:      '#d78787',
  diffCtx:      '#8a8a8a',
  userBg:       '#2e3440',
  toolTag:      '#e6b450',
  modePlan:        '#5fafff',
  modeYolo:        '#ff5f5f',
  modeAutoAccept:  '#1f7a1f',
};

const lightTheme: Theme = {
  accent:       '#2a7f5f',
  accentDim:    '#4a9f7f',
  warn:         '#8a6d00',
  error:        '#a4001f',
  success:      '#1f7a1f',
  info:         '#0042a0',
  muted:        '#707070',
  text:         '#1a1a1a',
  inverse:      '#ffffff',
  selection:    '#e0e0e0',
  borderIdle:   '#b8b8b8',
  borderActive: '#2a7f5f',
  diffAdd:      '#1f7a1f',
  diffDel:      '#a4001f',
  diffCtx:      '#707070',
  userBg:       '#e0e4ec',
  toolTag:      '#8a6d00',
  modePlan:        '#0042a0',
  modeYolo:        '#a4001f',
  modeAutoAccept:  '#1f7a1f',
};

let current: Theme = darkTheme;
let currentName: ThemeName = 'dark';

export function setTheme(name: ThemeName): void {
  currentName = name;
  current = name === 'light' ? lightTheme : darkTheme;
}

export function getTheme(): Theme {
  return current;
}

export function getThemeName(): ThemeName {
  return currentName;
}
