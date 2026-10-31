import { z } from 'zod';

import { stripInlineMarks } from '../../text/inlineMarks.js';
import { handMarkProblems } from '../sharepicHandMarks.js';

import {
  SHAREPIC_INFOGRAFIK_COLORS,
  sharepicBrandSchema,
  sharepicColorsFor,
  sharepicCreatorLocaleSchema,
  sharepicFormatSchema,
  sharepicSeitenzahlSchema,
  sharepicThemaSchema,
  themaOfColor,
} from './enums.js';
import { CARD_ITEM_TYPES, KOPFBAND_CARD_TYPES, type SharepicItem } from './items.js';
import { SHAREPIC_LIMITS } from './limits.js';
import { accentLines } from './primitives.js';
import { sharepicSlideSchema } from './slide.js';

/** "1.234,5 €" → 1234.5; null for words ("Hohe Nachfrage"). German notation only. */
export function parseSharepicNumber(value: string): number | null {
  // One leading class, no second whitespace run after it: two quantifiers over
  // the same characters backtrack polynomially on a string of tabs (CodeQL).
  const m = /^[^\d+−-]*([+−-]?)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?(?!\d)/.exec(value.trim());
  if (!m) return null;
  const whole = m[2]!.replace(/\./g, '');
  const n = Number(`${whole}${m[3] ? `.${m[3]}` : ''}`);
  return m[1] === '−' || m[1] === '-' ? -n : n;
}

/**
 * A sum must add up. Every term numeric: computed left to right, compared
 * to the result at the result's own precision. Any term in words: a formula,
 * nothing to compute.
 */
function rechnungProblem({
  glieder,
  ergebnis,
}: Extract<SharepicItem, { type: 'rechnung' }>): string | null {
  const values = glieder.map((g) => parseSharepicNumber(g.wert));
  const result = parseSharepicNumber(ergebnis.wert);
  if (result === null || values.some((v) => v === null)) return null;
  const total = glieder.reduce((acc, g, k) => {
    const v = values[k]!;
    if (k === 0) return v;
    switch (g.op ?? '+') {
      case '+':
        return acc + v;
      case '−':
        return acc - v;
      case '×':
        return acc * v;
      case '÷':
        return acc / v;
    }
  }, 0);
  const decimals = /,(\d+)/.exec(ergebnis.wert)?.[1]?.length ?? 0;
  if (Math.abs(total - result) <= 0.51 * 10 ** -decimals) return null;
  const shown = total.toLocaleString('de-DE', { maximumFractionDigits: Math.max(decimals, 2) });
  return `Die rechnung geht nicht auf: die Glieder ergeben ${shown}, nicht ${ergebnis.wert}.`;
}

/**
 * A sharepic is one slide; a carousel is several, swiped in order. Every
 * slide but the last gets a "swipe on" arrow unless `pfeil` is false.
 */
export const sharepicSpecShapeSchema = z.object({
  locale: sharepicCreatorLocaleSchema,
  /** Whose design within the country (GRÜNE JUGEND); absent: the party's. */
  brand: sharepicBrandSchema.optional(),
  format: sharepicFormatSchema.optional(),
  /** Carousel only: page numbers the composer counts itself. */
  seitenzahl: sharepicSeitenzahlSchema.optional(),
  /** Carousel only: the "swipe on" arrow on every slide but the last. Absent: on. */
  pfeil: z.boolean().optional(),
  /** A themed sharepic (Pride, Frauen); absent: the plain CD. */
  thema: sharepicThemaSchema.optional(),
  slides: z.array(sharepicSlideSchema).min(1).max(SHAREPIC_LIMITS.slides),
});

