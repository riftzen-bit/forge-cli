// Handlers that reshape the session: swap model, effort, provider, or
// resume target; toggle plan mode; run the context-compact flow; clear the
// visible screen. These do not spawn agent work themselves (other than
// compact, which talks to the client directly).

import { labelFor } from '../../../agent/models.js';
import { providerFor } from '../../../agent/providers.js';
import { saveSettings, nextPermissionMode, type PermissionMode } from '../../../config/settings.js';
import { loadSessionMessages, type SessionSummary } from '../../../session/store.js';
import type { Effort } from '../../../agent/effort.js';
import type { CommandCtx } from './ctx.js';

export function makeApplyModel(ctx: CommandCtx) {
  return async (id: string): Promise<void> => {
    ctx.client.setModel(id);
    ctx.setActiveModel(id);
    ctx.setPicker('none');
    ctx.appendHistory({ role: 'system', text: `model -> ${labelFor(id)}` });
    try {
      await saveSettings({ defaultModel: id });
    } catch {
      /* best-effort */
    }
  };
}

export function makeApplyEffort(ctx: CommandCtx) {
  return async (e: Effort): Promise<void> => {
    ctx.client.setEffort(e);
    ctx.setActiveEffort(e);
    ctx.setPicker('none');
    ctx.appendHistory({ role: 'system', text: `effort -> ${e}` });
    try {
      await saveSettings({ effort: e });
    } catch {
      /* best-effort */
    }
  };
}

export function makeApplyResume(ctx: CommandCtx) {
  return async (s: SessionSummary): Promise<void> => {
    ctx.client.queueResume(s.id);
    ctx.setPicker('none');
    let restored: number;
    try {
      const past = await loadSessionMessages(s.file);
      ctx.setHistory(past);
      restored = past.length;
    } catch {
      ctx.setHistory([]);
      restored = 0;
    }
    ctx.appendHistory({
      role: 'system',
      text: restored > 0
        ? `resumed ${s.id.slice(0, 8)} -- ${restored} message${restored === 1 ? '' : 's'} restored, type to continue`
        : `resuming ${s.id.slice(0, 8)} -- next message continues it`,
    });
  };
}

export function makeApplyProvider(ctx: CommandCtx) {
  return async (id: string): Promise<void> => {
    const p = providerFor(id);
    const cfg = ctx.settings?.providers?.[id] ?? {};
    ctx.client.setProvider(id, cfg);
    ctx.setActiveProvider(id);
    ctx.setPicker('none');
    try {
      await saveSettings({ activeProvider: id });
    } catch {
      /* best-effort */
    }
    const hasKey = ctx.providerKeys.has(id);
    const lines: string[] = [`provider -> ${p.label}`];
    if (!hasKey) {
      lines.push(`no key for ${p.label}. run outside chat: forge login --provider ${id}`);
    }
    if (!p.nativeAnthropic && !cfg.baseURL && !p.baseURL) {
      lines.push(`needs proxy URL. run: forge set baseurl <url> --provider ${id}`);
    }
    ctx.appendHistory({ role: 'system', text: lines.join('\n') });
    void ctx.refreshProviderKeys();
  };
}

export function makeRunCompact(ctx: CommandCtx) {
  return async (): Promise<void> => {
    ctx.appendHistory({ role: 'system', text: 'compacting...' });
    ctx.beginBusy();
    try {
      await ctx.client.compact({
        onTokens: ctx.handleTokens,
        onCompactRun: (before, after) => {
          ctx.appendHistory({
            role: 'system',
            text: `compacted ${before.toLocaleString()} -> ${after.toLocaleString()} tok`,
          });
        },
      });
      ctx.setTokens(ctx.client.getTokenTotal());
    } catch (err) {
      ctx.appendHistory({ role: 'error', text: (err as Error).message });
    } finally {
      ctx.endBusy();
    }
  };
}

function applyMode(ctx: CommandCtx, mode: PermissionMode): void {
  ctx.setPermissionMode(mode);
  ctx.client.setPermissionMode(mode);
  void saveSettings({ permissionMode: mode }).catch(() => {});
}

function describeMode(mode: PermissionMode): string {
  switch (mode) {
    case 'default':    return 'default mode -- edits auto-allowed, no prompts';
    case 'autoAccept': return 'autoAccept mode -- prompts before each tool call (Yes / Yes-Allow-Session / No)';
    case 'plan':       return 'plan mode on -- no edits will execute';
    case 'yolo':       return 'YOLO on -- ALL permissions bypassed. use with caution.';
  }
}

export function makeTogglePlan(ctx: CommandCtx) {
  return (): string => {
    const next: PermissionMode = ctx.getPermissionMode() === 'plan' ? 'default' : 'plan';
    applyMode(ctx, next);
    return describeMode(next);
  };
}

export function makeToggleYolo(ctx: CommandCtx) {
  return (): string => {
    const next: PermissionMode = ctx.getPermissionMode() === 'yolo' ? 'default' : 'yolo';
    applyMode(ctx, next);
    return describeMode(next);
  };
}

export function makeToggleAutoAccept(ctx: CommandCtx) {
  return (): string => {
    const next: PermissionMode = ctx.getPermissionMode() === 'autoAccept' ? 'default' : 'autoAccept';
    applyMode(ctx, next);
    return describeMode(next);
  };
}

// Cycle default → autoAccept → plan → yolo → default. Bound to Shift+Tab.
export function makeCyclePermissionMode(ctx: CommandCtx) {
  return (): string => {
    const next = nextPermissionMode(ctx.getPermissionMode());
    applyMode(ctx, next);
    return describeMode(next);
  };
}

export function makeHandleClearScreen(ctx: CommandCtx) {
  return (): void => {
    // Full terminal clear (ESC c) plus scrollback clear (ESC [ 3 J).
    process.stdout.write('\x1Bc\x1B[3J');
    ctx.setHistory([]);
    ctx.setRenderEpoch((n) => n + 1);
  };
}
