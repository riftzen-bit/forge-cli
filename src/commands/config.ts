import { loadSettings, saveSettings, type Settings } from '../config/settings.js';

type Opts = { get?: string; set?: string };

export async function configCommand(opts: Opts): Promise<void> {
  if (opts.get) {
    const s = await loadSettings();
    const val = (s as Record<string, unknown>)[opts.get];
    console.log(val ?? '(unset)');
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
    const value: unknown = raw === 'true' ? true : raw === 'false' ? false : raw;
    const next = await saveSettings({ [key]: value } as Partial<Settings>);
    console.log(JSON.stringify(next, null, 2));
    return;
  }
  const s = await loadSettings();
  console.log(JSON.stringify(s, null, 2));
}
