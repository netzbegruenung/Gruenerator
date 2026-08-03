import { describe, it, expect } from 'vitest';

import {
  stripQuotedSpans,
  isNegatedArtifactRequest,
  isMetaQuestionAbout,
  negatedOrMeta,
  hasExplicitSharepicWord,
  forbidsPersistentAction,
  forbidsNewResearch,
  ARTIFACT_NOUN_BY_KIND,
} from './fastPathGuards.js';

const SHAREPIC = /\b(share[\s-]?pics?|sharepics?)\b/i;
const GRAFIK = /\b(bild|grafik|illustration|foto|image|poster)\b/i;
const TABELLE = /\b(tabelle|spreadsheet|sheets?|kalkulation(?:stabelle)?)\b/i;

describe('stripQuotedSpans', () => {
  it('removes German, guillemet, and straight double quotes', () => {
    expect(stripQuotedSpans('Er meinte: „Erstell ein Sharepic" — okay?')).not.toMatch(/sharepic/i);
    expect(stripQuotedSpans('Er sagte »mach ein Bild« dazu')).not.toMatch(/\bbild\b/i);
    expect(stripQuotedSpans('Titel "Grafik des Jahres" prüfen')).not.toMatch(/grafik/i);
  });
  it('keeps apostrophes / straight single quotes intact', () => {
    expect(stripQuotedSpans("wie viele Fuß sind das, geht's?")).toContain("geht's");
  });
});

describe('isNegatedArtifactRequest', () => {
  it('detects a negator before the noun', () => {
    expect(isNegatedArtifactRequest('ich will kein Sharepic, nur Text', SHAREPIC)).toBe(true);
    expect(isNegatedArtifactRequest('bitte ohne Bild antworten', GRAFIK)).toBe(true);
    expect(isNegatedArtifactRequest('mach daraus bitte keine Grafik', GRAFIK)).toBe(true);
    expect(isNegatedArtifactRequest('nicht als Tabelle bitte', TABELLE)).toBe(true);
  });
  it('does not cross a sentence boundary', () => {
    expect(isNegatedArtifactRequest('Nicht schlecht! Erstell ein Sharepic', SHAREPIC)).toBe(false);
  });
  it('is per-noun-family', () => {
    // "kein" negates Post, not Sharepic.
    expect(isNegatedArtifactRequest('statt eines Posts ein Sharepic', SHAREPIC)).toBe(false);
  });
  it('passes a plain create request', () => {
    expect(isNegatedArtifactRequest('erstell ein Sharepic zur Verkehrswende', SHAREPIC)).toBe(
      false
    );
  });
});

describe('isMetaQuestionAbout', () => {
  it('detects question-word-initial meta questions', () => {
    expect(isMetaQuestionAbout('Was macht ein gutes Sharepic aus?', SHAREPIC)).toBe(true);
    expect(isMetaQuestionAbout('Welche Schriftgröße hat ein Sharepic?', SHAREPIC)).toBe(true);
  });
  it('does not fire on imperative create requests', () => {
    expect(isMetaQuestionAbout('Erstell ein Sharepic zu Tempo 30', SHAREPIC)).toBe(false);
    expect(isMetaQuestionAbout('Zeig mir ein Balkendiagramm', GRAFIK)).toBe(false);
  });
});

describe('negatedOrMeta', () => {
  it('combines both guards', () => {
    expect(negatedOrMeta('Was macht ein gutes Sharepic aus?', SHAREPIC)).toBe(true);
    expect(negatedOrMeta('ich will kein Sharepic', SHAREPIC)).toBe(true);
    expect(negatedOrMeta('erstell ein Sharepic zur Verkehrswende', SHAREPIC)).toBe(false);
  });
});

/**
 * The single gate for "may this turn produce a sharepic?". Before it, nine call
 * sites each carried their own sharepic vocabulary and their own (or no)
 * guards — "Grafik"/"Kachel" quietly counted, and the sites that forgot the
 * guards were the doors sharepics appeared through unasked-for.
 */
