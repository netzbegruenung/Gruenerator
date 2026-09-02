/**
 * `memory` — the model saves, changes or forgets what the person explicitly
 * asked it to remember.
 *
 * One tool with an `action` enum, not three: the tool catalog is the largest
 * token item of every loop call (see cloudFileTools.ts). The prompt already
 * carries every instruction and the matching facts, numbered — `update` and
 * `forget` address those numbers, so there is no search action and no listing.
 *
 * Results carry the row `id` next to the turn-local `nr`, so a chat card can
 * offer "vergessen" without a round trip through the settings tab.
 *
 * The result is grounded through `sourceRegistry.note`, not `register`: in
 * split mode the writer model never sees tool return values, only the rendered
 * source block, and a "Gemerkt" line is an outcome to report, not research
 * material (personalDataTools.ts explains the difference).
 */
import { MEMORY_TEXT_MAX_CHARS, memoryKindSchema } from '@gruenerator/contracts';
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import {
  memoryService,
  MemoryRejectedError,
  type MemoryService,
  type RenderedMemory,
} from '../../../services/memory/index.js';
import { createLogger } from '../../../utils/logger.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { SourceRegistry } from '../services/agenticLoop/sourceRegistry.js';

const log = createLogger('memoryTools');

export interface MemoryToolCtx {
  state: ChatGraphState;
  threadId: string | null;
  sourceRegistry: SourceRegistry;
  /** Injected so the test runs without Postgres or Qdrant. */
  service?: Pick<MemoryService, 'create' | 'update' | 'remove'>;
}

const NO_SESSION = 'Keine Nutzer-Sitzung — Erinnerungen brauchen eine angemeldete Person.';

const memoryInputSchema = z.object({
  action: z
    .enum(['save', 'update', 'forget'])
    .describe('save = neu merken, update = Nr. ändern, forget = Nr. löschen'),
  kind: memoryKindSchema
    .optional()
    .describe(
      'Nur bei save. anweisung = Dauerregel für deine Antworten („immer ohne Gendersternchen schreiben"); fakt = Angabe zur Person („schreibt für den Kreisverband Köln").'
    ),
  text: z
    .string()
    .max(MEMORY_TEXT_MAX_CHARS)
    .optional()
    .describe(
      'Bei save und update. EIN vollständiger Satz — als Regel („Immer …") oder in der dritten Person („Ist …"). Keine Einmal-Wünsche, keine Wiedergabe des ganzen Gesprächs.'
    ),
  nr: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Bei update und forget: die Nummer aus dem Abschnitt GEDÄCHTNIS des Systemprompts.'),
});

type MemoryInput = z.infer<typeof memoryInputSchema>;

export function makeMemoryTool(ctx: MemoryToolCtx): Tool {
  const { state, threadId, sourceRegistry } = ctx;
  const service = ctx.service ?? memoryService;

  // The numbers the model can address: what the prompt rendered, plus what
  // this turn saved (a save followed by "nein, doch nicht" must resolve).
  const known: RenderedMemory[] = [...(state.memories ?? [])];
  const resolve = (nr: number): RenderedMemory | null => known.find((m) => m.nr === nr) ?? null;

  return tool({
    description: `Speichert, ändert oder löscht DAUERHAFTE Erinnerungen über die Person — was sie dir ausdrücklich zu merken aufträgt. Gespeichertes steht in jedem späteren Gespräch im Abschnitt GEDÄCHTNIS.

NUTZE NUR WENN die Person es ausdrücklich verlangt („merk dir", „ab jetzt immer", „vergiss das wieder") ODER eine Korrektur als allgemeine Regel formuliert („generell kürzer", „nie wieder Gendersternchen", „in Zukunft immer mit Quellen"). Speichere dann sofort, ohne nachzufragen.

NICHT, weil etwas nur erwähnt wurde. NICHT für Korrekturen an genau diesem Text („nein, kürzer" — das ist keine Regel). NICHT für Aufgaben und To-dos (dafür 'boards_tasks') und nicht für Terminerinnerungen.

Betrifft eine Korrektur eine bestehende Anweisung („statt X lieber Y"): update mit deren Nummer, nicht save. Ein Satz je Erinnerung; zwei Dinge = zwei Aufrufe.`,
    inputSchema: memoryInputSchema,
    execute: async (input: MemoryInput) => {
      const userId = state.agentConfig?.userId ?? null;
      if (!userId) return { error: NO_SESSION };

      try {
        if (input.action === 'save') {
          if (!input.text || !input.kind) {
            return { error: 'save braucht kind (anweisung|fakt) und text.' };
          }
          const { row, duplicate } = await service.create({
            userId,
            kind: input.kind,
            text: input.text,
            source: 'chat',
            threadId,
          });
          const already = known.find((m) => m.id === row.id);
          const nr = already?.nr ?? known.length + 1;
          if (!already) {
            known.push({
              nr,
              id: row.id,
              kind: row.kind,
              text: row.text,
              updatedAt: row.updated_at,
            });
          }
          log.info(`[Memory] ${duplicate ? 'duplicate' : 'saved'} kind=${row.kind} nr=${nr}`);
          sourceRegistry.note(duplicate ? 'Bereits gemerkt' : 'Gemerkt', row.text);
          return {
            gespeichert: true,
            nr,
            id: row.id,
            kind: row.kind,
            text: row.text,
            ...(duplicate ? { hinweis: 'War schon gespeichert — nichts doppelt angelegt.' } : {}),
          };
        }

        if (input.nr == null)
          return { error: `${input.action} braucht nr aus dem Abschnitt GEDÄCHTNIS.` };
        const target = resolve(input.nr);
        if (!target) {
          return {
            error: `Es gibt keine Erinnerung Nr. ${input.nr}. Gültig sind nur die Nummern im Abschnitt GEDÄCHTNIS.`,
          };
        }

        if (input.action === 'update') {
          if (!input.text) return { error: 'update braucht text.' };
          const row = await service.update(userId, target.id, input.text);
          if (!row) return { error: `Erinnerung Nr. ${input.nr} existiert nicht mehr.` };
          target.text = row.text;
          log.info(`[Memory] updated nr=${input.nr}`);
          sourceRegistry.note('Erinnerung aktualisiert', row.text);
          return { aktualisiert: true, nr: input.nr, id: row.id, text: row.text };
        }

        const row = await service.remove(userId, target.id);
        if (!row) return { error: `Erinnerung Nr. ${input.nr} existiert nicht mehr.` };
        known.splice(known.indexOf(target), 1);
        log.info(`[Memory] forgot nr=${input.nr}`);
        sourceRegistry.note('Vergessen', row.text);
        return { vergessen: true, nr: input.nr, id: row.id, text: row.text };
      } catch (err) {
        if (err instanceof MemoryRejectedError) return { error: err.userMessage };
        // Anything else is infrastructure. The wrapper logs and cards it; the
        // model gets a reason it can relay instead of a confirmation.
        log.error(`[Memory] ${input.action} failed: ${err}`);
        return { error: 'Das Gedächtnis ist gerade nicht erreichbar — nichts gespeichert.' };
      }
    },
  });
}
