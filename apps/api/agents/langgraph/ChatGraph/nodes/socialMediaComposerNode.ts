/**
 * Social-media prompt construction.
 *
 * Builds a social-media-specific system prompt grounded on full Insta captions
 * / FB posts retrieved by searchNode, and picks a platform-specific craft
 * rubric when `state.platform` is set.
 *
 * The file also held a `socialMediaComposerNode` that wrapped
 * `buildSocialMediaSystemPrompt` for the compiled ChatGraph. That graph had no
 * callers and is gone, so the node went with it — but the two prompt helpers
 * below are very much live: `socialPostService` uses
 * `buildSocialMediaSystemPrompt`, `socialPostEditService` uses
 * `craftGuidanceForPlatform` (das intern erst den angelernten Stil sucht und
 * bei fehlendem Rezept auf `rubricForPlatform` zurückfällt).
 */

import { SKILLS } from '@gruenerator/shared/agents';

import {
  embedUntrusted,
  INSTRUCTION_HIERARCHY_RULE,
} from '../../../../routes/chat/services/untrustedContent.js';
import { CONTENT_INTEGRITY_RULES } from '../../../../services/contentPolicy.js';
import { getInternalSkillPrompt } from '../../../../services/skills/internalPrompts.js';
import { getTextFormForInjection } from '../../../../services/user/textFormRepository.js';
import { createLogger } from '../../../../utils/logger.js';
import { formatGermanDate } from '../../../../utils/stringUtils.js';

import { detectSocialPlatform } from './classifierHeuristics.js';
import { deriveTextFormMention } from './textFormMention.js';

import type { ChatGraphState, SocialExampleItem, SocialTextPlatform } from '../types.js';

const log = createLogger('ChatGraph:SocialComposer');

const INSTAGRAM_RUBRIC = `## INSTAGRAM-HANDWERK

Eine starke Instagram-Caption folgt einer klaren Dramaturgie:

1. **Hook in Zeile 1** — eine prägnante Aussage, Frage oder ein Statement, das in der Vorschau (vor dem "Mehr"-Klick) Aufmerksamkeit fängt. Keine Anrede, kein Lead-In.
2. **Aufbau** — 2–4 kurze Absätze, durch Leerzeilen rhythmisiert. Persönlich, konkret, mit klarer Position.
3. **Call-to-Action** — eine Aufforderung (Kommentar, Link in Bio, Petition, Termin) am Ende des Fließtexts.
4. **Hashtags** — 5–10 thematische Hashtags am Ende, durch Zeilenumbruch getrennt vom Text. Relevante Mischung aus thematisch (#Klimaschutz #Mobilitätswende) und brand (#GrüneBerlin #Bündnis90).
5. **Emojis** — 1–4 zur Strukturierung oder Akzentuierung, nicht inflationär.

**Tonalität**: aktiv, nahbar, klare Haltung. Du-Form. Genderstern (\`*in\` / \`*innen\`). Keine Marketing-Floskeln.
**Länge**: 800–1500 Zeichen (Caption-Format).`;

const FACEBOOK_RUBRIC = `## FACEBOOK-HANDWERK

Ein wirkungsvoller Facebook-Post ist kürzer und konversationeller als Instagram:

1. **Direkter Einstieg** — eine Aussage oder Beobachtung in 1–2 Sätzen.
2. **Kernaussage** — die Position oder Forderung in 2–4 Sätzen, mit Verweis auf den verlinkten Inhalt (Artikel, Video, Termin).
3. **Call-to-Action** — knapp, oft als Frage ans Publikum oder Hinweis auf den Link.
4. **Hashtags** — 1–3 maximal, am Ende. Facebook gewichtet sie weniger als Instagram.
5. **Emojis** — sparsam, 0–2.

**Tonalität**: dialogisch, einladend zur Diskussion. Du-Form. Genderstern (\`*in\` / \`*innen\`). Stärker faktenorientiert als Instagram.
**Länge**: 400–800 Zeichen.`;

