import { homedir } from 'node:os';
import { join } from 'node:path';

const XDG = process.env.XDG_CONFIG_HOME;
export const CONFIG_DIR = XDG ? join(XDG, 'forge') : join(homedir(), '.forge');
export const SETTINGS_PATH = join(CONFIG_DIR, 'settings.json');
export const AUTH_PATH = join(CONFIG_DIR, 'auth.json');
