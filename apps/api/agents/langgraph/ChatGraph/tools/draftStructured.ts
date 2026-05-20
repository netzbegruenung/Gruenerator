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

const ANTRAG_SCHEMA = z
  .object({
    dokumenttyp: z
      .enum([
        'antrag',
        'kleine_anfrage',
        'grosse_anfrage',
        'haushaltsantrag',
        'haushaltsbewertung',
        'resolution',
      ])
      .describe(
        'Art des Dokuments. "antrag"/"kleine_anfrage"/"grosse_anfrage" für klassische Vorlagen, "haushaltsantrag" für Änderungsanträge zum Haushalt (Stelle/Betrag/Deckung), "haushaltsbewertung" für formale Stellungnahmen zu einem Haushaltsentwurf, "resolution" für politische Beschlüsse mit zentraler Forderung.'
      ),
    betreff: z.string().describe('Kurzer, prägnanter Titel des Dokuments'),
    antragsart: z
      .enum(['Beschlussvorlage', 'Kleine Anfrage', 'Große Anfrage'])
      .optional()
      .describe(
        'Kategorie-Label für klassische Anträge (nur bei dokumenttyp antrag/kleine_anfrage/grosse_anfrage)'
      ),
    beschlussvorschlag: z
      .string()
      .optional()
      .describe('Konkreter Beschlusstext ("Die Verwaltung wird beauftragt...")'),
    sachverhalt: z.string().optional().describe('Beschreibung der Ausgangslage (Ist-Zustand)'),
    begruendung: z.string().optional().describe('Argumente und Fakten (Soll-Zustand, Nutzen)'),
    kosten: z.string().optional().describe('Kostenabschätzung oder Hinweis auf Kostenermittlung'),

    // Haushaltsantrag fields
    haushaltsstelle: z
      .string()
      .optional()
      .describe('Haushaltsstelle bzw. Produkt/Konto (nur bei haushaltsantrag)'),
    aenderungsbetrag: z
      .string()
      .optional()
      .describe('Änderungsbetrag mit Vorzeichen, z.B. "+ 200.000 €" (nur bei haushaltsantrag)'),
    deckungsvorschlag: z
      .string()
      .optional()
      .describe('Vorschlag zur Gegenfinanzierung (nur bei haushaltsantrag)'),

    // Resolution fields
    forderung: z
      .string()
      .optional()
      .describe('Zentrale politische Forderung als Beschlusstext (nur bei resolution)'),

    // Haushaltsbewertung fields
    gesamteinschaetzung: z
      .string()
      .optional()
      .describe('2-3 Sätze Gesamteinschätzung (nur bei haushaltsbewertung)'),
    staerken: z
      .array(z.string())
      .optional()
      .describe('Stärken des Entwurfs aus grüner Sicht (nur bei haushaltsbewertung)'),
    schwaechen: z
      .array(z.string())
      .optional()
      .describe('Schwächen / blinde Flecken (nur bei haushaltsbewertung)'),
    fehlende_akzente: z
      .array(z.string())
      .optional()
      .describe(
        'Fehlende grüne Akzente (Klima, Soziales, Beteiligung) (nur bei haushaltsbewertung)'
      ),
    vergleichswerte: z
      .string()
      .optional()
      .describe('Vergleichswerte / Maßstäbe anderer Kommunen (nur bei haushaltsbewertung)'),
    verbesserungsvorschlaege: z
      .array(z.string())
      .optional()
      .describe('Konkrete umsetzbare Verbesserungsvorschläge (nur bei haushaltsbewertung)'),
  })
  .describe('Antrag / Anfrage / Haushaltsantrag / Bewertung / Resolution Schema');

const REDE_SCHEMA = z
  .object({
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
        })
      )
      .min(2)
      .max(4)
      .describe('2-3 Kernargumente mit Belegen'),
    schlussideen: z.array(z.string()).min(2).max(3).describe('2-3 Ideen für ein starkes Ende'),
    redetext: z.string().describe('Der vollständige Redetext'),
    rednerhinweise: z.array(z.string()).min(2).max(3).describe('2-3 Tipps für die*den Redner*in'),
  })
  .describe('Rede Schema');

const WAHLPROGRAMM_SCHEMA = z
  .object({
    kapitel_titel: z.string().describe('Titel des Wahlprogramm-Kapitels'),
    einleitung: z.string().describe('Kurze Einleitung (2-3 Sätze) zur Bedeutung des Themas'),
    unterkapitel: z
      .array(
        z.object({
          ueberschrift: z.string().describe('Aussagekräftige Überschrift'),
          inhalt: z.string().describe('2-3 Absätze mit mindestens einer konkreten Forderung'),
        })
      )
      .min(3)
      .max(5)
      .describe('3-4 Unterkapitel'),
  })
  .describe('Wahlprogramm Schema');

// ---------------------------------------------------------------------------
// Schema map + formatting
// ---------------------------------------------------------------------------

type AgentSchema = typeof ANTRAG_SCHEMA | typeof REDE_SCHEMA | typeof WAHLPROGRAMM_SCHEMA;

const SCHEMA_MAP: Record<string, AgentSchema> = {
  'gruenerator-antrag': ANTRAG_SCHEMA,
  'gruenerator-rede-schreiber': REDE_SCHEMA,
  'gruenerator-wahlprogramm': WAHLPROGRAMM_SCHEMA,
};