// Twitter/LinkedIn tone and budgets follow the platform block in
// apps/api/prompts/social.json (the standalone /api/texte/social generator);
// the examples collection has no posts for these platforms, so the rubric
// carries the full craft guidance.
const TWITTER_RUBRIC = `## X/TWITTER-HANDWERK

Ein starker Post für X/Twitter (gilt auch für Mastodon und Bluesky) ist pointiert und auf den Punkt:

1. **Eine Kernaussage** — keine Threads, keine Aufzählungen: die eine Position oder Forderung, zugespitzt formuliert.
2. **Zuspitzung** — überraschende Zahl, klare Haltung oder prägnanter Kontrast im ersten Halbsatz.
3. **Hashtags** — maximal 1–2, nur wenn strategisch sinnvoll (laufende Debatte, Kampagne).
4. **Emojis** — 0–1, nur als Akzent.

**Tonalität**: pointiert, selbstbewusst, diskursfähig. Du-Form. Genderstern (\`*in\` / \`*innen\`).
**Länge**: MAXIMAL 280 Zeichen — das ist ein hartes Limit, zähle mit.`;

const LINKEDIN_RUBRIC = `## LINKEDIN-HANDWERK

Ein wirkungsvoller LinkedIn-Post ist professionell und argumentativ:

1. **Hook in Zeile 1** — eine These oder Beobachtung, die zum Weiterlesen bewegt (Vorschau bricht früh ab).
2. **Argumentation** — 2–4 kurze Absätze mit fachlichem Fokus: Zahlen, Zusammenhänge, konkrete politische Einordnung.
3. **Call-to-Action** — Einladung zur Diskussion oder Verweis auf Quelle/Termin.
4. **Hashtags** — 2–4 thematische am Ende.
5. **Emojis** — sparsam, 0–2, eher als Gliederung.

**Tonalität**: professionell, faktenorientiert, trotzdem klare grüne Haltung. Genderstern (\`*in\` / \`*innen\`).
**Länge**: 600–1200 Zeichen.`;

const GENERIC_RUBRIC = `## SOCIAL-MEDIA-HANDWERK

Ein guter Social-Media-Post folgt einer klaren Struktur:

1. **Hook** — der erste Satz fängt Aufmerksamkeit (Aussage, Frage, überraschende Zahl).
2. **Kernaussage** — Position, Forderung oder Information in 2–4 kurzen Absätzen.
3. **Call-to-Action** — eine konkrete Aufforderung am Ende.
4. **Hashtags** — 3–7 thematische Hashtags am Ende, durch Leerzeile vom Text getrennt.
5. **Emojis** — 1–3, gezielt zur Struktur oder Akzentuierung.

**Tonalität**: aktiv, nahbar, klare grüne Haltung. Du-Form. Genderstern (\`*in\` / \`*innen\`).
**Länge**: 500–1500 Zeichen — kürzer für Facebook-artige Inhalte, länger für Instagram-Captions.

Falls die Plattform nicht explizit benannt ist, schreibe als Default für **Instagram** (längere Caption mit mehr Hashtags).`;

/**
 * Der AUFFANG. Steht hier im öffentlichen Repo, weil er generisches Handwerk
 * ist — kein Korpuswissen, keine Gegner-Frames — und weil ohne ihn eine Instanz
 * ohne ausgerolltes `INTERN_CONTENT_DIR` gar keine Formvorgabe hätte.
 *
 * Er ist NICHT die Wahrheit über unsere Posts, und war es nie: gemessen gegen
 * die Rezepte (korpusgestützt, im privaten Repo) widerspricht er ihnen. Instagram
 * steht hier bei 800–1500 Zeichen, im Korpus liegt das Zielband bei 350–750 mit
 * Median 530; LinkedIn steht hier bei 600–1200, im Rezept bei maximal 600. Dazu
 * fehlt ihm die AT-Gabelung (Doppelpunkt statt Stern, eigenes Vokabular), die
 * jedes Rezept mitbringt. Deshalb gewinnt das Rezept, wo es eines gibt.
 */
export function rubricForPlatform(platform: SocialTextPlatform | null): string {
  if (platform === 'instagram') return INSTAGRAM_RUBRIC;
  if (platform === 'facebook') return FACEBOOK_RUBRIC;
  if (platform === 'twitter') return TWITTER_RUBRIC;
  if (platform === 'linkedin') return LINKEDIN_RUBRIC;
  return GENERIC_RUBRIC;
}

/** Die Rezepte, die für einen Social-Post-Turn überhaupt in Frage kommen. */
const SOCIAL_SKILL_MENTIONS: ReadonlySet<string> = new Set(
  SKILLS.filter((s) => s.skillCategory === 'social').map((s) => s.mention)
);

