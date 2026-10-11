/**
 * `check_sharepic`: das Modell lässt ein Chat-Sharepic ansehen und prüfen.
 *
 * Der Server kann Creator-Sharepics nicht zeichnen — sie werden im Browser
 * komponiert. Das Werkzeug wird deshalb nie wirklich ausgeführt: `wrapTools`
 * fängt den Aufruf ab und hält ihn im `clientToolGate`. Der Zug pausiert mit
 * einem `client_tool`-Interrupt (`render_sharepic`), der Browser liefert das
 * Bild, und die Fortsetzung (`clientToolResume`) macht aus der Prüfung
 * (`reviewSharepic`, dieselbe wie im Creator) das tool-result dieses Aufrufs.
 * `execute` ist nur der defensive Rest für Aufrufer am Wrapper vorbei.
 */
import { SHAREPIC_PROMPT_MAX } from '@gruenerator/contracts';
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { reviewSharepic } from '../../../services/sharepicCreator/review.js';
import { isEditorSurface } from '../services/agenticLoop/routing.js';
import { resolveLoopSharepicTarget } from '../services/sharepicLoopTarget.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { ClientToolRequestResolver } from '../services/agenticLoop/clientToolGate.js';

export const CHECK_SHAREPIC_TOOL = 'check_sharepic';
export const RENDER_SHAREPIC_CLIENT_TOOL = 'render_sharepic';

/** Was der Browser als Bild zurückschicken darf — passt unter das Review-Limit (8 MB). */
const MAX_IMAGE_CHARS = 8_000_000;

export function makeCheckSharepicTool(): Tool {
  return tool({
    description: `Sieht sich ein Sharepic im Chat an (gerendert, wie die Person es sieht) und prüft es: Lesbarkeit, Umbrüche, Kontrast, Überlappungen, Passung zur Anfrage. Liefert die Probleme und, wo möglich, Korrekturen.

NUTZE WENN die Person wissen will, ob ein Sharepic gut aussieht oder „stimmt", oder wenn du ein Sharepic geändert hast und das Ergebnis kontrollieren willst. NICHT nach jeder Änderung und höchstens EINMAL pro Zug. Rufe check_sharepic als EINZIGES Tool des Schritts auf.`,
    inputSchema: z.object({
      variantId: z
        .string()
        .optional()
        .describe('Welches Sharepic; leer = das geöffnete bzw. neueste des Threads'),
    }),
    execute: async () => ({ error: 'check_sharepic wird nie direkt ausgeführt.' }),
  });
}

/**
 * Nur mit rendernder Oberfläche (Web), Thread und einem Sharepic, das es zu
 * prüfen gibt — und nie in einer Editor-Seitenleiste, die das offene Artefakt
 * selbst bearbeitet.
 */
export function shouldMountCheckSharepic(state: ChatGraphState, threadId: string | null): boolean {
  if (!state.clientCanRenderSharepic || !threadId) return false;
  if (isEditorSurface(state.enabledTools) || state.enabledTools?.['sharepic'] === false) {
    return false;
  }
  return (
    state.currentSharepic != null ||
    state.lastTurnEditables?.includes('sharepic') === true ||
    (state.threadArtifacts ?? []).some((a) => a.kind === 'sharepic')
  );
}

/** Löst beim Halten auf, was der Browser rendern soll — das Ziel kommt aus der DB. */
export async function resolveCheckSharepicRender(
  threadId: string | null,
  state: Pick<ChatGraphState, 'currentSharepic'>,
  args: Record<string, unknown>
): ReturnType<ClientToolRequestResolver> {
  const variantId = typeof args.variantId === 'string' && args.variantId ? args.variantId : null;
  const target = threadId
    ? await resolveLoopSharepicTarget(threadId, state.currentSharepic, variantId)
    : null;
  if (!target) return { error: 'Es gibt kein Sharepic, das sich prüfen ließe.' };
  return {
    clientToolName: RENDER_SHAREPIC_CLIENT_TOOL,
    clientArgs: {
      variantId: target.prior.variantId,
      canvasType: target.prior.canvasType,
      initialProps: target.props,
    },
  };
}

/** Das Ergebnis des Browsers: ein Bild oder nichts. */
export function renderedImageOf(result: unknown): string | null {
  const image = (result as { image?: unknown } | null)?.image;
  return typeof image === 'string' &&
    image.startsWith('data:image/') &&
    image.length <= MAX_IMAGE_CHARS
    ? image
    : null;
}

/**
 * Das tool-result für das Modell. Fail-soft wie die Prüfung selbst: ohne Bild
 * oder ohne Ziel steht eine Notiz da, kein Fehler, der den Zug kippt.
 */
export async function reviewRenderedSharepic(params: {
  threadId: string;
  variantId: string;
  userText: string | null;
  image: string | null;
}): Promise<Record<string, unknown>> {
  const { threadId, variantId, userText, image } = params;
  if (!image) return { ok: false, note: 'Das Sharepic konnte nicht gerendert werden.' };
  const target = await resolveLoopSharepicTarget(threadId, null, variantId);
  if (!target) return { ok: false, note: 'Das Sharepic wurde nicht mehr gefunden.' };
  const prompt = (userText?.trim() || 'Prüfe das Sharepic').slice(0, SHAREPIC_PROMPT_MAX);
  const review = await reviewSharepic(target.props.creatorSpec, prompt, image, 'edit');
  return {
    ok: review.ok,
    issues: review.issues,
    ...(review.patch.length > 0 ? { patch: review.patch } : {}),
  };
}