describe('hasExplicitSharepicWord', () => {
  it('accepts every spelling of the word', () => {
    for (const t of [
      'Mach ein Sharepic zu Tempo 30',
      'Erstell ein Share-Pic zum Kohleausstieg',
      'Ich brauche zwei Sharepics',
      'Bau mir ein Spruchbild',
      'Mach was aus den Spruchbildern',
      'Ein Zitatbild bitte',
      'Mach mir einen Dreizeiler zum Radverkehr',
      'Info-Sharepic zur Kindergrundsicherung',
      'Zitat-Sharepic: Wir kämpfen für Klimaschutz',
    ]) {
      expect(hasExplicitSharepicWord(t), t).toBe(true);
    }
  });

  it('rejects the words that used to be treated as sharepic asks', () => {
    // This is the product rule, not a detail: "Grafik" means a chart at least
    // as often as a party template, and routing it to the sharepic generator
    // was the single biggest source of unwanted sharepics.
    for (const t of [
      'Erstell daraus eine Grafik',
      'Ich brauche eine Kachel mit den Fakten',
      'Mal mir ein Bild dazu',
      'Mach ein Poster',
      'Schreib einen Insta-Post zu Tempo 30',
    ]) {
      expect(hasExplicitSharepicWord(t), t).toBe(false);
    }
  });

  it('stands down on negation', () => {
    expect(hasExplicitSharepicWord('Schreib einen Post ohne Sharepic')).toBe(false);
    expect(hasExplicitSharepicWord('Ich will ausdrücklich kein Sharepic')).toBe(false);
  });

  it('stands down on a question ABOUT sharepics', () => {
    expect(hasExplicitSharepicWord('Was macht ein gutes Sharepic aus?')).toBe(false);
    expect(hasExplicitSharepicWord('Wie erstelle ich ein Sharepic?')).toBe(false);
  });

  it('but a question about something ELSE does not disarm a real ask', () => {
    // The meta guard is anchored to the start of the TEXT, so judging a
    // two-sentence message by its first word refused perfectly explicit asks:
    // the question is the research half, the sharepic is the request.
    expect(
      hasExplicitSharepicWord(
        'Was ist unsere Position zur Mietpreisbremse? Mach ein Sharepic draus'
      )
    ).toBe(true);
    expect(
      hasExplicitSharepicWord('Wie hat die Fraktion abgestimmt? Pack das in ein Sharepic')
    ).toBe(true);
  });

  it('treats a quoted sharepic word as reported speech, not an ask', () => {
    expect(
      hasExplicitSharepicWord('Ein Kollege schrieb: „Erstell doch mal ein Sharepic dazu"')
    ).toBe(false);
    expect(hasExplicitSharepicWord('Suche nach "Sharepic Vorlagen" und fasse zusammen')).toBe(
      false
    );
  });

  it('survives empty and nullish input', () => {
    expect(hasExplicitSharepicWord('')).toBe(false);
    expect(hasExplicitSharepicWord(undefined as unknown as string)).toBe(false);
  });
});

/**
 * Negative action constraints. The QA round of 28.07.2026 produced a document
 * action on EVERY substantive turn once a document existed in the thread —
 * including turns that said "keine Dokumentaktion" in so many words. The
 * per-noun negation guard above was already in place; it just never ran on the
 * two paths that fire in a long thread.
 *
 * The load-bearing half of this suite is the negative space: an ordinary
 * artifact request must not be mistaken for a prohibition, or the fix trades a
 * noisy failure for a silent one.
 */