/**
 * Dieselbe Vokabel wie `respondNode` (`[Rezept] Prompt-Fragment … quelle=…`),
 * damit im Log überhaupt entscheidbar wird, welcher Knoten einen Turn
 * geschrieben hat. Dieser hier schwieg bis 08/2026 vollständig: eine Meldung
 * „mein angelernter Stil wirkt nicht" liess sich am Log nicht von „der
 * Klassifikator ging woandershin" trennen, weil BEIDE Fälle keine Zeile
 * erzeugten (#2938).
 */
function logChoice(mention: string | null, quelle: 'nutzer' | 'system' | 'rubrik'): void {
  log.info(`[Rezept] Social-Handwerk mention=${mention ?? 'keine'} quelle=${quelle}`);
}

/**
 * Das Handwerk für diesen Turn: ANGELERNTER STIL vor REZEPT vor eingebauter
 * Rubrik.
 *
 * Zwei Wege hinein, und der erste war bis hierher eine stille Fallgrube: wer im
 * Composer `/instagram` wählt, setzt `activeSkillMention` — aber der
 * Social-Post-Zweig baut seinen Systemtext hier und nicht in
 * `buildSystemMessage`, und las das Feld nie. Die ausdrückliche Wahl fiel
 * ersatzlos weg, während dieselbe Wahl auf einem `produktion`-Turn wirkte.
 *
 * Der zweite Weg ist die erkannte Plattform. Die Rezept-Erwähnungen heissen wie
 * die Plattformen (`instagram`, `facebook`, `twitter`, `linkedin`), also trägt
 * schon „Schreib einen Insta-Post zu X" das Rezept herein.
 *
 * `SOCIAL_SKILL_MENTIONS` ist das Gitter dazwischen: eine ausdrücklich gewählte
 * Textform aus einer anderen Familie (`/presse`) darf einen Social-Turn nicht
 * umwidmen. Die LV-Varianten (`insta-berlin` …) stehen bewusst mit drin — sie
 * sind dieselbe Textsorte, nur enger.
 *
 * Der angelernte Stil („Texte anlernen") kam hier bis 08/2026 gar nicht vor —
 * das war der dritte, abweichende Weg für dieselbe Einstellung (#2938). Auf den
 * beiden anderen (`respondNode.buildSystemMessage`, `recipeCatalog.resolveRecipe`)
 * ERSETZT er den mitgelieferten Rezepttext vollständig; hier ersetzte er nichts,
 * und ob eine hinterlegte Instagram-Form wirkte, hing daran, welchen Knoten der
 * Klassifikator gewählt hatte — eine Unterscheidung, die es in der Oberfläche
 * nicht gibt.
 *
 * Nachgeschlagen wird unter der Mention, die die Weiche oben ERGEBEN hat, nicht
 * unter `activeSkillMention` oder `platform` für sich. Sonst entstünde genau das
 * dritte Verhalten wieder: `/facebook` auf einem erkannten Instagram-Turn nimmt
 * das Facebook-Rezept, müsste aber den Instagram-Stil ziehen. Die Reihenfolge
 * ist damit dieselbe wie in `respondNode` — erst die wirksame Mention bestimmen,
 * dann `deriveTextFormMention` darauf (seit #2935 die EXAKTE Mention, kein
 * Präfix-Falten).
 *
 * Async, weil der Nachschlag in die Datenbank geht (gecacht, 1 h). Beide
 * Aufrufer waren es ohnehin schon.
 */
