export type ClassifiedError = {
  category: 'auth' | 'quota' | 'rate-limit' | 'network' | 'server' | 'not-found' | 'unknown';
  retryable: boolean;
  hint?: string;
  message: string;
};

const PATTERNS: Array<{ re: RegExp; category: ClassifiedError['category']; retryable: boolean; hint?: string }> = [
  { re: /\b401\b|unauthori[sz]ed|invalid.*key|authentication_error/i, category: 'auth', retryable: false, hint: 'run: /logout then /login (or /provider to pick one)' },
  { re: /\b403\b|forbidden|permission_denied/i, category: 'auth', retryable: false, hint: 'key lacks access. check provider dashboard.' },
  { re: /\b429\b|rate.?limit|too many requests/i, category: 'rate-limit', retryable: true, hint: 'backing off; will retry' },
  { re: /quota|insufficient_quota|credit.*exceeded|billing/i, category: 'quota', retryable: false, hint: 'credit exhausted. top up or /provider to switch.' },
  { re: /ECONN(REFUSED|RESET)|ENOTFOUND|ETIMEDOUT|fetch.failed|network|socket hang up/i, category: 'network', retryable: true, hint: 'network glitch; will retry' },
  { re: /\b5\d{2}\b|internal.*server.*error|bad gateway|service unavailable|overloaded/i, category: 'server', retryable: true, hint: 'provider 5xx; will retry' },
  { re: /\b404\b|not.?found/i, category: 'not-found', retryable: false, hint: 'model id or path wrong. /model to pick.' },
];

export function classifyError(err: unknown): ClassifiedError {
  const msg = err instanceof Error ? err.message : String(err);
  for (const p of PATTERNS) {
    if (p.re.test(msg)) {
      const out: ClassifiedError = {
        category: p.category,
        retryable: p.retryable,
        message: msg,
      };
      if (p.hint) out.hint = p.hint;
      return out;
    }
  }
  return { category: 'unknown', retryable: false, message: msg };
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { max?: number; onAttempt?: (n: number, err: ClassifiedError) => void } = {},
): Promise<T> {
  const max = opts.max ?? 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const c = classifyError(err);
      if (!c.retryable || attempt === max) throw err;
      opts.onAttempt?.(attempt, c);
      const delay = Math.min(8000, 500 * Math.pow(2, attempt - 1)) + Math.random() * 250;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
