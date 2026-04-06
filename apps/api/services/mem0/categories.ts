export type MemoryCategory = 'identity' | 'activity' | 'context' | 'experience' | 'preference';

export const MEMORY_CATEGORIES: MemoryCategory[] = [
  'identity',
  'activity',
  'context',
  'experience',
  'preference',
];

export const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  identity: 'Profil',
  activity: 'Aktivität',
  context: 'Kontext',
  experience: 'Erfahrung',
  preference: 'Präferenz',
};

export const CATEGORY_DESCRIPTIONS: Record<MemoryCategory, string> = {
  identity:
    'Persönliche Fakten: Name, Wahlkreis, Kreisverband, politische Funktion, Parteiebene, Fachgebiete',
  activity:
    'Zeitgebundene Ereignisse: laufende Anträge, Pressemitteilungen, Kampagnen, Parteitagstermine',
  context:
    'Laufende Situationen: aktuelle Projekte, AG-Arbeit, Koalitionsverhandlungen, politische Lagen',
  experience:
    'Erfahrungen und Lektionen: was bei Formaten gut ankam, Kampagnenerfahrungen, Erkenntnisse',
  preference:
    'Dauerhafte Präferenzen: Schreibstil, Tonalität, bevorzugte Formate, Zielgruppe, Sprachlevel',
};

const LEGACY_CATEGORY_MAP: Record<string, MemoryCategory> = {
  fact: 'identity',
  instruction: 'preference',
  context: 'context',
  preference: 'preference',
};

export function normalizeCategory(raw: string | null | undefined): MemoryCategory | null {
  if (!raw) return null;

  const lower = raw.toLowerCase().trim();

  if (MEMORY_CATEGORIES.includes(lower as MemoryCategory)) {
    return lower as MemoryCategory;
  }

  return LEGACY_CATEGORY_MAP[lower] ?? null;
}

/**
 * Group memories by category into markdown sections with German headers.
 * Used for both system prompt injection and persona compilation input.
 */
export function formatMemoriesByCategory(
  memories: Array<{ memory: string; category: MemoryCategory | null }>
): string {
  const grouped: Record<string, string[]> = {};

  for (const m of memories) {
    const cat = m.category ?? 'sonstiges';
    const label = m.category ? CATEGORY_LABELS[m.category] : 'Sonstiges';
    const key = `${cat}:${label}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(m.memory);
  }

  const categoryOrder: string[] = [
    ...MEMORY_CATEGORIES.map((c) => `${c}:${CATEGORY_LABELS[c]}`),
    ...Object.keys(grouped).filter((k) => !MEMORY_CATEGORIES.some((c) => k.startsWith(c))),
  ];

  const sections: string[] = [];

  for (const key of categoryOrder) {
    const items = grouped[key];
    if (!items?.length) continue;

    const label = key.split(':')[1];
    sections.push(`### ${label}\n${items.map((i) => `- ${i}`).join('\n')}`);
  }

  return sections.join('\n\n');
}
