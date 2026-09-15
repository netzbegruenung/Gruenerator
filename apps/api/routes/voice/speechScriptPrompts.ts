/**
 * Prompts for the Grünerator Voice script assistant.
 *
 * Text written for the EAR, not the eye: the result goes straight into the
 * editor of `/voice` and from there to the synthesiser, so it must be sayable —
 * no bullet points, no headings, no markup, no URLs to read out letter by
 * letter. Numbers and abbreviations are written the way they are spoken,
 * because the provider reads digits and abbreviations literally.
 *
 * No model or provider here: the lane registry (`services/ai/lanes.ts`, row
 * `voice_script`) decides who writes this, exactly like every other prompt file
 * in the repo (see CLAUDE.md, "Eine Prompt-Config entscheidet nicht über das
 * Routing").
 */
import { type DraftScriptBody } from '@gruenerator/contracts';

import { type UserLocale } from '../../agents/langgraph/ChatGraph/types.js';

/** Shared rules. Everything here is about being spoken aloud. */
const SPEAKABLE = `Du schreibst Text, der VORGELESEN wird — von einer synthetischen Stimme.

Regeln:
- Nur Fließtext in ganzen Sätzen. Keine Überschriften, keine Aufzählungszeichen, keine Sternchen, keine Klammern, kein Markdown.
- Kurze Sätze. Was man in einem Atemzug sagen kann, versteht man auch beim Hören.
- Zahlen, Uhrzeiten und Daten ausschreiben, wie man sie spricht: "achtzehn Uhr", "am dritten Mai", "zweitausendsechsundzwanzig".
- Abkürzungen auflösen: "zum Beispiel" statt "z.B.", "und so weiter" statt "usw.".
- Keine Internetadressen und keine E-Mail-Adressen vorlesen lassen. Wenn ein Verweis nötig ist, nenne ihn in Worten ("auf unserer Internetseite").
- Erfinde nichts. Verwende nur Angaben, die unten stehen. Fehlt eine Angabe, lass sie weg, statt einen Platzhalter zu schreiben.
- Antworte NUR mit dem fertigen Text. Keine Einleitung, keine Erklärung, keine Anführungszeichen drumherum.`;

/**
 * Austria as a default, not a filter — the same fork the chat system prompt
 * uses. It matters here because the German organisational vocabulary
 * ("Kreisverband", "Bürgerbüro") is wrong in Austria, and a greeting that
 * misnames the organisation is worse than a plain one.
 */
const LAENDERKONTEXT_AT = `
Die Ansage kommt aus Österreich. Schreibe österreichisches Standarddeutsch und
verwende österreichische Bezeichnungen (Landesorganisation, Bezirksorganisation,
Klub). Deutsche Begriffe wie "Kreisverband" oder "Fraktion" passen hier nicht.`;

function localeBlock(locale: UserLocale): string {
  return locale === 'de-AT' ? LAENDERKONTEXT_AT : '';
}

/** A labelled line, or nothing when the field was left empty. */
function field(label: string, value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? `${label}: ${trimmed}\n` : '';
}

export interface ScriptPrompt {
  system: string;
  prompt: string;
}

export function buildScriptPrompt(body: DraftScriptBody, locale: UserLocale): ScriptPrompt {
  if (body.preset === 'mailbox') {
    const tone =
      body.tone === 'freundlich'
        ? 'Freundlich und einladend, aber nicht betont locker.'
        : 'Sachlich und knapp, ohne Floskeln.';
    return {
      system: `${SPEAKABLE}

Du schreibst eine Ansage für einen Anrufbeantworter. Sie ist kurz — vier bis sechs Sätze —, weil sie bei jedem Anruf gehört wird.

Aufbau: begrüßen und sagen, wen man erreicht hat. Sagen, dass gerade niemand da ist. Sagen, was die anrufende Person tun kann. Um Name und Rückrufnummer bitten und einen Rückruf zusagen. Verabschieden.

Ton: ${tone}${localeBlock(locale)}`,
      prompt:
        `Schreibe die Ansage aus diesen Angaben:\n\n` +
        field('Wen erreicht man', body.organisation) +
        field('Name der Person', body.person) +
        field('Erreichbarkeit', body.reachability) +
        field('Alternative in der Zwischenzeit', body.alternative),
    };
  }

  if (body.preset === 'vorlesefassung') {
    return {
      system: `${SPEAKABLE}

Du machst aus einem geschriebenen Text eine Vorlesefassung. Der Inhalt bleibt vollständig und unverändert — du formulierst ihn nur so um, dass er gehört funktioniert.

Was du tust: Aufzählungen und Tabellen in Sätze auflösen. Überschriften in Überleitungssätze verwandeln. Schachtelsätze teilen. Fußnoten, Quellenangaben in Klammern und Internetadressen weglassen. Zahlen und Abkürzungen ausschreiben.

Was du NICHT tust: kürzen, zusammenfassen, bewerten oder Aussagen hinzufügen.${localeBlock(locale)}`,
      prompt: `Mache aus diesem Text eine Vorlesefassung:\n\n${body.sourceText}`,
    };
  }

  return {
    system: `${SPEAKABLE}

Du schreibst eine Audiodeskription: Sie beschreibt blinden und sehbehinderten Menschen, was zu sehen ist.

Regeln der Audiodeskription: beschreibe, was tatsächlich zu sehen ist, in der Gegenwart. Vom Ganzen ins Einzelne. Nenne zuerst, was für das Verständnis nötig ist. Deute nicht und bewerte nicht ("wirkt fröhlich" ist eine Deutung, "lacht" ist eine Beobachtung). Text, der im Bild steht, wird vorgelesen — sage dazu, dass er im Bild steht.${localeBlock(locale)}`,
    prompt:
      `Schreibe die Audiodeskription aus diesen Angaben:\n\n` +
      field('Zu sehen ist', body.visualDescription) +
      field('Wo das Material erscheint', body.context),
  };
}