const DOKUMENTTYP_LABEL: Record<z.infer<typeof ANTRAG_SCHEMA>['dokumenttyp'], string> = {
  antrag: 'Antrag',
  kleine_anfrage: 'Kleine Anfrage',
  grosse_anfrage: 'Große Anfrage',
  haushaltsantrag: 'Änderungsantrag zum Haushalt',
  haushaltsbewertung: 'Stellungnahme zum Haushalt',
  resolution: 'Resolution',
};

function pushSection(lines: string[], heading: string, body: string | undefined): void {
  if (!body) return;
  lines.push('', heading, body);
}

function pushBulletSection(lines: string[], heading: string, items: string[] | undefined): void {
  if (!items || items.length === 0) return;
  lines.push('', heading);
  for (const item of items) lines.push(`- ${item}`);
}

function formatAntrag(data: z.infer<typeof ANTRAG_SCHEMA>): string {
  const typLabel = data.antragsart ?? DOKUMENTTYP_LABEL[data.dokumenttyp];
  const lines: string[] = [`# ${typLabel}: ${data.betreff}`];

  if (data.dokumenttyp === 'haushaltsbewertung') {
    pushSection(lines, '## Gesamteinschätzung', data.gesamteinschaetzung);
    pushBulletSection(lines, '## Stärken', data.staerken);
    pushBulletSection(lines, '## Schwächen aus grüner Sicht', data.schwaechen);
    pushBulletSection(lines, '## Fehlende Akzente', data.fehlende_akzente);
    pushSection(lines, '## Vergleichswerte', data.vergleichswerte);
    pushBulletSection(lines, '## Konkrete Verbesserungsvorschläge', data.verbesserungsvorschlaege);
    return lines.join('\n');
  }

  if (data.dokumenttyp === 'resolution') {
    pushSection(lines, '## Forderung', data.forderung ?? data.beschlussvorschlag);
    pushSection(lines, '## Begründung', data.begruendung);
    return lines.join('\n');
  }

  pushSection(lines, '## Beschlussvorschlag', data.beschlussvorschlag);

  if (data.dokumenttyp === 'haushaltsantrag') {
    pushSection(lines, '## Haushaltsstelle', data.haushaltsstelle);
    pushSection(lines, '## Änderungsbetrag', data.aenderungsbetrag);
    pushSection(lines, '## Deckungsvorschlag', data.deckungsvorschlag);
  } else {
    pushSection(lines, '## Sachverhalt', data.sachverhalt);
  }

  pushSection(lines, '## Begründung', data.begruendung);
  pushSection(lines, '## Finanzielle Auswirkungen', data.kosten);
  return lines.join('\n');
}

function formatRede(data: z.infer<typeof REDE_SCHEMA>): string {
  const lines = [
    `# Rede: ${data.anlass}`,
    '',
    `## Einstiegsideen`,
    ...data.einstiegsideen.map((e: string, i) => `${i + 1}. ${e}`),
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
  const lines = [`# ${data.kapitel_titel}`, '', data.einleitung];
  for (const uk of data.unterkapitel) {
    lines.push('', `## ${uk.ueberschrift}`, '', uk.inhalt);
  }
  return lines.join('\n');
}

// Formatters are called with the validated Zod-inferred data for each schema type.
// Each formatter accepts its specific inferred type; we cast at the dispatch boundary.
type Formatter = (data: Record<string, unknown>) => string;

const FORMATTER_MAP: Record<string, Formatter> = {
  'gruenerator-antrag': formatAntrag as Formatter,
  'gruenerator-rede-schreiber': formatRede as Formatter,
  'gruenerator-wahlprogramm': formatWahlprogramm as Formatter,
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

  // @ts-expect-error - Zod schema type compatibility with LangChain ToolInputSchemaBase
  return new DynamicStructuredTool({
    name: 'draft_structured',
    description:
      'Erstelle einen strukturierten Entwurf mit allen erforderlichen Abschnitten. ' +
      'Dieses Tool validiert die Vollständigkeit und formatiert das Dokument korrekt.',
    schema,
    func: async (input: z.infer<typeof schema>) => {
      const formatter = FORMATTER_MAP[agentId];
      if (!formatter) {
        return JSON.stringify({ error: 'Kein Formatierer für diesen Agenten verfügbar.' });
      }

      try {
        const formatted = formatter(input);
        const dokumenttyp =
          typeof (input as { dokumenttyp?: unknown }).dokumenttyp === 'string'
            ? (input as { dokumenttyp: string }).dokumenttyp
            : undefined;
        log.info(
          `[DraftStructured] Agent=${agentId}${dokumenttyp ? ` dokumenttyp=${dokumenttyp}` : ''} sections validated, ${formatted.length} chars`
        );

        return formatted;
      } catch (err: unknown) {
        log.warn(
          `[DraftStructured] Formatting failed: ${err instanceof Error ? err.message : String(err)}`
        );
        return JSON.stringify({
          error: 'Strukturvalidierung fehlgeschlagen',
          details: err instanceof Error ? err.message : String(err),
        });
      }
    },
  });
}
