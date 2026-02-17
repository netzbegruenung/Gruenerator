/**
 * Structured Draft Tool (Tier 3)
 *
 * Provides agent-type-specific Zod schemas that enforce document structure.
 * The agent calls this tool with structured sections; the tool validates
 * completeness and returns a formatted document.
 *
 * Supported agents: Antragsschreiber, Rede-Schreiber, Wahlprogramm-Autor
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

import { createLogger } from '../../../../utils/logger.js';

import type { ToolDependencies } from './registry.js';

const log = createLogger('Tool:DraftStructured');

// ---------------------------------------------------------------------------
// Per-agent schemas
// ---------------------------------------------------------------------------

const ANTRAG_SCHEMA = z.object({
  betreff: z.string().describe('Kurzer, prägnanter Titel des Antrags'),
  antragsart: z
    .enum(['Beschlussvorlage', 'Kleine Anfrage', 'Große Anfrage'])
    .describe('Art des Antrags'),
  beschlussvorschlag: z
    .string()
    .describe('Konkreter Beschlusstext ("Die Verwaltung wird beauftragt...")'),
  sachverhalt: z.string().describe('Beschreibung der Ausgangslage (Ist-Zustand)'),
  begruendung: z.string().describe('Argumente und Fakten (Soll-Zustand, Nutzen)'),
  kosten: z
    .string()
    .optional()
    .describe('Kostenabschätzung oder Hinweis auf Kostenermittlung'),
});

const REDE_SCHEMA = z.object({
  anlass: z.string().describe('Anlass und Kontext der Rede'),
  einstiegsideen: z
    .array(z.string())
    .min(2)
    .max(3)
    .describe('2-3 unterschiedliche Ideen für den Einstieg'),
  kernargumente: z
    .array(
      z.object({
        argument: z.string().describe('Das Kernargument'),
        beleg: z.string().describe('Fakten oder Beispiele zur Unterstützung'),
      }),
    )
    .min(2)
    .max(4)
    .describe('2-3 Kernargumente mit Belegen'),
  schlussideen: z
    .array(z.string())
    .min(2)
    .max(3)
    .describe('2-3 Ideen für ein starkes Ende'),
  redetext: z.string().describe('Der vollständige Redetext'),
  rednerhinweise: z
    .array(z.string())
    .min(2)
    .max(3)
    .describe('2-3 Tipps für die*den Redner*in'),
});

const WAHLPROGRAMM_SCHEMA = z.object({
  kapitel_titel: z.string().describe('Titel des Wahlprogramm-Kapitels'),
  einleitung: z.string().describe('Kurze Einleitung (2-3 Sätze) zur Bedeutung des Themas'),
  unterkapitel: z
    .array(
      z.object({
        ueberschrift: z.string().describe('Aussagekräftige Überschrift'),
        inhalt: z.string().describe('2-3 Absätze mit mindestens einer konkreten Forderung'),
      }),
    )
    .min(3)
    .max(5)
    .describe('3-4 Unterkapitel'),
});

// ---------------------------------------------------------------------------
// Schema map + formatting
// ---------------------------------------------------------------------------

type AgentSchema =
  | typeof ANTRAG_SCHEMA
  | typeof REDE_SCHEMA
  | typeof WAHLPROGRAMM_SCHEMA;

const SCHEMA_MAP: Record<string, AgentSchema> = {
  'gruenerator-antrag': ANTRAG_SCHEMA,
  'gruenerator-rede-schreiber': REDE_SCHEMA,
  'gruenerator-wahlprogramm': WAHLPROGRAMM_SCHEMA,
};

function formatAntrag(data: z.infer<typeof ANTRAG_SCHEMA>): string {
  const lines = [
    `# ${data.antragsart}: ${data.betreff}`,
    '',
    `## Beschlussvorschlag`,
    data.beschlussvorschlag,
    '',
    `## Sachverhalt`,
    data.sachverhalt,
    '',
    `## Begründung`,
    data.begruendung,
  ];
  if (data.kosten) {
    lines.push('', `## Finanzielle Auswirkungen`, data.kosten);
  }
  return lines.join('\n');
}

function formatRede(data: z.infer<typeof REDE_SCHEMA>): string {
  const lines = [
    `# Rede: ${data.anlass}`,
    '',
    `## Einstiegsideen`,
    ...data.einstiegsideen.map((e, i) => `${i + 1}. ${e}`),
    '',
    `## Kernargumente`,
    ...data.kernargumente.map((k, i) => `${i + 1}. **${k.argument}**\n   _Beleg:_ ${k.beleg}`),
    '',
    `## Ideen für das Ende`,
    ...data.schlussideen.map((s, i) => `${i + 1}. ${s}`),
    '',
    `## Tipps für die*den Redner*in`,
    ...data.rednerhinweise.map((h) => `- ${h}`),
    '',
    '---',
    '',
    `## Redetext`,
    '',
    data.redetext,
  ];
  return lines.join('\n');
}

function formatWahlprogramm(data: z.infer<typeof WAHLPROGRAMM_SCHEMA>): string {
  const lines = [
    `# ${data.kapitel_titel}`,
    '',
    data.einleitung,
  ];
  for (const uk of data.unterkapitel) {
    lines.push('', `## ${uk.ueberschrift}`, '', uk.inhalt);
  }
  return lines.join('\n');
}

type Formatter = (data: any) => string;

const FORMATTER_MAP: Record<string, Formatter> = {
  'gruenerator-antrag': formatAntrag,
  'gruenerator-rede-schreiber': formatRede,
  'gruenerator-wahlprogramm': formatWahlprogramm,
};

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createDraftStructuredTool(deps: ToolDependencies): DynamicStructuredTool | null {
  const agentId = deps.agentConfig.identifier;
  const schema = SCHEMA_MAP[agentId];

  if (!schema) {
    return null;
  }

  return new DynamicStructuredTool({
    name: 'draft_structured',
    description:
      'Erstelle einen strukturierten Entwurf mit allen erforderlichen Abschnitten. ' +
      'Dieses Tool validiert die Vollständigkeit und formatiert das Dokument korrekt.',
    schema,
    func: async (input) => {
      const formatter = FORMATTER_MAP[agentId];
      if (!formatter) {
        return JSON.stringify({ error: 'Kein Formatierer für diesen Agenten verfügbar.' });
      }

      try {
        const formatted = formatter(input);
        log.info(`[DraftStructured] Agent=${agentId} sections validated, ${formatted.length} chars`);

        return formatted;
      } catch (err: any) {
        log.warn(`[DraftStructured] Formatting failed: ${err.message}`);
        return JSON.stringify({
          error: 'Strukturvalidierung fehlgeschlagen',
          details: err.message,
        });
      }
    },
  });
}