describe('forbidsPersistentAction', () => {
  const DOC = ARTIFACT_NOUN_BY_KIND.document;

  it('catches the noun-bound prohibition', () => {
    for (const t of [
      'Erstelle diesmal kein Dokument',
      'Gib mir den Stand, aber kein Dokument',
      'Fass es zusammen — nicht als Dokument speichern',
      'Das Dokument unverändert lassen',
    ]) {
      expect(forbidsPersistentAction(t, DOC), t).toBe(true);
    }
  });

  it('catches the action-level prohibition that carries no artifact noun', () => {
    // These are the shapes the per-noun guard structurally cannot see — which is
    // why they needed a second pattern rather than a wider noun list.
    for (const t of [
      'Nichts speichern, nur antworten',
      'Keine Dokumentaktion',
      'Keine Speicher-, Dokument- oder Aktualisierungsaktion',
      'Keine Aktion anbieten',
      'Antworte nur im Chat',
      'Bitte nichts anlegen',
    ]) {
      expect(forbidsPersistentAction(t), t).toBe(true);
    }
  });

  it('is per-family: an unrelated prohibition leaves the asked-for artifact alone', () => {
    // The whole reason the guard takes a noun pattern. A global predicate would
    // refuse to write the document the user explicitly asked for.
    const t = 'Erstelle ein Dokument, aber keine Tabelle';
    expect(forbidsPersistentAction(t, DOC)).toBe(false);
    expect(forbidsPersistentAction(t, ARTIFACT_NOUN_BY_KIND.sheet)).toBe(true);
  });

  it('does not fire on ordinary requests', () => {
    for (const t of [
      'Erstelle ein Dokument mit dem Antrag',
      'Speichere das als Protokoll',
      'Kürze die Begründung auf die Hälfte',
      'Mach das Bild ohne Text',
      'Aktualisiere die Zahlen im Dokument',
    ]) {
      expect(forbidsPersistentAction(t, DOC), t).toBe(false);
    }
  });

  it('does not read "keine großen Änderungen" as a refusal to edit', () => {
    // `änderung` is deliberately out of the prohibition vocabulary: this is an
    // instruction about HOW to edit, not a refusal.
    expect(forbidsPersistentAction('Bitte keine großen Änderungen am Rest', DOC)).toBe(false);
  });

  it('ignores a prohibition inside reported speech', () => {
    expect(
      forbidsPersistentAction('Sie schrieb: „Bitte kein Dokument erstellen" — was meint sie?', DOC)
    ).toBe(false);
  });

  it('does not read a ban on the DELIVERY FORM as a ban on the artifact', () => {
    // Live on 03.08.2026: this exact message demoted `create_presentation`, so
    // the sentence written to prevent a hand-typed file removed the tool that
    // writes a real one. "kein Base64" orders the presentation, it does not
    // forbid it.
    const t =
      'Erstelle unmittelbar eine Präsentation mit genau vier Folien. Liefere ein echtes ' +
      'Präsentationsartefakt zum Öffnen, kein Base64, kein data:-URI, keine erfundene ' +
      'öffentliche URL und keine bloße Gliederung.';
    expect(forbidsPersistentAction(t, ARTIFACT_NOUN_BY_KIND.presentation)).toBe(false);

    for (const variant of [
      'Mach eine Tabelle daraus, keinen Link und keinen Platzhalter',
      'Gib mir das Dokument als Datei, nicht als URL',
    ]) {
      expect(forbidsPersistentAction(variant, ARTIFACT_NOUN_BY_KIND.sheet), variant).toBe(false);
      expect(forbidsPersistentAction(variant, DOC), variant).toBe(false);
    }
  });

  it('still catches the artifact ban standing next to a delivery-form ban', () => {
    expect(
      forbidsPersistentAction(
        'Kein Base64 und bitte auch keine Präsentation',
        ARTIFACT_NOUN_BY_KIND.presentation
      )
    ).toBe(true);
  });

  it('survives empty and nullish input', () => {
    expect(forbidsPersistentAction('')).toBe(false);
    expect(forbidsPersistentAction(undefined as unknown as string, DOC)).toBe(false);
  });
});

/**
 * The research ban. Its whole reason for existing is that the sentence
 * "ohne neue Recherche eine Vergleichstabelle" is ALSO what
 * `looksLikeCompoundGeneration` reads as a research signal — the ban was the
 * trigger for the machinery it was meant to stop. So the predicate has to be
 * right about the sentence itself, not merely about its keywords.
 */
