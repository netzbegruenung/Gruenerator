/**
 * `vorlagen_vorschlagen`: zeigt zu einem Beitrag passende Sharepic-Vorlagen aus
 * dem Grünerator-Katalog als Galerie im Chat.
 *
 * Die Auswahl trifft das Modell, nicht eine Suche: der Katalog ist klein (gut
 * zwei Dutzend Einträge je Land) und steht vollständig in der Beschreibung.
 * Ob eine Vorlage passt, hängt an der STRUKTUR des Beitrags — ein Zitat, eine
 * Zahl, ein Termin, mehrere Argumente —, und die erkennt das Modell, das den
 * Beitrag gerade geschrieben hat oder im Verlauf sieht, besser als jede
 * Ähnlichkeit zwischen Posttext und Vorlagenbeschreibung.
 *
 * Nur das eigene Land: Katalogblock und Prüfung lesen dieselbe Liste, eine
 * AT-Vorlage in einem DE-Turn fällt also auch dann heraus, wenn das Modell
 * ihre ID erfindet. Eine Vorlage im Design des anderen Landes ist keine, die
 * die Person benutzen kann (siehe `sharepicVorlagenRouter`).
 */
import {
  type SharepicVorlage,
  type SharepicVorlagenSuggestion,
  sharepicVorlageThumbPath,
} from '@gruenerator/contracts';
import { SKILLS, type Skill } from '@gruenerator/shared/agents';
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { lastUserText } from '../../../agents/langgraph/ChatGraph/nodes/classifierHeuristics.js';
import { asksForDesignVorlagen } from '../../../agents/langgraph/ChatGraph/nodes/classifierSignals.js';
import { listSharepicVorlagen } from '../../../services/sharepicVorlagen/catalog.js';
import { extractTextContent } from '../services/messageHelpers.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { SSEWriter } from '../services/sseHelpers.js';

/** Kurze Antworten („ja", „gern, zeig mal") erben das Thema der Rückfrage davor. */
const SHORT_REPLY_CHARS = 60;

export function mentionsVorlagen(
  userText: string | null | undefined,
  lastAssistantText?: string | null
): boolean {
  if (asksForDesignVorlagen(userText)) return true;
  return (
    !!lastAssistantText &&
    (userText ?? '').trim().length <= SHORT_REPLY_CHARS &&
    asksForDesignVorlagen(lastAssistantText)
  );
}

export function vorlagenLocale(state: Pick<ChatGraphState, 'userLocale'>): 'de-DE' | 'de-AT' {
  return state.userLocale === 'de-AT' ? 'de-AT' : 'de-DE';
}

function catalogLine(v: SharepicVorlage): string {
  const seiten = v.spec.slides.length > 1 ? `, ${v.spec.slides.length} Seiten` : '';
  return `- ${v.id} · ${v.titel} (${v.form}${seiten}): ${v.anlass ?? v.beschreibung}`;
}

function toSuggestion(v: SharepicVorlage, grund: string): SharepicVorlagenSuggestion {
  return {
    id: v.id,
    titel: v.titel,
    form: v.form,
    grund,
    format: v.spec.format ?? 'post-portrait',
    seiten: v.spec.slides.length,
    thumbUrl: sharepicVorlageThumbPath(v.id, 1, v.thumbVersion),
  };
}

/**
 * Montiert nur mit nicht leerem Länderkatalog — der Aufrufer prüft das über
 * `listSharepicVorlagen`, ein Werkzeug ohne Auswahl wäre ein leeres Versprechen.
 */
