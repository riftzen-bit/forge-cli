// Handlers that spawn background agents: generic runTask, parallel pool,
// code-intel shortcuts (review/explain/test), and the commit flow which
// uses a subagent to draft a commit message and then runs git commit.
//
// All of these go through runTaskWith when they need a single prompt →
// reply round-trip from a subagent.

import { runSubagent } from '../../../agent/subagent.js';
import {
  reviewTaskPrompt as reviewPrompt,
  explainTaskPrompt as explainPrompt,
  testTaskPrompt as testPrompt,
  commitTaskPrompt as commitPrompt,
  securityReviewTaskPrompt,
  prTaskPrompt,
  reviewPRTaskPrompt,
} from '../../../prompts/commands/index.js';
import { gitCommit, gitDiffStaged, isGitRepo } from '../../../agent/git.js';
import type { CommandCtx } from './ctx.js';

// Runs `prompt` via runSubagent, plumbing streaming events through the
// shared handlers and appending the final reply to history tagged with
// `tag`. Centralises the boilerplate shared by review/explain/test/commit.
export function makeRunTaskWith(ctx: CommandCtx) {
  return async (prompt: string, tag: string): Promise<void> => {
    ctx.beginBusy();
    try {
      const providerCfg = ctx.settings?.providers?.[ctx.getActiveProvider()] ?? {};
      const reply = await runSubagent(
        prompt,
        {
          model: ctx.getActiveModel(),
          effort: ctx.getActiveEffort(),
          locks: ctx.coordinator,
          agentTag: tag,
          provider: ctx.getActiveProvider(),
          providerConfig: providerCfg,
        },
        {
          onThinking: ctx.handleThinking,
          onToolStart: (ev) => ctx.handleToolStart(ev, tag),
          onToolResult: (r) => ctx.handleToolResult(r, tag),
        },
      );
      ctx.flushThinking();
      ctx.appendHistory({ role: 'assistant', text: `[${tag}] ${reply}` });
    } catch (err) {
      ctx.appendHistory({ role: 'error', text: (err as Error).message });
    } finally {
      ctx.endBusy();
    }
  };
}

export function makeRunTask(ctx: CommandCtx) {
  return async (task: string): Promise<void> => {
    ctx.appendHistory({ role: 'system', text: `spawning subagent: ${task}` });
    ctx.beginBusy();
    try {
      const providerCfg = ctx.settings?.providers?.[ctx.getActiveProvider()] ?? {};
      const reply = await runSubagent(
        task,
        {
          model: ctx.getActiveModel(),
          effort: ctx.getActiveEffort(),
          locks: ctx.coordinator,
          provider: ctx.getActiveProvider(),
          providerConfig: providerCfg,
        },
        {
          onThinking: ctx.handleThinking,
          onToolStart: (ev) => ctx.handleToolStart(ev, 'sub'),
          onToolResult: (r) => ctx.handleToolResult(r, 'sub'),
        },
      );
      ctx.flushThinking();
      ctx.appendHistory({ role: 'assistant', text: `[sub] ${reply}` });
    } catch (err) {
      ctx.appendHistory({ role: 'error', text: (err as Error).message });
    } finally {
      ctx.endBusy();
    }
  };
}

export function makeRunParallel(ctx: CommandCtx) {
  return async (tasks: string[]): Promise<void> => {
    ctx.setHistory((m) => [
      ...m,
      { role: 'system', text: `running ${tasks.length} agents concurrently` },
      ...tasks.map((td, i) => ({ role: 'user' as const, text: `[A${i + 1}] ${td}` })),
    ]);
    ctx.beginBusy();

    try {
      const providerCfg = ctx.settings?.providers?.[ctx.getActiveProvider()] ?? {};
      await ctx.pool.runParallel(
        tasks,
        {
          model: ctx.getActiveModel(),
          effort: ctx.getActiveEffort(),
          provider: ctx.getActiveProvider(),
          providerConfig: providerCfg,
        },
        (_i, tag, ev) => {
          if (ev.kind === 'toolStart') {
            ctx.handleToolStart({ id: ev.id, name: ev.tool, input: ev.input }, tag);
          } else if (ev.kind === 'toolResult') {
            ctx.handleToolResult(
              { id: ev.id, ok: ev.ok, ms: ev.ms, preview: ev.preview, lines: ev.lines },
              tag,
            );
          } else if (ev.kind === 'done') {
            const s = ctx.subStatsRef.current.get(tag);
            ctx.subStatsRef.current.delete(tag);
            ctx.removeSubPreview(tag);
            const secs = s ? ((Date.now() - s.startedAt) / 1000).toFixed(1) : '?';
            const n = s?.count ?? 0;
            const firstLine = ev.reply.split(/\r?\n/, 1)[0] ?? '';
            const digest = firstLine.length > 140 ? firstLine.slice(0, 137) + '...' : firstLine;
            ctx.setHistory((m) => [
              ...m,
              { role: 'system', text: `[${tag}] done  ${n} tool${n === 1 ? '' : 's'}  ${secs}s` },
              { role: 'assistant', text: `[${tag}] ${digest}` },
            ]);
          } else if (ev.kind === 'error') {
            ctx.subStatsRef.current.delete(tag);
            ctx.removeSubPreview(tag);
            ctx.appendHistory({ role: 'error', text: `[${tag}] ${ev.message}` });
          } else if (ev.kind === 'thinking') {
            ctx.handleThinking(ev.delta);
            ctx.pushSubDelta(tag, 'thinking', ev.delta);
          } else if (ev.kind === 'text') {
            ctx.pushSubDelta(tag, 'text', ev.delta);
          }
        },
      );
      ctx.flushThinking();
    } finally {
      ctx.endBusy();
    }
  };
}