describe('forbidsNewResearch', () => {
  it('catches the wording the QA session actually used', () => {
    expect(
      forbidsNewResearch(
        'Ohne neue Recherche und ohne frühere Angaben zu zitieren: Berechne den Betrag.'
      )
    ).toBe(true);
    expect(
      forbidsNewResearch(
        'Aus den Projektdaten sollte ohne neue Recherche eine editierbare Vergleichstabelle entstehen.'
      )
    ).toBe(true);
  });

  it('catches the other explicit phrasings of the same instruction', () => {
    for (const t of [
      'Bitte keine neue Recherche.',
      'Keine weitere Websuche bitte.',
      'Such nicht nochmal, nimm was da ist.',
      'Antworte nur aus dem bisherigen Gesprächsverlauf.',
      'Verwende ausschließlich die gespeicherte Faktenbasis.',
      'Recherchiere nicht neu, das haben wir schon geklärt.',
    ]) {
      expect(forbidsNewResearch(t), t).toBe(true);
    }
  });

  /**
   * The failure mode worse than missing the ban: reading the OPPOSITE of the
   * sentence. "Das geht nicht ohne Recherche" is a request to look things up,
   * and silently unmounting the search tools for it would be the guard
   * sabotaging the very turn it was asked to serve.
   */
  it('does not fire when a preceding negator flips the phrase into a request', () => {
    expect(forbidsNewResearch('Das geht nicht ohne Recherche, fürchte ich.')).toBe(false);
    expect(forbidsNewResearch('Ich kann das kaum ohne Recherche beantworten.')).toBe(false);
    // Known limit, deliberately not chased: a reverser AFTER the phrase
    // ("Ohne Recherche kaum zu beantworten") still reads as a ban. Catching it
    // would mean treating a following "nicht" as a reverser, and that swallows
    // the real instruction "Ohne neue Recherche: nicht raten, sondern fragen."
  });

  it('leaves ordinary turns alone', () => {
    for (const t of [
      'Recherchiere bitte die aktuellen Zahlen.',
      'Ich weiß nicht, wonach ich suchen soll.',
      'Mach mir eine Tabelle zum Radverkehr.',
      'Kannst du das nochmal erklären?',
      'Wir haben keine Zeit mehr für das Projekt.',
    ]) {
      expect(forbidsNewResearch(t), t).toBe(false);
    }
  });

  it('ignores a ban inside reported speech', () => {
    expect(forbidsNewResearch('Er schrieb: „Bitte keine neue Recherche" — stimmt das?')).toBe(
      false
    );
  });

  it('survives empty and nullish input', () => {
    expect(forbidsNewResearch('')).toBe(false);
    expect(forbidsNewResearch(undefined as unknown as string)).toBe(false);
  });
});

describe('eine vollständig zitierte Nachricht ist kein Zitat', () => {
  /**
   * Der Live-Fehler, aus dem beide Symptome fielen: Nutzer fügen Text MIT
   * Anführungszeichen ein. `stripQuotedSpans` hielt die ganze Nachricht für
   * fremde Rede und liess nichts übrig — während die Erkenner in
   * `compoundGenerationKind` den ROHEN Text lesen. Der Auftrag wurde also
   * erkannt, seine Schutzprüfungen sahen ins Leere.
   */
  const ASK =
    'Recherchier mir die aktuellen Zahlen zur Wärmepumpenförderung in Österreich, fass sie in fünf Punkten zusammen, aber erstelle bitte kein Dokument und kein Sharepic daraus.';
  const SHAREPIC_ASK = 'Was haben wir vorhin besprochen? Mach mir daraus ein Sharepic.';

  it('sieht das Verbot auch in Anführungszeichen', () => {
    // Ohne den Fix baute forceCompoundGeneration genau das verbotene Dokument.
    const nouns = ARTIFACT_NOUN_BY_KIND['document'];
    expect(forbidsPersistentAction(ASK, nouns)).toBe(true);
    expect(forbidsPersistentAction(`„${ASK}“`, nouns)).toBe(true);
    expect(forbidsPersistentAction(`"${ASK}"`, nouns)).toBe(true);
  });

  it('sieht das Sharepic-Wort auch in Anführungszeichen', () => {
    // Ohne den Fix verweigerte das Lizenz-Gate mit „In diesem Chat gibt es noch
    // kein Sharepic", statt die Frage zu beantworten.
    expect(hasExplicitSharepicWord(SHAREPIC_ASK)).toBe(true);
    expect(hasExplicitSharepicWord(`„${SHAREPIC_ASK}“`)).toBe(true);
  });

  it('strippt echte fremde Rede weiterhin', () => {
    // Das Gegenstück: hier steht ein Auftrag UM das Zitat herum, das Zitat ist
    // wirklich zitiert — und das Nomen darin darf keine Prüfung auslösen.
    expect(stripQuotedSpans('Antworte auf: „Wir brauchen ein Sharepic dazu."')).not.toContain(
      'Sharepic'
    );
    expect(
      hasExplicitSharepicWord('Antworte auf die Mail: „Wir brauchen ein Sharepic dazu."')
    ).toBe(false);
  });

  it('bleibt bewusst auf die GANZE Nachricht beschränkt', () => {
    // `„…" bitte` ist nicht mehr vollständig eingeklammert und wird weiter
    // gestrippt. Eine Unschärfe dafür einzubauen wäre schlechter als die Lücke:
    // sie ginge zulasten der echten Zitat-Erkennung, die einen kurzen Rahmen
    // haben darf (siehe der Fall darüber).
    expect(hasExplicitSharepicWord(`„${SHAREPIC_ASK}“ bitte`)).toBe(false);
  });
});
