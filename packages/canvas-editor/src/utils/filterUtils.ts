import { type IconDef } from './canvasIcons';
import { type IllustrationDef } from './illustrations/types';
import { getEnglishSearchTerms } from './searchTranslations';

export function matchesQuery(query: string, ...fields: (string | string[] | undefined)[]): boolean {
  const q = query.toLowerCase();
  return fields.some((field) => {
    if (!field) return false;
    if (Array.isArray(field)) return field.some((t) => t.toLowerCase().includes(q));
    return field.toLowerCase().includes(q);
  });
}

export function filterIllustrations(
  illustrations: IllustrationDef[],
  query: string
): IllustrationDef[] {
  if (!query.trim()) return illustrations;

  const q = query.toLowerCase();
  const englishTerms = getEnglishSearchTerms(q);

  return illustrations.filter((ill) => {
    const nameLower = ill.name.toLowerCase();
    if (nameLower.includes(q)) return true;
    if (ill.tags.some((tag) => tag.toLowerCase().includes(q))) return true;
    if (
      ill.source !== 'kawaii' &&
      (ill as unknown as { category?: string }).category?.toLowerCase().includes(q)
    )
      return true;
    if (
      englishTerms.some(
        (term) =>
          nameLower.includes(term) || ill.tags.some((tag) => tag.toLowerCase().includes(term))
      )
    )
      return true;
    return false;
  });
}

export function filterIcons(icons: IconDef[], query: string): IconDef[] {
  if (!query.trim()) return [];

  const q = query.toLowerCase();
  const englishTerms = getEnglishSearchTerms(q);

  return icons.filter((icon) => {
    const nameLower = icon.name.toLowerCase();
    return (
      nameLower.includes(q) ||
      icon.library.toLowerCase().includes(q) ||
      englishTerms.some((term) => nameLower.includes(term))
    );
  });
}
