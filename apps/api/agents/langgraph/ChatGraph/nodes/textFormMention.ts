import { canonicalSkillMention } from '@gruenerator/shared/agents';

/**
 * Der Schlüssel, unter dem eine angelernte Textform („Texte anlernen") für ein
 * aktives Rezept nachgeschlagen wird.
 *
 * **Das speziellere Rezept gewinnt** — nachgeschlagen wird unter der Mention
 * selbst, nichts wird zusammengefaltet. Ein angelernter Stil IST ein Rezept
 * (er ersetzt den mitgelieferten Text, siehe `respondNode`/`recipeCatalog`),
 * also gewinnt eins von beiden, und das ist das genauere.
 *
 * Bis 08/2026 faltete diese Funktion per Präfix: `presse-hessen-partei`,
 * `presse-saarland`, `presse-at` und siebzehn weitere landeten alle auf
 * `presse`, sämtliche `insta-*` auf `instagram`. Weil `user_text_forms` unique
 * auf `(user_id, mention)` ist, gibt es dafür genau EINE Zeile — ein einziger
 * angelernter Presse-Stil schaltete damit die Vorgaben von zwanzig Rezepten ab
 * (Aufbau, Länge, Zitatstruktur), still und ohne Weg zurück. Über Ländergrenzen
 * hinweg noch dazu: `presse-at` trägt `audience: 'de-AT'` und fiel auf denselben
 * Schlüssel wie das deutsche `presse` (#2930).
 *
 * Wer für ein Landesverbands-Rezept einen eigenen Stil will, lernt ihn seither
 * FÜR DIESES Rezept an (`kind: 'recipe'`, siehe `userTextFormsContractRouter`).
 * Der generische `presse`-Stil gilt weiterhin für das generische `@presse`.
 *
 * `canonicalSkillMention` bleibt, damit eine zurückgezogene Mention
 * (`presse-hessen` → `presse-hessen-partei`) dieselbe Zeile trifft wie die
 * lebende — sonst hinge dieselbe Textform an zwei Schlüsseln.
 *
 * Eigenes, abhängigkeitsfreies Modul, damit die Regel ohne den ganzen
 * Antwortknoten prüfbar bleibt.
 */
export function deriveTextFormMention(mention: string | null): string | null {
  if (!mention) return null;
  return canonicalSkillMention(mention);
}
