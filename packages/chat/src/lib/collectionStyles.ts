export const COLLECTION_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  deutschland: {
    color: 'var(--color-collection-grundsatzprogramm)',
    bg: 'var(--color-collection-grundsatzprogramm-bg)',
    label: 'Grundsatzprogramm',
  },
  bundestagsfraktion: {
    color: 'var(--color-collection-bundestagsfraktion)',
    bg: 'var(--color-collection-bundestagsfraktion-bg)',
    label: 'Bundestagsfraktion',
  },
  'gruene-de': {
    color: 'var(--color-collection-gruene-de)',
    bg: 'var(--color-collection-gruene-de-bg)',
    label: 'gruene.de',
  },
  kommunalwiki: {
    color: 'var(--color-collection-kommunalwiki)',
    bg: 'var(--color-collection-kommunalwiki-bg)',
    label: 'Kommunalwiki',
  },
  web: {
    color: 'var(--color-collection-web)',
    bg: 'var(--color-collection-web-bg)',
    label: 'Web',
  },
  research: {
    color: 'var(--color-collection-research)',
    bg: 'var(--color-collection-research-bg)',
    label: 'Recherche',
  },
  research_synthesis: {
    color: 'var(--color-collection-research)',
    bg: 'var(--color-collection-research-bg)',
    label: 'Recherche',
  },
  hamburg: {
    color: 'var(--color-collection-landesverband)',
    bg: 'var(--color-collection-landesverband-bg)',
    label: 'Hamburg',
  },
  'schleswig-holstein': {
    color: 'var(--color-collection-landesverband)',
    bg: 'var(--color-collection-landesverband-bg)',
    label: 'Schleswig-Holstein',
  },
  thueringen: {
    color: 'var(--color-collection-landesverband)',
    bg: 'var(--color-collection-landesverband-bg)',
    label: 'Thüringen',
  },
  bayern: {
    color: 'var(--color-collection-landesverband)',
    bg: 'var(--color-collection-landesverband-bg)',
    label: 'Bayern',
  },
  oesterreich: {
    color: 'var(--color-collection-oesterreich)',
    bg: 'var(--color-collection-oesterreich-bg)',
    label: 'Österreich',
  },
  'boell-stiftung': {
    color: 'var(--color-collection-boell)',
    bg: 'var(--color-collection-boell-bg)',
    label: 'Böll-Stiftung',
  },
  examples: {
    color: 'var(--color-collection-examples)',
    bg: 'var(--color-collection-examples-bg)',
    label: 'Beispiele',
  },
};

const DEFAULT_STYLE = {
  color: 'var(--color-foreground-muted)',
  bg: 'var(--color-surface)',
  label: '',
};

export function getCollectionKey(source: string): string {
  return source.startsWith('gruenerator:') ? source.slice('gruenerator:'.length) : source;
}

export function getCollectionStyle(source: string) {
  const key = getCollectionKey(source);
  return COLLECTION_STYLES[key] || { ...DEFAULT_STYLE, label: source };
}

export function getRelevanceColor(relevance: number | undefined): string {
  if (relevance == null) return 'var(--color-foreground-muted)';
  if (relevance >= 0.7) return 'var(--color-relevance-high)';
  if (relevance >= 0.4) return 'var(--color-relevance-medium)';
  return 'var(--color-relevance-low)';
}