export const sharepicSpecSchema = sharepicSpecShapeSchema.superRefine((spec, ctx) => {
  const allowed = sharepicColorsFor(spec.locale, spec.thema, spec.brand);
  const last = spec.slides.length - 1;
  if (spec.seitenzahl && last === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['seitenzahl'],
      message: 'seitenzahl nur in einem Karussell.',
    });
  }
  if (spec.pfeil === false && spec.slides.some((slide) => slide.weiter)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['pfeil'],
      message: 'weiter steht neben dem Pfeil – ohne Pfeil kein weiter.',
    });
  }
  spec.slides.forEach((slide, s) => {
    const at = (...path: (string | number)[]) => ['slides', s, ...path];
    const bg = slide.background;
    const color = bg.kind === 'farbe' ? bg.color : bg.kind === 'foto' ? null : bg.panelColor;
    if (color && !allowed.includes(color)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: at('background'),
        message: themaOfColor(color)
          ? `Farbe "${color}" gibt es nur mit thema "${themaOfColor(color)}".`
          : `Farbe "${color}" gibt es für ${spec.locale} nicht. Erlaubt: ${allowed.join(', ')}.`,
      });
    }
    if (bg.kind === 'farbe' && bg.kopfband) {
      // The text above the card reads on the band; the card closes the slide,
      // so nothing stands on the ground below it in the band's ink.
      const card = slide.items.findIndex((i) => KOPFBAND_CARD_TYPES.includes(i.type));
      if (
        spec.locale !== 'de-DE' ||
        !allowed.includes(bg.kopfband) ||
        card < 1 ||
        card !== slide.items.length - 1
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: at('background'),
          message: `kopfband nur in Deutschland, in einer Farbe der Palette, und nur über einer Karte (${KOPFBAND_CARD_TYPES.join(', ')}) als letztem Element, vor der noch Text steht.`,
        });
      }
    }
    if (spec.locale !== 'de-DE') {
      const long = slide.items.some(
        (i) =>
          (i.type === 'zitat' && stripInlineMarks(i.text).length > SHAREPIC_LIMITS.zitat) ||
          (i.type === 'absatz' && stripInlineMarks(i.text).length > SHAREPIC_LIMITS.absatz)
      );
      if (long) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: at('items'),
          message: `zitat höchstens ${SHAREPIC_LIMITS.zitat}, absatz höchstens ${SHAREPIC_LIMITS.absatz} Zeichen.`,
        });
      }
      if (slide.blume) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: at('blume'),
          message: 'blume gibt es nur im deutschen Corporate Design.',
        });
      }
    }
    if (slide.blume && spec.brand === 'gruene-jugend') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: at('blume'),
        message:
          'blume ist das Zeichen der Partei – im Design der GRÜNEN JUGEND gibt es sie nicht.',
      });
    }
    if (
      slide.items.some((i) => i.type === 'liste' && i.stil === 'kasten') &&
      spec.locale !== 'de-DE'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: at('items'),
        message: 'liste stil "kasten" gibt es nur im deutschen Corporate Design.',
      });
    }
    const headlines = slide.items.filter((i) => i.type === 'headline');
    if (headlines.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: at('items'),
        message: 'Nur eine headline pro Slide.',
      });
    }
    for (const h of headlines) {
      const outside =
        h.type === 'headline' ? accentLines(h.akzent).filter((i) => i >= h.lines.length) : [];
      if (outside.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: at('items'),
          message: `akzent ${outside.join(', ')} zeigt auf keine Zeile.`,
        });
      }
    }
    if (slide.items.filter((i) => i.type === 'button').length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: at('items'),
        message: 'Höchstens ein button pro Slide.',
      });
    }
    if (slide.items.filter((i) => i.type === 'faktencheck').length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: at('items'),
        message: 'Höchstens ein faktencheck pro Slide.',
      });
    }
    if (slide.items.filter((i) => i.type === 'vergleich').length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: at('items'),
        message: 'Höchstens ein vergleich pro Slide.',
      });
    }
    for (const v of slide.items.flatMap((i) => (i.type === 'vergleich' ? [i] : []))) {
      const sides = [v.links, v.rechts];
      if (v.stil === 'spalten') {
        if (spec.locale !== 'de-DE') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: at('items'),
            message: 'vergleich stil "spalten" gibt es nur im deutschen Corporate Design.',
          });
        }
        if (slide.items.length > 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: at('items'),
            message: 'Ein vergleich mit stil "spalten" füllt die Slide allein.',
          });
        }
        continue;
      }
      const tooLong = sides.some(
        (s) =>
          stripInlineMarks(s.titel).length > SHAREPIC_LIMITS.vergleichTitel ||
          s.punkte.some((p) => stripInlineMarks(p).length > SHAREPIC_LIMITS.vergleichPunkt)
      );
      if (tooLong || sides.some((s) => s.punkte.length > 3)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: at('items'),
          message: `vergleich als Karten: titel höchstens ${SHAREPIC_LIMITS.vergleichTitel} Zeichen, 2–3 punkte mit höchstens ${SHAREPIC_LIMITS.vergleichPunkt} Zeichen (mehr nur mit stil "spalten").`,
        });
      }
    }
    const infografiken = slide.items.flatMap((i) => (i.type === 'infografik' ? [i] : []));
    const issue = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: at('items'), message });
    if (infografiken.length > 1) issue('Höchstens eine infografik pro Slide.');
    // The illustrations are painted in dark and light greens for a light
    // ground; on a green slide half of them vanish.
    if (
      infografiken.length &&
      (slide.background.kind !== 'farbe' ||
        !SHAREPIC_INFOGRAFIK_COLORS.includes(slide.background.color))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: at('background'),
        message:
          'Eine infografik steht auf hellem Grund: background {"kind":"farbe","color":"weiss"} (in Deutschland auch "hellgrau").',
      });
    }
    if (
      infografiken.length &&
      slide.items.some((i) => (CARD_ITEM_TYPES as readonly string[]).includes(i.type))
    ) {
      issue(
        'Eine infografik füllt die Slide: kein diagramm, keine liste, iconliste, kein vergleich oder faktencheck daneben.'
      );
    }
    for (const info of infografiken) {
      if (info.form === 'zahl' && info.punkte.length !== 1) {
        issue('Eine infografik mit form "zahl" hat genau einen Punkt: die Zahl und ihr Bild.');
      }
      if (info.form !== 'anteil' && info.form !== 'zahl' && info.punkte.length < 2) {
        issue(
          'Eine infografik braucht mindestens 2 Punkte (nur "anteil" und "zahl" kommen mit einem aus).'
        );
      }
      if (info.form === 'mengen' && info.punkte.some((p) => p.wert === undefined)) {
        issue('Eine infografik mit form "mengen" braucht bei jedem Punkt einen wert.');
      }
      if (
        info.form !== 'mengen' &&
        info.form !== 'anteil' &&
        info.punkte.some((p) => p.wert !== undefined)
      ) {
        issue('wert gibt es nur bei form "mengen" und "anteil" – sonst steht die Zahl im titel.');
      }
      if (info.form !== 'anteil' && info.punkte.some((p) => p.von !== undefined)) {
        issue('von gibt es nur bei form "anteil".');
      }
      if (info.form === 'anteil') {
        if (info.punkte.length > 3) issue('Ein anteil-Bild hat höchstens 3 Anteile.');
        for (const p of info.punkte) {
          const { wert, von } = p;
          if (wert === undefined || von === undefined) {
            issue(`Jeder Anteil braucht wert und von ("${p.titel}": 9 von 10 → wert 9, von 10).`);
          } else if (!(von === 100 || (von >= 2 && von <= 10))) {
            issue(
              `von ${von} ("${p.titel}"): ein Anteil zählt 2–10 Einheiten oder 100 (Prozent) – „3 von 8“ ja, „37 von 120“ als Prozent.`
            );
          } else if (!Number.isInteger(wert) || wert > von) {
            issue(
              `wert ${wert} von ${von} ("${p.titel}"): eine ganze Zahl bis ${von} – eine Kommazahl passt nicht in Einheiten, dann lieber ein diagramm.`
            );
          } else {
            // The figure written must be the one drawn: "9 von 10" over 9 of 10.
            const figures = (p.titel.match(/\d+/g) ?? []).map(Number);
            if (
              figures.length &&
              (!figures.includes(wert) || (von !== 100 && !figures.includes(von)))
            ) {
              issue(
                `titel "${p.titel}" passt nicht zu wert ${wert} von ${von} – die Zahl im titel ist die, die gezeichnet wird.`
              );
            }
          }
        }
      }
      if (info.form === 'ablauf' && info.punkte.length > 5) {
        issue('Ein ablauf hat höchstens 5 Schritte.');
      }
      if (info.form === 'mengen' && info.punkte.length > 4) {
        issue('Ein mengen-Bild hat höchstens 4 Mengen.');
      }
    }
    const charts = slide.items.flatMap((i) => (i.type === 'diagramm' ? [i] : []));
    if (charts.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: at('items'),
        message: 'Höchstens ein diagramm pro Slide.',
      });
    }
    for (const chart of charts) {
      const parts = chart.art === 'kreis' || chart.art === 'donut';
      if (parts && chart.werte.length > 5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: at('items'),
          message: `Ein ${chart.art}-diagramm hat höchstens 5 Teile – mehr als balken-quer.`,
        });
      }
      if (parts && chart.werte.some((w) => w.wert < 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: at('items'),
          message: `Ein ${chart.art}-diagramm zeigt Anteile – keine negativen Werte.`,
        });
      }
      const sum = chart.werte.reduce((total, w) => total + w.wert, 0);
      if (chart.werte.length < 2 && !(parts && chart.einheit === '%' && sum < 100)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: at('items'),
          message:
            'Ein einzelner Wert nur als Anteil: art kreis oder donut mit einheit "%" – den Rest ergänzt der Grünerator. Sonst mindestens zwei werte.',
        });
      }
      if (parts && chart.einheit === '%' && sum > 100.5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: at('items'),
          message: `Die Anteile ergeben ${sum} % – mehr als 100 %.`,
        });
      }
    }
    if (slide.weiter && s === last) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: at('weiter'),
        message: 'weiter führt zur nächsten Slide – nicht auf der letzten.',
      });
    }
    for (const type of ['zahl', 'rechnung', 'termine', 'schlagzeile', 'bingo'] as const) {
      if (slide.items.filter((i) => i.type === type).length > 1) {
        issue(`Höchstens ein ${type} pro Slide.`);
      }
    }
    for (const liste of slide.items.flatMap((i) => (i.type === 'liste' ? [i] : []))) {
      if (liste.stil === 'emoji' && liste.zeichen?.length !== liste.items.length) {
        issue(
          'liste mit stil "emoji": zeichen braucht genau ein Emoji pro Punkt, in derselben Reihenfolge.'
        );
      }
      if (liste.stil !== 'emoji' && liste.zeichen) {
        issue('zeichen gibt es nur bei einer liste mit stil "emoji".');
      }
    }
    if (slide.nummer && slide.items.some((i) => i.type === 'liste' && i.stil === 'ziffern')) {
      issue('nummer oder eine liste mit ziffern – nicht beides auf einer Slide.');
    }
    for (const item of slide.items) {
      if (item.type !== 'rechnung') continue;
      const problem = rechnungProblem(item);
      if (problem) issue(problem);
    }
    for (const problem of handMarkProblems(slide.items)) issue(problem);
    const aufrufe = slide.items.filter((i) => i.type === 'aufruf');
    if (aufrufe.length && s !== last) {
      issue('Ein aufruf steht auf der letzten Slide.');
    }
    if (aufrufe.length > 1) issue('Höchstens ein aufruf.');
    if (aufrufe.length && slide.items.some((i) => i.type !== 'aufruf' && i.type !== 'dachzeile')) {
      issue('Der aufruf trägt seine Slide allein (höchstens eine dachzeile darüber).');
    }
    const bilder = slide.items.flatMap((i) => (i.type === 'bild' ? [i] : []));
    if (bilder.length > 1) issue('Höchstens ein bild pro Slide.');
    if (bilder.length) {
      if (slide.background.kind !== 'farbe') {
        issue('Ein bild steht auf einer Farbfläche: background {"kind":"farbe",…}.');
      }
      if (slide.items.length === bilder.length) {
        issue('Ein bild steht neben Text: dazu eine headline, ein absatz oder ein zitat.');
      }
      if (
        slide.items.some(
          (i) =>
            i.type === 'infografik' ||
            i.type === 'aufruf' ||
            (CARD_ITEM_TYPES as readonly string[]).includes(i.type)
        )
      ) {
        issue(
          'Ein bild teilt die Slide nur mit Text (dachzeile, headline, absatz, text, zitat, frage, button, steckbrief) – keine Karte, infografik oder aufruf daneben.'
        );
      }
      if (bilder.some((b) => b.freisteller && b.ausschnitt !== 'freigestellt')) {
        issue('freisteller gibt es nur bei ausschnitt "freigestellt".');
      }
    }
    if (slide.items.some((i) => i.type === 'steckbrief')) {
      const others = slide.items.filter((i) => i.type !== 'steckbrief');
      if (slide.items.length - others.length > 1) issue('Höchstens ein steckbrief pro Slide.');
      const bild = others.length === 1 && others[0]!.type === 'bild' ? others[0] : null;
      // The person is the whole photo, or a cut-out on a colour.
      const onPhoto = bg.kind === 'foto' && others.length === 0;
      const cutOut = bg.kind === 'farbe' && bild?.ausschnitt === 'freigestellt';
      if (!onPhoto && !cutOut) {
        issue(
          'Ein steckbrief steht allein auf einem Foto der Person (background kind "foto") oder auf einer Farbe mit genau einem bild, ausschnitt "freigestellt".'
        );
      }
      if (
        slide.stoerer ||
        slide.datum ||
        slide.ort ||
        slide.nummer ||
        slide.zeilenboxen ||
        slide.blume ||
        slide.quelle
      ) {
        issue(
          'Ein steckbrief hat keine Extras (stoerer, datum, ort, nummer, zeilenboxen, blume, quelle).'
        );
      }
    }
    if (slide.zeilenboxen && spec.locale !== 'de-DE') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: at('zeilenboxen'),
        message: 'zeilenboxen gibt es nur im deutschen Corporate Design.',
      });
    }
  });
});
export type SharepicSpec = z.infer<typeof sharepicSpecSchema>;
