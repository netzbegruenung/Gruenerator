/**
 * Beratungsverlauf eines Vorgangs aus den Positionen, die `find` ohnehin lädt:
 * nur die Schritte mit Beschlussfassung (Beratungen, Durchgänge im Bundesrat)
 * und die Beschlussempfehlung — die Antwort auf „wo genau wurde X beschlossen".
 * Die Verkündung (BGBl) steht am Vorgang selbst. Kein eigener Abruf.
 */
import { type BundestagVerlauf, type BundestagVerlaufSchritt } from '@gruenerator/contracts';

import { type DipVerkuendung, type DipVorgangsposition } from '../dip/dipClient.js';

/** Lange Verfahren (Haushalt) haben Dutzende Beschlüsse; die letzten tragen die Entscheidung. */
const MAX_SCHRITTE = 8;

function gremiumOf(p: DipVorgangsposition): 'BT' | 'BR' | null {
  return p.zuordnung === 'BT' || p.zuordnung === 'BR' ? p.zuordnung : null;
}

function fundstelleOf(p: DipVorgangsposition): string | null {
  const nr = p.fundstelle?.dokumentnummer;
  if (!nr) return null;
  const art = p.fundstelle?.dokumentart ?? p.dokumentart ?? 'Drucksache';
  return p.zuordnung === 'BR' ? `BR-${art} ${nr}` : `${art} ${nr}`;
}

function toSchritt(p: DipVorgangsposition): BundestagVerlaufSchritt {
  return {
    position: p.vorgangsposition ?? p.fundstelle?.drucksachetyp ?? 'Position',
    gremium: gremiumOf(p),
    datum: p.datum ?? '',
    fundstelle: fundstelleOf(p),
    anfangsseite: p.fundstelle?.anfangsseite ?? null,
    pdfUrl: p.fundstelle?.pdf_url ?? null,
    beschluesse: (p.beschlussfassung ?? []).flatMap((b) =>
      b.beschlusstenor
        ? [
            {
              tenor: b.beschlusstenor,
              seite: b.seite ?? null,
              abstimmung:
                [b.abstimmungsart, b.mehrheit ? `Mehrheit: ${b.mehrheit}` : null]
                  .filter(Boolean)
                  .join(', ') || null,
            },
          ]
        : []
    ),
  };
}

function verkuendungOf(list: readonly DipVerkuendung[] | undefined) {
  const v = list?.[0];
  if (!v) return null;
  const fundstelle =
    v.fundstelle ??
    (v.verkuendungsblatt_kuerzel && v.jahrgang
      ? `${v.verkuendungsblatt_kuerzel} ${v.jahrgang}${v.heftnummer ? `, ${v.heftnummer}` : ''}`
      : null);
  if (!fundstelle) return null;
  return { datum: v.verkuendungsdatum ?? null, fundstelle, pdfUrl: v.pdf_url ?? null };
}

/** `null`, wenn der Vorgang weder einen Beschluss noch eine Verkündung kennt. */
export function buildVerlauf(
  positions: readonly DipVorgangsposition[],
  verkuendung: readonly DipVerkuendung[] | undefined
): BundestagVerlauf | null {
  const schritte = positions
    .filter(
      (p) =>
        (p.beschlussfassung?.some((b) => b.beschlusstenor) ?? false) ||
        p.fundstelle?.drucksachetyp === 'Beschlussempfehlung und Bericht'
    )
    .map(toSchritt)
    .slice(-MAX_SCHRITTE);
  const v = verkuendungOf(verkuendung);
  if (schritte.length === 0 && !v) return null;
  return { schritte, verkuendung: v };
}
