/**
 * Social-Media Composer Node
 *
 * Sibling of pressemitteilungComposerNode. Replaces respondNode for
 * `intent === 'examples'`. Builds a social-media-specific system prompt
 * grounded on full Insta captions / FB posts retrieved by searchNode and
 * picks a platform-specific craft rubric when state.platform is set.
 *
 * Writes the prompt to `state.responseText`. Same controller-level streaming
 * pipeline as respondNode and the press composer; the controller's Gemma 4
 * model override applies to this intent too.
 */

import { createLogger } from '../../../../utils/logger.js';
import { formatGermanDate } from '../../../../utils/stringUtils.js';

import type { ChatGraphState, SocialExampleItem, SocialTextPlatform } from '../types.js';

const log = createLogger('SocialMediaComposer');

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

/** Exported for the social_post generation + text-edit services. */
export function rubricForPlatform(platform: SocialTextPlatform | null): string {
  if (platform === 'instagram') return INSTAGRAM_RUBRIC;
  if (platform === 'facebook') return FACEBOOK_RUBRIC;
  if (platform === 'twitter') return TWITTER_RUBRIC;
  if (platform === 'linkedin') return LINKEDIN_RUBRIC;
  return GENERIC_RUBRIC;
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
export function buildSocialMediaSystemPrompt(state: ChatGraphState): string {
  const { agentConfig, examplesResult, platform } = state;
  const examples = (examplesResult?.social ?? []).slice(0, 6);

  const today = formatGermanDate();

  const platformNote = platform
    ? `\n\nDie*der Nutzer*in hat **${PLATFORM_LABELS[platform]}** angefragt. Halte dich an das ${PLATFORM_LABELS[platform]}-Handwerk unten.`
    : '';

  const examplesBlock =
    examples.length === 0
      ? '\n\n*(Keine Vorlagen verfügbar — schreibe eigenständig nach dem Handwerks-Standard.)*'
      : `\n\n## VORLAGEN\n\nFolgende echte Posts aus den Grünen-Kanälen dienen als Vorlage. Mimik ihren Hook, ihre Tonalität, ihre Hashtag-Setzung und ihre Absatzrhythmik — schreibe NICHT generisch.\n\n${examples.map(formatExample).join('\n\n---\n\n')}`;

  return `${agentConfig.systemRole}

Heutiges Datum: ${today}${platformNote}

${rubricForPlatform(platform)}${examplesBlock}

## SCHREIBAUFTRAG

Verfasse jetzt einen Social-Media-Post zum unten erfragten Thema. Befolge das Handwerk und mimik die Vorlagen. Kein einleitender Meta-Text ("Hier ist dein Post..."), kein abschließender Kommentar — nur der fertige Post inklusive Hashtags. Erfinde keine Fakten oder Zitate.`;
}

/**
 * Social-composition node. Sibling of respondNode and pressemitteilungComposer.
 * Pure prompt-builder; the controller still owns model resolution +
 * streamAndAccumulate.
 */
export async function socialMediaComposerNode(
  state: ChatGraphState
): Promise<Partial<ChatGraphState>> {
  const startTime = Date.now();
  const exampleCount = state.examplesResult?.social?.length ?? 0;
  const platformLabel = state.platform ?? 'auto';
  log.info(
    `[Composer] Building social prompt (platform=${platformLabel}, ${exampleCount} social examples available)`
  );

  try {
    const systemMessage = buildSocialMediaSystemPrompt(state);
    const responseTimeMs = Date.now() - startTime;
    log.info(`[Composer] Prompt prepared in ${responseTimeMs}ms (${systemMessage.length} chars)`);
    return {
      responseText: systemMessage,
      streamingStarted: false,
      responseTimeMs,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log.error('[Composer] Error:', errMsg);
    return {
      responseText: '',
      responseTimeMs: Date.now() - startTime,
      error: `Social prompt building failed: ${errMsg}`,
    };
  }
}
