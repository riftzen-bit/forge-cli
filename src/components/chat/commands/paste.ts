// /paste — capture the OS clipboard image, save under ~/.forge/clip/, and
// queue it as an attachment on the AgentClient. The marker is prepended to
// the next user message so the model knows to Read the path.

import { captureClipboardImage } from '../../../agent/clipboard.js';
import type { CommandCtx } from './ctx.js';

export function makeHandlePaste(ctx: CommandCtx) {
  return async (): Promise<string> => {
    const r = await captureClipboardImage();
    if (!r.ok) return `paste failed: ${r.reason}`;
    ctx.client.attachImage(r.path);
    return `attached image: ${r.path} (sends with next message)`;
  };
}
