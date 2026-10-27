/**
 * Loop-Werkzeuge, die der Browser ausführt.
 *
 * Ein Eintrag sagt, unter welchem Namen das Werkzeug im Loop-Katalog steht,
 * welcher Browser-Executor es ausführt, was der Browser beim Halten bekommt
 * (`resolve`) und was aus seiner Antwort in der Fortsetzung wird
 * (`toToolResult`). Gate (`wrapTools`), Resolver (`agenticRespondService`),
 * Fortsetzung (`clientToolResume`) und die Resume-Weiche (`resumePipeline`)
 * lesen nur diese Tabelle — ein neues Browser-Werkzeug ist ein neuer Eintrag.
 */
import { createLogger } from '../../../../utils/logger.js';
import {
  CHECK_SHAREPIC_TOOL,
  RENDER_SHAREPIC_CLIENT_TOOL,
  renderedImageOf,
  resolveCheckSharepicRender,
  reviewRenderedSharepic,
} from '../../agents/sharepicCheckTool.js';
import { tabelleAuswertenClientTool } from '../../agents/tabelleAuswertenTool.js';

import type { PersistedStep } from './types.js';
import type { ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';
import type { StoredLoopClientToolState } from '../loopClientToolStateStore.js';
import type { SSEWriter } from '../sseHelpers.js';

const log = createLogger('ClientToolRegistry');

export interface LoopClientTool {
  /** Name des Werkzeugs im Loop-Katalog, z. B. 'check_sharepic'. */
  loopToolName: string;
  /** Name des Browser-Executors, z. B. 'render_sharepic' | 'run_python'. */
  clientToolName: string;
  resolve(ctx: {
    threadId: string | null;
    state: ChatGraphState;
    args: Record<string, unknown>;
    priorSteps: PersistedStep[];
  }): Promise<{ clientArgs: Record<string, unknown> } | { error: string }>;
  /** Baut aus der Browser-Antwort das Werkzeugergebnis für den Loop und erledigt Nebenwirkungen (SSE, Persistenz). */
  toToolResult(ctx: {
    threadId: string;
    stored: StoredLoopClientToolState;
    result: unknown;
    sse: SSEWriter;
    userId: string;
  }): Promise<{
    toolResult: Record<string, unknown>;
    /** `false` markiert den Schritt als fehlgeschlagen (Karte rot, `ok: false` im Verlauf). */
    ok?: false;
    classifiedStatePatch?: Partial<ChatGraphState>;
  }>;
}

const checkSharepic: LoopClientTool = {
  loopToolName: CHECK_SHAREPIC_TOOL,
  clientToolName: RENDER_SHAREPIC_CLIENT_TOOL,
  async resolve({ threadId, state, args }) {
    if (state.sharepicCheck) {
      return {
        error: `In diesem Zug schon geprüft, nicht erneut aufrufen. Ergebnis: ${JSON.stringify(state.sharepicCheck)}`,
      };
    }
    const resolved = await resolveCheckSharepicRender(threadId, state, args);
    return 'error' in resolved ? resolved : { clientArgs: resolved.clientArgs };
  },
  // Das Ergebnis des Browsers (das Bild) ist nicht die Antwort selbst: erst die
  // Prüfung daran wird das tool-result des zurückgehaltenen Aufrufs.
  async toToolResult({ threadId, stored, result }) {
    const image = renderedImageOf(result);
    log.info(
      `[Client-Tool] Fortsetzung Thread ${threadId}: ${stored.clientToolName} ${image ? `Bild ${Math.round(image.length / 1024)} KB` : 'ohne Bild'}`
    );
    const variantId =
      typeof stored.clientArgs.variantId === 'string' ? stored.clientArgs.variantId : '';
    const checkResult = await reviewRenderedSharepic({
      threadId,
      variantId,
      userText: stored.classifiedState.lastUserTextNoMentions ?? null,
      image,
    });
    return {
      toolResult: checkResult,
      ...(image ? {} : { ok: false as const }),
      classifiedStatePatch: { sharepicCheck: checkResult },
    };
  },
};

export const LOOP_CLIENT_TOOLS: ReadonlyMap<string, LoopClientTool> = new Map(
  [checkSharepic, tabelleAuswertenClientTool].map((t) => [t.loopToolName, t])
);

export function loopClientToolForClientName(name: string): LoopClientTool | null {
  for (const t of LOOP_CLIENT_TOOLS.values()) if (t.clientToolName === name) return t;
  return null;
}

/**
 * Gehört eine `client_tool`-Antwort der Loop-Fortsetzung? Entschieden am
 * gespeicherten Loop-Zustand: liegt einer vor, nur wenn er auf genau diesen
 * Browser-Namen wartet. Ohne Zustand für jedes registrierte Werkzeug — die
 * Fortsetzung meldet dann „abgelaufen" statt „nicht unterstützt".
 */
export function routesToLoopClientToolResume(
  toolName: string,
  storedLoop: { clientToolName: string } | null
): boolean {
  if (storedLoop != null) return storedLoop.clientToolName === toolName;
  return loopClientToolForClientName(toolName) != null;
}
