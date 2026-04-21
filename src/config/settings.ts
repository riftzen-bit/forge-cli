import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import { CONFIG_DIR, SETTINGS_PATH } from './paths.js';
import { DEFAULT_MODEL } from '../agent/models.js';
import { DEFAULT_EFFORT, EFFORT_LEVELS } from '../agent/effort.js';

const McpServerSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

const PermissionRuleSchema = z.object({
  tool: z.string(),
  match: z.string().optional(),
  decision: z.enum(['allow', 'deny']),
});

const HookSchema = z.object({
  match: z.string(),
  run: z.string(),
});

const SettingsSchema = z.object({
  defaultModel: z.string().default(DEFAULT_MODEL),
  effort: z.enum(EFFORT_LEVELS).default(DEFAULT_EFFORT),
  theme: z.enum(['dark', 'light']).default('dark'),
  telemetry: z.boolean().default(false),
  statusLine: z.string().optional(),
  mcpServers: z.record(z.string(), McpServerSchema).default({}),
  permissionRules: z.array(PermissionRuleSchema).default([]),
  hooks: z.object({
    preTool: z.array(HookSchema).default([]),
    postTool: z.array(HookSchema).default([]),
  }).default({ preTool: [], postTool: [] }),
});

export type Settings = z.infer<typeof SettingsSchema>;
export type PermissionRule = z.infer<typeof PermissionRuleSchema>;
export type Hook = z.infer<typeof HookSchema>;
export type McpServer = z.infer<typeof McpServerSchema>;

const DEFAULTS: Settings = {
  defaultModel: DEFAULT_MODEL,
  effort: DEFAULT_EFFORT,
  theme: 'dark',
  telemetry: false,
  mcpServers: {},
  permissionRules: [],
  hooks: { preTool: [], postTool: [] },
};

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await readFile(SETTINGS_PATH, 'utf8');
    return SettingsSchema.parse(JSON.parse(raw));
  } catch {
    return DEFAULTS;
  }
}

export async function saveSettings(next: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings();
  const merged = SettingsSchema.parse({ ...current, ...next });
  await mkdir(dirname(SETTINGS_PATH), { recursive: true });
  await writeFile(SETTINGS_PATH, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

export { CONFIG_DIR };
