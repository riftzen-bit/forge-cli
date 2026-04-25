export type ProviderId =
  | 'anthropic'
  | 'openrouter'
  | 'deepseek'
  | 'zai'
  | 'glm'
  | 'kimi'
  | 'nvidia'
  | 'openai'
  | 'gemini'
  | 'custom';

export type Provider = {
  id: ProviderId;
  label: string;
  baseURL: string;
  keyPrefixes?: string[];
  defaultModel: string;
  nativeAnthropic: boolean;
  // True when an interactive browser-based OAuth flow is wired for this
  // provider. Today only Anthropic is supported (via `claude setup-token`).
  // The login UI uses this flag to gate the OAuth method choice — flipping
  // a provider to true still requires implementing the actual flow.
  oauth: boolean;
  hint: string;
  notes?: string;
};

export const PROVIDERS: Provider[] = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    baseURL: '',
    keyPrefixes: ['sk-ant-'],
    defaultModel: 'claude-opus-4-7',
    nativeAnthropic: true,
    oauth: true,
    hint: 'Official Claude API. Get a key at console.anthropic.com.',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api',
    keyPrefixes: ['sk-or-'],
    defaultModel: 'anthropic/claude-sonnet-4.5',
    nativeAnthropic: true,
    oauth: false,
    hint: 'Many providers via one key. Prefix model with provider (e.g., anthropic/..., openai/...).',
    notes: 'Uses Anthropic Messages API shape. Works directly.',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/anthropic',
    keyPrefixes: ['sk-'],
    defaultModel: 'deepseek-chat',
    nativeAnthropic: true,
    oauth: false,
    hint: 'DeepSeek native Anthropic-compat endpoint.',
  },
  {
    id: 'zai',
    label: 'Z.ai (GLM)',
    baseURL: 'https://api.z.ai/api/anthropic',
    defaultModel: 'glm-4.6',
    nativeAnthropic: true,
    oauth: false,
    hint: 'Zhipu GLM via Anthropic-compat path.',
  },
  {
    id: 'glm',
    label: 'GLM (BigModel)',
    baseURL: 'https://open.bigmodel.cn/api/anthropic',
    defaultModel: 'glm-4.6',
    nativeAnthropic: true,
    oauth: false,
    hint: 'BigModel GLM Anthropic-compat endpoint.',
  },
  {
    id: 'kimi',
    label: 'Kimi (Moonshot)',
    baseURL: 'https://api.moonshot.ai/anthropic',
    keyPrefixes: ['sk-'],
    defaultModel: 'kimi-k2-turbo-preview',
    nativeAnthropic: true,
    oauth: false,
    hint: 'Moonshot Kimi Anthropic-compat endpoint.',
  },
  {
    id: 'nvidia',
    label: 'NVIDIA NIM',
    baseURL: 'http://localhost:4000',
    keyPrefixes: ['nvapi-'],
    defaultModel: 'nvidia/llama-3.1-nemotron-70b-instruct',
    nativeAnthropic: false,
    oauth: false,
    hint: 'NVIDIA NIM uses OpenAI format. Run LiteLLM proxy locally and point baseURL to it.',
    notes: 'Install LiteLLM: pip install litellm. Start: litellm --model nvidia/<id>. Default port 4000.',
  },
  {
    id: 'openai',
    label: 'OpenAI (via proxy)',
    baseURL: 'http://localhost:4000',
    keyPrefixes: ['sk-'],
    defaultModel: 'gpt-4o',
    nativeAnthropic: false,
    oauth: false,
    hint: 'OpenAI ChatCompletions. Needs LiteLLM (or similar) Anthropic-compat proxy.',
    notes: 'litellm --model openai/gpt-4o --api_key $OPENAI_API_KEY. Default port 4000.',
  },
  {
    id: 'gemini',
    label: 'Google Gemini (via proxy)',
    baseURL: 'http://localhost:4000',
    defaultModel: 'gemini-2.5-pro',
    nativeAnthropic: false,
    oauth: false,
    hint: 'Google Gemini via LiteLLM Anthropic-compat proxy. Use a Google AI Studio key.',
    notes: 'pip install litellm. Then: GEMINI_API_KEY=<key> litellm --model gemini/gemini-2.5-pro --port 4000. Native Google-account OAuth (Gemini-CLI style) is not yet wired — API key only.',
  },
  {
    id: 'custom',
    label: 'Custom',
    baseURL: '',
    defaultModel: '',
    nativeAnthropic: true,
    oauth: false,
    hint: 'Point at any Anthropic-Messages-compatible endpoint (LiteLLM, one-api, self-hosted).',
  },
];

export const DEFAULT_PROVIDER: ProviderId = 'anthropic';

export function getProvider(id: string): Provider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function providerFor(id: string): Provider {
  return getProvider(id) ?? PROVIDERS[0]!;
}

export function validateKey(provider: Provider, key: string): { ok: true } | { ok: false; reason: string } {
  const trimmed = key.trim();
  if (!trimmed) return { ok: false, reason: 'empty key' };
  const prefixes = provider.keyPrefixes;
  if (prefixes && prefixes.length > 0) {
    const matched = prefixes.some((p) => trimmed.startsWith(p));
    if (!matched) return { ok: false, reason: `key must start with ${prefixes.join(' or ')}` };
  }
  return { ok: true };
}
