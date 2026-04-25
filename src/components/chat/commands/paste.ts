// /paste — clipboard image attach + manage pending attachments.
//
// Subcommands:
//   /paste              capture clipboard image into pending attachments
//   /paste list         show queued attachments
//   /paste clear        drop all queued attachments
//   /paste rm <n>       drop attachment at index n (1-based)

import { captureClipboardImage } from '../../../agent/clipboard.js';
import type { CommandCtx } from './ctx.js';

export function makeHandlePaste(ctx: CommandCtx) {
  return async (args = ''): Promise<string> => {
    const [sub, ...rest] = args.trim().split(/\s+/);
    switch (sub) {
      case '':
      case 'add':
      case 'capture': {
        const r = await captureClipboardImage();
        if (!r.ok) return `paste failed: ${r.reason}`;
        ctx.client.attachImage(r.path);
        ctx.bumpAttachmentTick();
        const n = ctx.client.getAttachments().length;
        return `attached image: ${r.path}\n${n} attachment${n === 1 ? '' : 's'} pending — sends with next message (clear: /paste clear)`;
      }
      case 'list': {
        const items = ctx.client.getAttachments();
        if (items.length === 0) return 'no pending attachments';
        return items
          .map((a, i) => `  ${i + 1}. [${a.kind}] ${a.path}`)
          .join('\n');
      }
      case 'clear': {
        const n = ctx.client.getAttachments().length;
        ctx.client.clearAttachments();
        ctx.bumpAttachmentTick();
        return `cleared ${n} attachment${n === 1 ? '' : 's'}`;
      }
      case 'rm': {
        const idx = Number(rest[0]);
        if (!Number.isInteger(idx) || idx < 1) return 'usage: /paste rm <n>  (n is 1-based, see /paste list)';
        const ok = ctx.client.removeAttachment(idx - 1);
        if (ok) ctx.bumpAttachmentTick();
        return ok ? `removed attachment ${idx}` : `no attachment at index ${idx}`;
      }
      default:
        return 'usage: /paste [add | list | clear | rm <n>]';
    }
  };
}