export function makeSuggestVorlagenTool(ctx: {
  sse: SSEWriter;
  state: ChatGraphState;
  vorlagen: readonly SharepicVorlage[];
}): Tool {
  const { sse, state, vorlagen } = ctx;
  const byId = new Map(vorlagen.map((v) => [v.id, v]));
  return tool({
    description: `Zeigt dem*der Nutzer*in 1–4 passende Sharepic-Vorlagen als Bildergalerie im Chat. Aus einer Vorlage kann die Person per Klick ein Sharepic mit ihrem Beitragstext erstellen.

NUTZE WENN der*die Nutzer*in nach Design, Vorlagen, Gestaltungs- oder Designideen für einen Beitrag fragt, oder einer Rückfrage danach zustimmt — auch wenn es den Beitrag erst als Thema gibt. Zeige dann diese Vorlagen, statt Layouts, Farben oder Bildideen frei zu beschreiben. Nach einem fertigen Social-Post darfst du kurz anbieten, passende Vorlagen zu zeigen — zeige sie nicht ungefragt.
NICHT für echte Beispiel-Posts anderer (dafür gruenerator_examples_search) und NICHT, um selbst ein Sharepic zu erzeugen.

Wähle nach der Struktur des Beitrags: eine Kernbotschaft, ein Zitat, eine Zahl, ein Termin, mehrere Argumente. Gib je Vorlage einen kurzen Grund, warum sie zu DIESEM Beitrag passt. Nur IDs aus dieser Liste:
${vorlagen.map(catalogLine).join('\n')}`,
    inputSchema: z.object({
      beitrag: z
        .string()
        .min(1)
        .max(3000)
        .describe(
          'Der Beitragstext, für den die Vorlagen gedacht sind — wörtlich, ohne Hashtag-Block. Gibt es noch keinen Text: Thema und Kernaussage in einem Satz'
        ),
      auswahl: z
        .array(
          z.object({
            id: z.string().describe('ID aus der Liste'),
            grund: z
              .string()
              .min(1)
              .max(200)
              .describe('Ein kurzer Satz (höchstens 15 Wörter): warum sie zu diesem Beitrag passt'),
          })
        )
        .min(1)
        .max(4),
    }),
    execute: ({ beitrag, auswahl }) => {
      const seen = new Set<string>();
      const picked: SharepicVorlagenSuggestion[] = [];
      for (const { id, grund } of auswahl) {
        const vorlage = byId.get(id);
        if (!vorlage || seen.has(id)) continue;
        seen.add(id);
        picked.push(toSuggestion(vorlage, grund));
      }
      if (picked.length === 0) {
        return {
          error: `Unbekannte Vorlagen-IDs: ${auswahl.map((a) => a.id).join(', ')}. Wähle nur IDs aus der Liste in der Werkzeugbeschreibung.`,
        };
      }
      sse.send('vorlagen_suggestions', { vorlagen: picked, beitrag });
      state.vorlagenShown = picked.map((v) => v.titel);
      return {
        vorlagen: picked,
        beitrag,
        note: 'Die Vorlagen werden dem*der Nutzer*in als Galerie angezeigt. Nenne sie nicht noch einmal einzeln; ein kurzer Satz dazu genügt.',
      };
    },
  });
}

export function isSocialRecipe(mention: string | null | undefined): boolean {
  if (!mention) return false;
  const allSkills: readonly Skill[] = SKILLS;
  return allSkills.some(
    (s) => s.mention.toLowerCase() === mention.toLowerCase() && s.skillCategory === 'social'
  );
}

function lastAssistantText(state: ChatGraphState): string | null {
  const last = [...(state.messages ?? [])].reverse().find((m) => m.role === 'assistant');
  return last ? extractTextContent(last.content) : null;
}

/**
 * Der Länderkatalog, wenn dieser Turn das Werkzeug bekommt — sonst null. Tore:
 * das Vokabular (auch das der Rückfrage davor, für ein knappes „ja") oder ein
 * aktives Social-Rezept, nach dessen Post das Modell Vorlagen anbieten darf.
 */
export function vorlagenForTurn(state: ChatGraphState): SharepicVorlage[] | null {
  const wanted =
    isSocialRecipe(state.activeSkillMention) ||
    mentionsVorlagen(state.lastUserTextNoMentions ?? lastUserText(state), lastAssistantText(state));
  if (!wanted) return null;
  const vorlagen = listSharepicVorlagen(vorlagenLocale(state));
  return vorlagen.length > 0 ? vorlagen : null;
}

/**
 * Das Angebot nach einem Social-Post — als Rückfrage im Text, nicht als Chip
 * und nicht als ungefragte Galerie. Hängt an jeder Stelle, an der ein
 * Social-Rezept in den Prompt kommt (Einzeldurchlauf und Loop). Die Frage nennt
 * „Sharepic-Vorlagen", damit ein knappes „ja" danach die Vorlagen trifft
 * (`acceptsVorlagenOffer`, `mentionsVorlagen`).
 */
export function vorlagenOfferNote(
  state: Pick<ChatGraphState, 'userLocale' | 'vorlagenShown' | 'enabledTools'>,
  recipeMentions: readonly string[]
): string {
  // Dasselbe Tor wie die Montage: ein Agent ohne die Fähigkeit bietet sie nicht an.
  if (state.enabledTools?.['vorlagen'] === false) return '';
  if (state.vorlagenShown?.length) return '';
  if (!recipeMentions.some(isSocialRecipe)) return '';
  if (listSharepicVorlagen(vorlagenLocale(state)).length === 0) return '';
  return '\n\nABSCHLUSS: Schließe nach dem fertigen Beitrag mit EINER kurzen, freundlichen Rückfrage, ob du passende Sharepic-Vorlagen dazu zeigen sollst — aus jeder macht die Person mit einem Klick ein Sharepic mit diesem Text (z. B. „Soll ich dir passende Sharepic-Vorlagen zeigen? Daraus wird mit einem Klick ein Sharepic mit deinem Text."). Nur diese eine Frage; beschreibe kein Design.';
}
