import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import { CONFIG_DIR, SETTINGS_PATH } from './paths.js';
import { DEFAULT_MODEL } from '../agent/models.js';
import { DEFAULT_EFFORT, EFFORT_LEVELS } from '../agent/effort.js';
import { DEFAULT_PROVIDER } from '../agent/providers.js';

export const PERMISSION_MODES = ['default', 'autoAccept', 'plan', 'yolo'] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];
export const DEFAULT_PERMISSION_MODE: PermissionMode = 'default';

// Cycle order for Shift+Tab.
export function nextPermissionMode(cur: PermissionMode): PermissionMode {
  const i = PERMISSION_MODES.indexOf(cur);
  if (i === -1) return DEFAULT_PERMISSION_MODE;
  return PERMISSION_MODES[(i + 1) % PERMISSION_MODES.length]!;
}

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

const ProviderConfigSchema = z.object({
  baseURL: z.string().optional(),
  defaultModel: z.string().optional(),
});

const SettingsSchema = z.object({
  defaultModel: z.string().default(DEFAULT_MODEL),
  effort: z.enum(EFFORT_LEVELS).default(DEFAULT_EFFORT),
  theme: z.enum(['dark', 'light']).default('dark'),
  telemetry: z.boolean().default(false),
  statusLine: z.string().optional(),
  activeProvider: z.string().default(DEFAULT_PROVIDER),
  providers: z.record(z.string(), ProviderConfigSchema).default({}),
  mcpServers: z.record(z.string(), McpServerSchema).default({}),
  permissionRules: z.array(PermissionRuleSchema).default([]),
  hooks: z.object({
    preTool: z.array(HookSchema).default([]),
    postTool: z.array(HookSchema).default([]),
  }).default({ preTool: [], postTool: [] }),
  inputHistory: z.object({
    enabled: z.boolean().default(true),
    max: z.number().int().positive().default(500),
  }).default({ enabled: true, max: 500 }),
  // Active permission mode. Replaces the legacy yolo/planMode booleans
  // (still parsed for backward compat in loadSettings). Cycle via Shift+Tab.
  //   default     — auto-allow edits, never prompt (current safe baseline)
  //   autoAccept  — prompt user before any tool call (3 choices)
  //   plan        — read-only, no edits or shell mutations
  //   yolo        — bypass ALL permission checks
  permissionMode: z.enum(PERMISSION_MODES).default(DEFAULT_PERMISSION_MODE),
  // Legacy fields kept so older settings.json files don't fail validation.
  // loadSettings() migrates them into permissionMode.
  yolo: z.boolean().default(false),
  planMode: z.boolean().default(false),
});

export type Settings = z.infer<typeof SettingsSchema>;
export type PermissionRule = z.infer<typeof PermissionRuleSchema>;
export type Hook = z.infer<typeof HookSchema>;
export type McpServer = z.infer<typeof McpServerSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

const DEFAULTS: Settings = {
  defaultModel: DEFAULT_MODEL,
  effort: DEFAULT_EFFORT,
  theme: 'dark',
  telemetry: false,
  activeProvider: DEFAULT_PROVIDER,
  providers: {},
  mcpServers: {},
  permissionRules: [],
  hooks: { preTool: [], postTool: [] },
  inputHistory: { enabled: true, max: 500 },
  permissionMode: DEFAULT_PERMISSION_MODE,
  yolo: false,
  planMode: false,
};

// Old settings files (pre-permissionMode) used `yolo` and `planMode`
// booleans. Promote them into `permissionMode` so users don't have to
// retoggle. yolo wins over planMode if both true (matches old behavior).
// Clear the legacy flags so they don't linger after migration and drift
// out of sync when the user later changes permissionMode.
function migrateLegacy(s: Settings): Settings {
  if (s.permissionMode !== 'default') {
    if (s.yolo || s.planMode) return { ...s, yolo: false, planMode: false };
    return s;
  }
  if (s.yolo) return { ...s, permissionMode: 'yolo', yolo: false, planMode: false };
  if (s.planMode) return { ...s, permissionMode: 'plan', yolo: false, planMode: false };
  return s;
}

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await readFile(SETTINGS_PATH, 'utf8');
    return migrateLegacy(SettingsSchema.parse(JSON.parse(raw)));
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