export function makeHandleReview(ctx: CommandCtx, runTaskWith: (p: string, tag: string) => Promise<void>) {
  return async (target: string): Promise<void> => {
    const prompt = reviewPrompt(target);
    ctx.appendHistory({ role: 'system', text: `reviewing ${target || 'workspace'}...` });
    await runTaskWith(prompt, 'review');
  };
}

export function makeHandleExplain(ctx: CommandCtx, runTaskWith: (p: string, tag: string) => Promise<void>) {
  return async (target: string): Promise<void> => {
    const prompt = explainPrompt(target);
    ctx.appendHistory({ role: 'system', text: `explaining ${target}...` });
    await runTaskWith(prompt, 'explain');
  };
}

export function makeHandleTest(ctx: CommandCtx, runTaskWith: (p: string, tag: string) => Promise<void>) {
  return async (pattern: string): Promise<void> => {
    const prompt = testPrompt(pattern);
    ctx.appendHistory({ role: 'system', text: 'running tests...' });
    await runTaskWith(prompt, 'test');
  };
}

export function makeHandleSecurityReview(ctx: CommandCtx, runTaskWith: (p: string, tag: string) => Promise<void>) {
  return async (): Promise<void> => {
    if (!(await isGitRepo(ctx.cwd))) {
      ctx.appendHistory({ role: 'error', text: 'not a git repo' });
      return;
    }
    ctx.appendHistory({ role: 'system', text: 'running security review...' });
    await runTaskWith(securityReviewTaskPrompt(), 'secreview');
  };
}

export function makeHandlePR(ctx: CommandCtx, runTaskWith: (p: string, tag: string) => Promise<void>) {
  return async (base: string): Promise<void> => {
    if (!(await isGitRepo(ctx.cwd))) {
      ctx.appendHistory({ role: 'error', text: 'not a git repo' });
      return;
    }
    ctx.appendHistory({ role: 'system', text: `creating PR${base ? ' vs ' + base : ''}...` });
    await runTaskWith(prTaskPrompt(base || 'main'), 'pr');
  };
}

export function makeHandleReviewPR(ctx: CommandCtx, runTaskWith: (p: string, tag: string) => Promise<void>) {
  return async (num: string): Promise<void> => {
    ctx.appendHistory({ role: 'system', text: `reviewing PR${num ? ' #' + num : ''}...` });
    await runTaskWith(reviewPRTaskPrompt(num.trim()), 'prreview');
  };
}

// Drafts a commit message via subagent, then runs git commit with the
// cleaned message. The trailing fenced block (``` ... ```) wrapper is
// stripped so the commit buffer is clean even if the model emits fences.
export function makeHandleCommit(ctx: CommandCtx) {
  return async (): Promise<void> => {
    if (!(await isGitRepo(ctx.cwd))) {
      ctx.appendHistory({ role: 'error', text: 'not a git repo' });
      return;
    }
    const r = await gitDiffStaged(ctx.cwd);
    if (!r.ok || !r.stdout.trim()) {
      ctx.appendHistory({ role: 'system', text: 'no staged changes. run `git add` first.' });
      return;
    }
    const diff = r.stdout.length > 12000 ? r.stdout.slice(0, 12000) + '\n... (diff truncated)' : r.stdout;
    ctx.appendHistory({ role: 'system', text: 'generating commit message...' });
    ctx.beginBusy();
    try {
      const providerCfg = ctx.settings?.providers?.[ctx.getActiveProvider()] ?? {};
      const reply = await runSubagent(
        commitPrompt(diff),
        {
          model: ctx.getActiveModel(),
          effort: ctx.getActiveEffort(),
          locks: ctx.coordinator,
          agentTag: 'commit',
          provider: ctx.getActiveProvider(),
          providerConfig: providerCfg,
        },
        {
          onThinking: ctx.handleThinking,
          onToolStart: (ev) => ctx.handleToolStart(ev, 'commit'),
          onToolResult: (rr) => ctx.handleToolResult(rr, 'commit'),
        },
      );
      ctx.flushThinking();
      const msg = reply.replace(/^```[a-z]*\n?|```$/gim, '').trim();
      ctx.appendHistory({ role: 'assistant', text: 'proposed commit:\n\n' + msg });
      const commitRes = await gitCommit(ctx.cwd, msg);
      if (commitRes.ok) {
        const line = commitRes.stdout.split(/\r?\n/).find((l) => l.trim()) ?? 'committed';
        ctx.appendHistory({ role: 'system', text: `git: ${line}` });
      } else {
        ctx.appendHistory({
          role: 'error',
          text: `git commit failed: ${commitRes.stderr.trim() || commitRes.stdout.trim()}`,
        });
      }
    } catch (err) {
      ctx.appendHistory({ role: 'error', text: (err as Error).message });
    } finally {
      ctx.endBusy();
    }
  };
}
