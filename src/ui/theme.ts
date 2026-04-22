export type ThemeName = 'dark' | 'light';

export type Theme = {
  claude: string;
  claudeShimmer: string;
  clawdBody: string;
  clawdBackground: string;
  permission: string;
  planMode: string;
  bashBorder: string;
  autoAccept: string;
  fastMode: string;
  promptBorder: string;
  subtle: string;
  suggestion: string;
  success: string;
  error: string;
  warning: string;
  text: string;
  inverseText: string;
  userMessageBackground: string;
  bashMessageBackground: string;
  diffAdded: string;
  diffRemoved: string;
  diffAddedDimmed: string;
  diffRemovedDimmed: string;
};

const darkTheme: Theme = {
  claude: 'rgb(215,119,87)',
  claudeShimmer: 'rgb(235,159,127)',
  clawdBody: 'rgb(215,119,87)',
  clawdBackground: 'rgb(0,0,0)',
  permission: 'rgb(177,185,249)',
  planMode: 'rgb(72,150,140)',
  bashBorder: 'rgb(253,93,177)',
  autoAccept: 'rgb(175,135,255)',
  fastMode: 'rgb(255,120,20)',
  promptBorder: 'rgb(136,136,136)',
  subtle: 'rgb(140,140,140)',
  suggestion: 'rgb(177,185,249)',
  success: 'rgb(78,186,101)',
  error: 'rgb(255,107,128)',
  warning: 'rgb(255,193,7)',
  text: 'rgb(255,255,255)',
  inverseText: 'rgb(0,0,0)',
  userMessageBackground: 'rgb(55,55,55)',
  bashMessageBackground: 'rgb(65,60,65)',
  diffAdded: 'rgb(34,92,43)',
  diffRemoved: 'rgb(122,41,54)',
  diffAddedDimmed: 'rgb(71,88,74)',
  diffRemovedDimmed: 'rgb(105,72,77)',
};

const lightTheme: Theme = {
  claude: 'rgb(215,119,87)',
  claudeShimmer: 'rgb(245,149,117)',
  clawdBody: 'rgb(215,119,87)',
  clawdBackground: 'rgb(245,245,245)',
  permission: 'rgb(87,105,247)',
  planMode: 'rgb(0,102,102)',
  bashBorder: 'rgb(255,0,135)',
  autoAccept: 'rgb(135,0,255)',
  fastMode: 'rgb(234,88,12)',
  promptBorder: 'rgb(153,153,153)',
  subtle: 'rgb(120,120,120)',
  suggestion: 'rgb(87,105,247)',
  success: 'rgb(44,122,57)',
  error: 'rgb(171,43,63)',
  warning: 'rgb(150,108,30)',
  text: 'rgb(0,0,0)',
  inverseText: 'rgb(255,255,255)',
  userMessageBackground: 'rgb(235,235,235)',
  bashMessageBackground: 'rgb(240,232,240)',
  diffAdded: 'rgb(105,219,124)',
  diffRemoved: 'rgb(255,168,180)',
  diffAddedDimmed: 'rgb(199,225,203)',
  diffRemovedDimmed: 'rgb(253,210,216)',
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
