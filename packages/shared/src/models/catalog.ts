export type Provider = 'mistral' | 'litellm' | 'regolo';

export type ModelId =
  | 'mistral-medium-3.5'
  | 'litellm'
  | 'gemma-litellm'
  | 'qwen-regolo'
  | 'qwen3.6-regolo';

export type ModelRegion = 'eu' | 'us' | 'cn' | 'self-hosted';

export type ModelIcon = 'sparkles' | 'server' | 'zap' | 'brain';

export interface ModelOption {
  id: ModelId;
  name: string;
  description: string;
  model: string;
  provider: Provider;
  icon: ModelIcon;
  region: ModelRegion;
  warning?: string;
  offByDefault?: boolean;
}

export const QWEN_WARNING =
  'Chinesisches Modell – unterliegt staatlicher Zensur. Antworten zu politisch sensiblen Themen können eingeschränkt sein.';

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: 'gemma-litellm',
    name: '🌳 Gemma 4',
    description: 'Leichtgewichtig, antwortet schnell',
    model: 'gpt-oss:120b',
    provider: 'litellm',
    icon: 'zap',
    region: 'self-hosted',
  },
  {
    id: 'mistral-medium-3.5',
    name: '⭐ Mistral Medium',
    description: 'EU-gehostet, ausgewogen für allgemeine Aufgaben',
    model: 'mistral-medium-2604',
    provider: 'mistral',
    icon: 'sparkles',
    region: 'eu',
  },
  {
    id: 'litellm',
    name: '🌳 GPT-OSS',
    description: 'Selbst gehostet bei Verdigado, Regolo als Overflow',
    model: 'gpt-oss:120b',
    provider: 'litellm',
    icon: 'server',
    region: 'self-hosted',
  },
  {
    id: 'qwen-regolo',
    name: 'Qwen 120B',
    description: 'Groß & vielseitig, für komplexe Aufgaben',
    model: 'qwen3.5-122b',
    provider: 'regolo',
    icon: 'brain',
    region: 'cn',
    offByDefault: true,
    warning: QWEN_WARNING,
  },
  {
    id: 'qwen3.6-regolo',
    name: 'Qwen 3.6 27B',
    description: 'Kompaktes Reasoning-Modell, denkt sichtbar mit',
    model: 'qwen3.6-27b',
    provider: 'regolo',
    icon: 'brain',
    region: 'cn',
    offByDefault: true,
    warning: QWEN_WARNING,
  },
];

export const MODEL_BY_ID: Record<ModelId, ModelOption> = MODEL_OPTIONS.reduce(
  (acc, m) => {
    acc[m.id] = m;
    return acc;
  },
  {} as Record<ModelId, ModelOption>
);

export const ALL_MODEL_IDS: ModelId[] = MODEL_OPTIONS.map((m) => m.id);

export function isModelEnabledByDefault(id: ModelId): boolean {
  return !MODEL_BY_ID[id]?.offByDefault;
}

export const REGION_LABELS: Record<ModelRegion, string> = {
  'self-hosted': 'Selbst gehostet',
  eu: 'EU',
  us: 'USA',
  cn: 'Chinesisch',
};

export const REGION_ORDER: ModelRegion[] = ['self-hosted', 'eu', 'us', 'cn'];
