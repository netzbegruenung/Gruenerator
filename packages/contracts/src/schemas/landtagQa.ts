/**
 * Landtage als Familie des Bundestag-Q&A: ein Werkzeug (`landtag`), ein Lese-
 * Werkzeug (`parlament_lesen` mit `quelle`), je Parlament nur ein Eintrag in
 * der Registry (`apps/api/services/landtag/registry.ts`).
 *
 * Wer ein Parlament anbindet, ergänzt genau hier `landtagParlamentSchema` und
 * den Ref-Präfix; der Compiler verlangt danach den Registry-Eintrag. Die Werte
 * sind F0 (Wire, gespeicherte Tool-Aufrufe): nur additiv ändern.
 */
import { z } from 'zod';

/** Kennung des Parlaments; zugleich der `quelle`-Wert von `parlament_lesen`. */
export const landtagParlamentSchema = z.enum(['berlin']);

/** Normalisierte Dokumentarten; je Parlament auf dessen Schreibweise abgebildet. */
export const landtagTypSchema = z.enum([
  'Antrag',
  'Anfrage',
  'Antwort',
  'Gesetzentwurf',
  'Beschlussempfehlung',
  'Änderungsantrag',
]);

/** Normalisierte Fraktionen; das Parlament bildet sie auf seine Kurznamen ab oder meldet „nicht vertreten". */
export const landtagFraktionSchema = z.enum(['gruene', 'cdu', 'spd', 'linke', 'afd', 'bsw', 'fdp']);

/**
 * `BE 19/3519` (Drucksache), `BE 19/S27288` (Schriftliche Anfrage mit Antwort:
 * eigene Nummernreihe, das `S` hält sie von Drucksachen gleicher Nummer
 * auseinander). Der Präfix ist das Parlamentskürzel; welches zu welchem
 * Parlament gehört, steht in der Registry.
 */
export const landtagRefSchema = z.string().regex(/^[A-Z]{2} \d{1,2}\/S?\d{1,6}$/);

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const landtagFilterSchema = z.object({
  wahlperiode: z.number().int().min(1).max(30).optional(),
  typ: z.array(landtagTypSchema).max(4).optional(),
  fraktion: z.array(landtagFraktionSchema).max(4).optional(),
  datumVon: iso.optional(),
  datumBis: iso.optional(),
  titel: z.string().max(200).optional(),
  schlagwort: z.string().max(80).optional(),
  volltext: z.string().max(80).optional(),
});

export type LandtagParlament = z.infer<typeof landtagParlamentSchema>;
export type LandtagTyp = z.infer<typeof landtagTypSchema>;
export type LandtagFraktion = z.infer<typeof landtagFraktionSchema>;
export type LandtagFilter = z.infer<typeof landtagFilterSchema>;
