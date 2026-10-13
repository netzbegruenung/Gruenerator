/**
 * Agent-draft synthesis for the conversational creator.
 *
 * Turns the creator conversation into a validated agent spec via one forced
 * tool call on the `creator_draft` lane. The closed sets (tools, skills) are
 * enforced here against the shared catalogs — the contract keeps them as free
 * arrays since `@gruenerator/contracts` can't import shared.
 */

import { type DraftedAgentSpec } from '@gruenerator/contracts';
import {
  SKILLS,
  USER_SELECTABLE_TOOLS,
  DEFAULT_USER_AGENT_TOOLS,
  SUGGESTED_AGENT_ICONS,
  DEFAULT_AGENT_ICON,
  isSuggestedAgentIcon,
} from '@gruenerator/shared/agents';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { createLogger } from '../../utils/logger.js';
import { aiObject } from '../ai/generate.js';
import { type StructuredValidation } from '../ai/structuredParsing.js';

const log = createLogger('AgentDraftService');

const TOOL_KEYS = new Set<string>(USER_SELECTABLE_TOOLS.map((t) => t.key));
const SKILL_MENTIONS = new Set<string>(SKILLS.map((s) => s.mention));
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const DEFAULT_COLOR = '#316049';

const TOOL_CATALOG = USER_SELECTABLE_TOOLS.map(
  (t) => `- ${t.key}: ${t.label} — ${t.description}`
).join('\n');
const SKILL_CATALOG = SKILLS.map((s) => `- ${s.mention}: ${s.title}`).join('\n');
const ICON_CATALOG = SUGGESTED_AGENT_ICONS.join(', ');

// LLM output schema. `enabledTools` is a free array and `defaultRecipeMention`
// a free string, both filtered against the catalogs after generation — strict
// enums would make the call fail on a single near-miss value.
// Minimums mirror the create contract (createUserAgentBodySchema) so a thin
// conversation can't 200 on /draft but 400 on create. Maximums are NOT
// enforced here: an overlong title/description or a fifth opening question
// would reject the whole draft, and draftAgentSpec clamps them afterwards.
const DraftSchema = z.object({
  title: z.string().min(1).describe('Kurzer Anzeigename, z.B. "Pressestelle Kreisverband"'),
  description: z.string().min(1).describe('Ein bis zwei Sätze: was der*die Agent*in tut'),
  systemRole: z
    .string()
    .min(20)
    .describe(
      'Ausführlicher System-Prompt für den*die Agent*in: Rolle, Aufgabe, Ton, Arbeitsweise. Du-Form, Genderstern (*innen).'
    ),
  iconKey: z
    .string()
    .describe('Icon-Schlüssel, ausschließlich aus dem Katalog (z.B. PiSparkle, PiMegaphone)'),
  backgroundColor: z.string().describe('Hex-Farbe wie #316049'),
  enabledTools: z.array(z.string()).describe('Werkzeug-Schlüssel, ausschließlich aus dem Katalog'),
  defaultRecipeMention: z
    .string()
    .nullable()
    .describe('Kern-Rezept, ausschließlich aus dem Katalog — leer lassen, wenn keins passt'),
  locale: z.enum(['de-DE', 'de-AT']).describe('Region: Deutschland oder Österreich'),
  openingMessage: z.string().describe('Begrüßung, die der*die Agent*in beim Start zeigt'),
  openingQuestions: z.array(z.string()).describe('Bis zu vier Beispiel-Startfragen'),
});
type Draft = z.infer<typeof DraftSchema>;

const DRAFT_TOOL_SCHEMA = zodToJsonSchema(DraftSchema, {
  target: 'jsonSchema7',
  $refStrategy: 'none',
}) as Record<string, unknown>;

function validateDraft(input: unknown): StructuredValidation<Draft> {
  const parsed = DraftSchema.safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issues = parsed.error.issues
    .slice(0, 6)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ');
  return { ok: false, error: `Ungültige Agent-Konfiguration: ${issues}` };
}

