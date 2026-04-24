import { loadSettings, saveSettings, type Settings } from '../config/settings.js';

type Opts = { get?: string; set?: string };

// Parse a value string from `--set k=v`. Accepts booleans, integers, and
// JSON literals so `--set providers={"openrouter":{"baseURL":"..."}}`
// stores an object, not the raw JSON string. Bare strings pass through.
function parseValue(raw: string): unknown {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (/^-?\d+$/.test(raw)) return Number(raw);
  if (/^-?\d+\.\d+$/.test(raw)) return Number(raw);
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      /* fall through to string */
    }
  }
  return raw;
}

export async function configCommand(opts: Opts): Promise<void> {
  if (opts.get) {
    const s = await loadSettings();
    const val = (s as Record<string, unknown>)[opts.get];
    if (val === undefined) console.log('(unset)');
    else if (typeof val === 'object' && val !== null) console.log(JSON.stringify(val, null, 2));
    else console.log(val);
    return;
  }
  if (opts.set) {
    const idx = opts.set.indexOf('=');
    if (idx < 0) {
      console.error('use --set key=value');
      process.exitCode = 1;
      return;
    }
    const key = opts.set.slice(0, idx);
    const raw = opts.set.slice(idx + 1);
    const value = parseValue(raw);
    try {
      const next = await saveSettings({ [key]: value } as Partial<Settings>);
      console.log(JSON.stringify(next, null, 2));
    } catch (err) {
      console.error(`invalid value for "${key}": ${(err as Error).message}`);
      process.exitCode = 1;
    }
    return;
  }
  const s = await loadSettings();
  console.log(JSON.stringify(s, null, 2));
}