export async function craftGuidanceForPlatform(
  platform: SocialTextPlatform | null,
  activeSkillMention?: string | null,
  userId?: string | null
): Promise<string> {
  const mention =
    activeSkillMention && SOCIAL_SKILL_MENTIONS.has(activeSkillMention)
      ? activeSkillMention
      : (platform ?? null);

  const textFormMention = mention ? deriveTextFormMention(mention) : null;
  const userTextForm =
    userId && textFormMention ? await getTextFormForInjection(userId, textFormMention) : null;
  if (userTextForm) {
    // Eingefasst wie auf den beiden anderen Wegen: Nutzertext, der einen
    // Systemprompt erreicht, ohne dass die Person ihn in DIESEM Turn ausgewählt
    // hat. Die Regelhierarchie kommt mit, sonst steht hier eine
    // `<untrusted_content>`-Markierung, die der Prompt nirgends erklärt.
    logChoice(mention, 'nutzer');
    return `## PLATTFORM-HANDWERK\n\n${embedUntrusted('nutzer_anweisung', userTextForm.styleBlock)}${INSTRUCTION_HIERARCHY_RULE}`;
  }

  const recipe = mention ? getInternalSkillPrompt(mention) : null;
  if (recipe) {
    logChoice(mention, 'system');
    return `## PLATTFORM-HANDWERK\n\n${recipe}`;
  }
  logChoice(mention, 'rubrik');
  // Der Auffang nimmt die Familie der gewählten Textform mit — und zwar in
  // DERSELBEN Reihenfolge wie oben, sonst kehrt ausgerechnet der Fallback die
  // Priorität um: wer `/facebook` gewählt hat und „Insta-Post" schreibt, bekäme
  // sonst die Instagram-Rubrik, während der Rezept-Zweig darüber Facebook nimmt.
  // Betrifft nur Instanzen ohne ausgerolltes `INTERN_CONTENT_DIR` (in Produktion
  // gibt es zu jeder Social-Textform ein Rezept), ist aber genau die Sorte
  // Abweichung, die man später als Fehler im Detektor sucht.
  // Derselbe Detektor wie in der Klassifikation, damit es dafür keine zweite
  // Namensheuristik gibt.
  return rubricForPlatform(mention ? (detectSocialPlatform(mention) ?? platform) : platform);
}

const PLATFORM_LABELS: Record<SocialTextPlatform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  twitter: 'X/Twitter',
  linkedin: 'LinkedIn',
};

function formatExample(ex: SocialExampleItem, idx: number): string {
  const meta = [ex.platform, ex.author, ex.date].filter(Boolean).join(' · ');
  const header = meta ? `### Vorlage ${idx + 1} (${meta})` : `### Vorlage ${idx + 1}`;
  return `${header}\n${ex.content}`;
}

/**
 * Build the social-specific system prompt: agent.systemRole + craft rubric +
 * up to 6 full social posts as worked examples + writing-assignment guidance.
 *
 * Pulls from `state.examplesResult.social` (populated by searchNode with full
 * bodies when fullBody=true was passed to searchExamples).
 */
export async function buildSocialMediaSystemPrompt(state: ChatGraphState): Promise<string> {
  const { agentConfig, examplesResult, platform, activeSkillMention } = state;
  const examples = (examplesResult?.social ?? []).slice(0, 6);

  const today = formatGermanDate();

  const platformNote = platform
    ? `\n\nDie*der Nutzer*in hat **${PLATFORM_LABELS[platform]}** angefragt. Halte dich an das ${PLATFORM_LABELS[platform]}-Handwerk unten.`
    : '';

  const examplesBlock =
    examples.length === 0
      ? '\n\n*(Keine Vorlagen verfügbar — schreibe eigenständig nach dem Handwerks-Standard.)*'
      : `\n\n## VORLAGEN\n\nFolgende echte Posts aus den Grünen-Kanälen dienen als Vorlage. Mimik ihren Hook, ihre Tonalität, ihre Hashtag-Setzung und ihre Absatzrhythmik — schreibe NICHT generisch.\n\n${examples.map(formatExample).join('\n\n---\n\n')}`;

  const craftGuidance = await craftGuidanceForPlatform(
    platform,
    activeSkillMention,
    agentConfig.userId
  );

  return `${agentConfig.systemRole}

Heutiges Datum: ${today}${platformNote}

${craftGuidance}${examplesBlock}

## SCHREIBAUFTRAG

Verfasse jetzt einen Social-Media-Post zum unten erfragten Thema. Befolge das Handwerk und mimik die Vorlagen. Kein einleitender Meta-Text ("Hier ist dein Post..."), kein abschließender Kommentar — nur der fertige Post inklusive Hashtags.
${CONTENT_INTEGRITY_RULES}

Antworte ausschließlich auf Deutsch — auch dann, wenn du die Anfrage ablehnst. Kannst oder willst du den Post nicht schreiben (etwa weil ein Zitat erfunden werden müsste), dann schreibe NUR einen deutschen Satz, der die Ablehnung begründet, und keinen Post-Entwurf.`;
}
