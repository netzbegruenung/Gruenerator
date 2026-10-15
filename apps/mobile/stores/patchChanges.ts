/**
 * Ändert der Patch wirklich etwas? Steuerelemente melden auch den alten Wert
 * zurück (der Zeitwähler beim Schließen, ein erneut angetipptes Symbol) — das
 * darf in den Editor-Entwürfen keine „ungespeicherten Änderungen" erzeugen.
 */
export function patchChanges<T extends object>(current: T, patch: Partial<T>): boolean {
  return (Object.keys(patch) as (keyof T)[]).some(
    (key) => JSON.stringify(current[key]) !== JSON.stringify(patch[key])
  );
}
