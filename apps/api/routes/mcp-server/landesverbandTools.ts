/**
 * Die Landesverbands-Werkzeuge für Partner-Schlüssel.
 *
 * Sie sind das letzte, was nur der alte MCP-Server konnte. Dort waren sie drei
 * HTTP-Aufrufe zurück auf `/api/v1/notebooks*`; hier laufen sie in-process
 * gegen dieselben Funktionen, die die REST-Route benutzt.
 *
 * **Eigene Achse, kein MCP-Scope.** Der Landesverbands-Zugriff hängt an
 * `api_keys.scopes.landesverbaende`, nicht an den OAuth-Scopes. Als Eintrag in
 * `MCP_SCOPES` stünde er in `MCP_DEFAULT_SCOPE` — und ein claude.ai-Client, der
 * ohne `scope`-Parameter anfragt, bekäme ihn wortlos mitgeliefert, ohne je
 * einen Landesverband zu haben. Dasselbe Argument wie bei
 * `CHAT_COMPLETIONS_SCOPE`.
 *
 * Die Werkzeugnamen sind F0: Partner-Konfigurationen nennen sie wörtlich, und
 * eine ausgelieferte Client-Konfiguration lässt sich nicht nachziehen.
 */
import { buildSourceRef } from '@gruenerator/shared/utils';
import { z } from 'zod';

import { Sentry } from '../../lib/sentry.js';
import { createLogger } from '../../utils/logger.js';
import {
  listAllowedLandesverbaende,
  loadLandesverbandFilters,
  resolveLandesverband,
  searchLandesverbandChunks,
  type LandesverbandScope,
} from '../v1/landesverbandNotebooks.js';

import { absolutizeUrl } from './chatToolBridge.js';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

const log = createLogger('McpLandesverbandTools');

const READONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

function text(value: string, isError = false): CallToolResult {
  return {
    content: [{ type: 'text' as const, text: value }],
    ...(isError ? { isError: true } : {}),
  };
}

function structured(value: string, structuredContent: Record<string, unknown>): CallToolResult {
  return { content: [{ type: 'text' as const, text: value }], structuredContent };
}

function guarded<A>(name: string, fn: (args: A) => Promise<CallToolResult>) {
  return async (args: A): Promise<CallToolResult> => {
    try {
      return await fn(args);
    } catch (err) {
      log.error(`tool ${name} failed:`, err);
      Sentry.captureException(err, { tags: { mcp_tool: name } });
      return text('Aktion fehlgeschlagen — prüfe die übergebenen Parameter.', true);
    }
  };
}

const LIST_OUTPUT_SCHEMA = {
  landesverbaende: z.array(
    z.object({ code: z.string(), name: z.string(), collectionId: z.string() })
  ),
};

const SEARCH_OUTPUT_SCHEMA = {
  landesverband: z.string(),
  query: z.string(),
  resultsCount: z.number(),
  results: z.array(
    z.object({
      ref: z.string().nullable(),
      rank: z.number(),
      title: z.string(),
      url: z.string().nullable(),
      excerpt: z.string(),
      relevance: z.string(),
      date: z.string().nullable(),
    })
  ),
};

const FILTERS_OUTPUT_SCHEMA = {
  landesverband: z.string(),
  fields: z.array(
    z.object({
      field: z.string(),
      label: z.string(),
      type: z.enum(['keyword', 'date_range']),
      values: z.array(z.object({ value: z.string(), count: z.number() })).optional(),
      min: z.string().nullable().optional(),
      max: z.string().nullable().optional(),
    })
  ),
};

export interface LandesverbandToolOptions {
  userId: string;
  landesverbaende: LandesverbandScope;
}

/** Trägt dieser Schlüssel überhaupt einen Landesverband? */
export function hasLandesverbandAccess(scope: LandesverbandScope): boolean {
  return scope === '*' || (Array.isArray(scope) && scope.length > 0);
}