const SYSTEM_PROMPT = `Du bist der Spezifikations-Generator des Grünerator Agent-Creators. Aus der folgenden Beschreibung der Nutzer*in (eine kurze Vorgabe oder ein Gespräch) erstellst du die finale Konfiguration für eine*n neue*n KI-Agent*in.

Regeln:
- Schreibe alle nutzersichtbaren Texte auf Deutsch, in Du-Form und mit Genderstern (*innen).
- Der systemRole ist der wichtigste Teil: formuliere eine klare Rolle, Aufgabe, Tonalität und Arbeitsweise, passend zum besprochenen Zweck. Schreibe ihn so, als würdest du den*die Agent*in direkt instruieren ("Du bist ...").
- enabledTools: Wähle NUR Schlüssel aus diesem Katalog, passend zum Zweck:
${TOOL_CATALOG}
- defaultRecipeMention: Das eine Kern-Rezept dieses Agenten, NUR aus diesem Katalog (null, wenn nichts passt):
${SKILL_CATALOG}
- iconKey: Wähle GENAU EINEN passenden Icon-Schlüssel aus dieser Liste: ${ICON_CATALOG}
- locale: 'de-AT' nur, wenn explizit Österreich besprochen wurde, sonst 'de-DE'.
- Erfinde keine Werte außerhalb der Kataloge.`;

function buildTranscript(messages: ReadonlyArray<{ role: string; content: string }>): string {
  return messages
    .map((m) => `${m.role === 'user' ? 'Nutzer*in' : 'Creator'}: ${m.content}`)
    .join('\n\n');
}

/** Synthesize a validated agent spec from the creator conversation. */
export async function draftAgentSpec(
  messages: ReadonlyArray<{ role: string; content: string }>
): Promise<DraftedAgentSpec> {
  const generated = await aiObject<Draft>({
    lane: 'creator_draft',
    system: SYSTEM_PROMPT,
    prompt: `## Gespräch\n\n${buildTranscript(messages)}\n\nErstelle daraus die Agent*innen-Konfiguration.`,
    toolName: 'create_agent_spec',
    toolDescription: 'Gibt die fertige Konfiguration des neuen Agents zurück.',
    schema: DRAFT_TOOL_SCHEMA,
    validate: validateDraft,
    // A detailed brief yields a systemRole of up to 8k chars as a tool call;
    // 4096 cut 2 of 6 long drafts off (stop=length, measured 15.10.2026).
    maxOutputTokens: 8192,
    temperature: 0.4,
    label: 'agent_draft',
  });
  if (!generated.ok) throw new Error(generated.error);
  const draft = generated.data;

  const enabledTools = draft.enabledTools.filter((t) => TOOL_KEYS.has(t));
  const defaultRecipeMention =
    draft.defaultRecipeMention && SKILL_MENTIONS.has(draft.defaultRecipeMention)
      ? draft.defaultRecipeMention
      : null;
  // Clamp to the curated set so the synthesized name always resolves to an icon.
  const iconKey = isSuggestedAgentIcon(draft.iconKey.trim())
    ? draft.iconKey.trim()
    : DEFAULT_AGENT_ICON;

  log.info(
    `[draftAgentSpec] "${draft.title}" icon=${iconKey} tools=[${enabledTools.join(',')}] recipe=${defaultRecipeMention ?? '-'} locale=${draft.locale}`
  );

  return {
    title: draft.title.trim().slice(0, 100),
    description: draft.description.trim().slice(0, 500),
    systemRole: draft.systemRole.trim(),
    iconKey,
    backgroundColor: HEX_RE.test(draft.backgroundColor) ? draft.backgroundColor : DEFAULT_COLOR,
    enabledTools: enabledTools.length > 0 ? enabledTools : [...DEFAULT_USER_AGENT_TOOLS],
    // Deprecated field kept for the one-release overlap (deployed web bundle
    // still reads it) — new drafts carry the binding via defaultRecipeMention.
    skillMentions: [],
    defaultRecipeMention,
    locale: draft.locale,
    openingMessage: draft.openingMessage.trim(),
    openingQuestions: draft.openingQuestions.slice(0, 4),
  };
}
