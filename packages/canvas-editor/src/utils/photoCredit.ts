import type { StockImageAttribution } from '@gruenerator/contracts';

/**
 * Bildnachweis für den Beitragstext. Unsplash verlangt ihn im Post selbst,
 * nicht nur am Bild, damit niemand das Foto für das eigene hält — mit dem
 * Instagram-Handle der Person, wenn sie einen angibt. Leer ohne Fotos.
 */
export function photoCreditLine(
  credits: readonly (StockImageAttribution | null | undefined)[]
): string {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const credit of credits) {
    if (!credit?.photographer || seen.has(credit.photoUrl)) continue;
    seen.add(credit.photoUrl);
    names.push(
      credit.instagramUsername
        ? `${credit.photographer} (@${credit.instagramUsername})`
        : credit.photographer
    );
  }
  if (names.length === 0) return '';
  return `${names.length > 1 ? 'Fotos' : 'Foto'}: ${names.join(', ')} auf Unsplash`;
}

/** Hängt den Bildnachweis mit einer Leerzeile an den Beitragstext. */
export function withPhotoCredit(text: string, credit: string): string {
  const body = text.trim();
  if (!credit) return body;
  return body ? `${body}\n\n${credit}` : credit;
}