export function registerLandesverbandTools(
  server: McpServer,
  opts: LandesverbandToolOptions
): void {
  const { userId, landesverbaende } = opts;
  const allowed = listAllowedLandesverbaende(landesverbaende);
  const codes = allowed.map((lv) => lv.code);
  // Ein Enum statt eines freien Strings: der erlaubte Kreis steht schon fest,
  // wenn der Server gebaut wird, und ein Modell, das ihn kennt, rät ihn nicht.
  const codeEnum = codes.length > 0 ? z.enum(codes as [string, ...string[]]) : z.string();

  server.registerTool(
    'notebooks_list',
    {
      title: 'Zugängliche Landesverbände',
      description: `Listet die Landesverbände auf, die dieser Zugang abfragen darf. Die Codes daraus sind die gültigen Werte für landesverband in notebooks_search und notebooks_get_filters. Zugänglich: ${codes.join(', ') || '—'}.`,
      inputSchema: {},
      outputSchema: LIST_OUTPUT_SCHEMA,
      annotations: READONLY,
    },
    guarded('notebooks_list', async () => {
      const payload = { landesverbaende: allowed };
      if (allowed.length === 0) {
        return structured('Dieser Zugang hat keinen Landesverband freigeschaltet.', payload);
      }
      const lines = allowed.map((lv) => `- ${lv.code}: ${lv.name}`);
      return structured(`Zugängliche Landesverbände:\n${lines.join('\n')}`, payload);
    })
  );

  server.registerTool(
    'notebooks_search',
    {
      title: 'Landesverbands-Notebook durchsuchen',
      description:
        'Liefert die am besten passenden Textstellen aus dem Quellenbestand eines Landesverbands — ohne vorformulierte Antwort. Formuliere aus den Treffern selbst und belege sie über ihre ref. Filterwerte vorher mit notebooks_get_filters holen, nie raten.',
      inputSchema: {
        query: z.string().min(1).describe('Suchanfrage auf Deutsch'),
        landesverband: codeEnum.describe('Code aus notebooks_list, z.B. HH'),
        filters: z
          .record(z.string(), z.union([z.string(), z.array(z.string())]))
          .optional()
          .describe('Feldfilter aus notebooks_get_filters'),
        limit: z.number().int().min(1).max(20).default(8),
      },
      outputSchema: SEARCH_OUTPUT_SCHEMA,
      annotations: READONLY,
    },
    guarded('notebooks_search', async ({ query, landesverband, filters, limit }) => {
      const resolved = resolveLandesverband(landesverbaende, landesverband);
      if (!resolved.ok) return text(resolved.reason, true);

      const chunks = await searchLandesverbandChunks({
        collectionId: resolved.collectionId,
        query,
        userId,
        limit,
        ...(filters ? { filters } : {}),
      });

      const results = chunks.map((c, i) => ({
        // `rank` ordnet diese Antwort, `ref` benennt die Quelle über Aufrufe
        // hinweg — dieselbe Trennung wie in gruenerator_search.
        ref: buildSourceRef({ url: c.url, documentId: c.documentId }),
        rank: i + 1,
        title: c.title,
        url: c.url ? absolutizeUrl(c.url) : null,
        excerpt: c.excerpt,
        relevance: `${Math.round(c.similarity * 100)}%`,
        date: c.date,
      }));

      const payload = { landesverband, query, resultsCount: results.length, results };
      if (results.length === 0) return structured('Keine Treffer.', payload);

      const lines = results.map(
        (r) =>
          `[${r.rank}] **${r.title}** (${r.relevance})${r.url ? ` — ${r.url}` : ''}${r.ref ? ` [ref: ${r.ref}]` : ''}\n${r.excerpt}`
      );
      return structured(lines.join('\n\n'), payload);
    })
  );

  server.registerTool(
    'notebooks_get_filters',
    {
      title: 'Filterwerte eines Landesverbands',
      description:
        'Nennt die tatsächlich belegten Filterwerte im Bestand eines Landesverbands samt Trefferzahl. Vor jeder gefilterten notebooks_search aufrufen — die Werte lassen sich nicht erraten.',
      inputSchema: { landesverband: codeEnum.describe('Code aus notebooks_list, z.B. HH') },
      outputSchema: FILTERS_OUTPUT_SCHEMA,
      annotations: READONLY,
    },
    guarded('notebooks_get_filters', async ({ landesverband }) => {
      const resolved = resolveLandesverband(landesverbaende, landesverband);
      if (!resolved.ok) return text(resolved.reason, true);

      const filters = await loadLandesverbandFilters(resolved.collectionId);
      const entries = Object.entries(filters);
      const fields = entries.map(([field, entry]) => ({
        field,
        label: entry.label,
        type: entry.type,
        ...(entry.values ? { values: entry.values } : {}),
        ...(entry.min !== undefined ? { min: entry.min } : {}),
        ...(entry.max !== undefined ? { max: entry.max } : {}),
      }));

      if (entries.length === 0) {
        return structured(`Für ${landesverband} sind keine Filterfelder hinterlegt.`, {
          landesverband,
          fields,
        });
      }

      const blocks = entries.map(([field, entry]) => {
        if (entry.type === 'date_range') {
          return `**${field}** (${entry.label}, Zeitraum): ${entry.min ?? '?'} bis ${entry.max ?? '?'}`;
        }
        const values = (entry.values ?? [])
          .slice(0, 25)
          .map((v) => `${v.value} (${v.count})`)
          .join(', ');
        return `**${field}** (${entry.label}): ${values || '— keine Werte'}`;
      });
      return structured(`Filterfelder für ${landesverband}:\n\n${blocks.join('\n')}`, {
        landesverband,
        fields,
      });
    })
  );
}
