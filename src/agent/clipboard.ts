// Cross-platform clipboard image capture. Saves the current clipboard image
// to a file under ~/.forge/clip/ and returns the absolute path. Returns
// null when the clipboard does not contain an image.
//
// - Windows: PowerShell + System.Windows.Forms.Clipboard.GetImage()
// - macOS:   pngpaste if installed, else osascript fallback
// - Linux:   wl-paste (Wayland) or xclip (X11) if available

import { spawn } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';

export type ClipboardResult = { ok: true; path: string } | { ok: false; reason: string };

function clipDir(): string {
  return join(homedir(), '.forge', 'clip');
}

function newPath(ext: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return join(clipDir(), `${ts}.${ext}`);
}

async function ensureNonEmpty(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isFile() && s.size > 0;
  } catch {
    return false;
  }
}

function run(cmd: string, args: string[], opts: { input?: string } = {}): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { windowsHide: true });
    let stderr = '';
    p.stderr.on('data', (b) => (stderr += b.toString()));
    p.on('error', () => resolve({ code: 1, stderr: 'spawn failed' }));
    p.on('close', (code) => resolve({ code: code ?? 0, stderr }));
    if (opts.input !== undefined) {
      p.stdin.write(opts.input);
      p.stdin.end();
    }
  });
}

async function captureWindows(): Promise<ClipboardResult> {
  await mkdir(clipDir(), { recursive: true });
  const out = newPath('png');
  // Clipboard.GetImage requires STA threading. PowerShell defaults to MTA
  // on Windows 10+, where GetImage() returns $null even with image data
  // present. The -Sta flag fixes this. Add-Type loads WinForms+Drawing.
  const safe = out.replace(/'/g, "''");
  const ps = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$img = [System.Windows.Forms.Clipboard]::GetImage()
if ($img -eq $null) { exit 2 }
$img.Save('${safe}', [System.Drawing.Imaging.ImageFormat]::Png)
$img.Dispose()
`;
  const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Sta', '-ExecutionPolicy', 'Bypass', '-Command', ps]);
  if (r.code === 2) return { ok: false, reason: 'clipboard does not contain an image' };
  if (r.code !== 0) return { ok: false, reason: r.stderr.trim() || 'powershell failed' };
  if (!(await ensureNonEmpty(out))) return { ok: false, reason: 'no image written' };
  return { ok: true, path: out };
}

async function captureMac(): Promise<ClipboardResult> {
  await mkdir(clipDir(), { recursive: true });
  const out = newPath('png');
  const r1 = await run('pngpaste', [out]);
  if (r1.code === 0 && (await ensureNonEmpty(out))) return { ok: true, path: out };
  // Fallback via osascript: writes the image data if clipboard is PICT/TIFF.
  const tmpTiff = join(tmpdir(), `forge-${Date.now()}.tiff`);
  const script = `set theFile to POSIX file "${tmpTiff}"
set f to open for access theFile with write permission
write (the clipboard as «class TIFF») to f
close access f`;
  const r2 = await run('osascript', ['-e', script]);
  if (r2.code !== 0) return { ok: false, reason: 'install pngpaste (brew install pngpaste) for image paste' };
  // Convert TIFF -> PNG via sips (built-in).
  const r3 = await run('sips', ['-s', 'format', 'png', tmpTiff, '--out', out]);
  if (r3.code !== 0 || !(await ensureNonEmpty(out))) return { ok: false, reason: 'sips conversion failed' };
  return { ok: true, path: out };
}

async function captureLinux(): Promise<ClipboardResult> {
  await mkdir(clipDir(), { recursive: true });
  const out = newPath('png');
  // Wayland: wl-paste --type image/png
  const wl = await run('wl-paste', ['--type', 'image/png']);
  if (wl.code === 0) {
    const r = await run('sh', ['-c', `wl-paste --type image/png > "${out}"`]);
    if (r.code === 0 && (await ensureNonEmpty(out))) return { ok: true, path: out };
  }
  // X11: xclip -selection clipboard -t image/png -o
  const r = await run('sh', ['-c', `xclip -selection clipboard -t image/png -o > "${out}"`]);
  if (r.code === 0 && (await ensureNonEmpty(out))) return { ok: true, path: out };
  return { ok: false, reason: 'install wl-clipboard (Wayland) or xclip (X11)' };
}

export async function captureClipboardImage(): Promise<ClipboardResult> {
  if (process.platform === 'win32') return captureWindows();
  if (process.platform === 'darwin') return captureMac();
  if (process.platform === 'linux') return captureLinux();
  return { ok: false, reason: `unsupported platform: ${process.platform}` };
}
