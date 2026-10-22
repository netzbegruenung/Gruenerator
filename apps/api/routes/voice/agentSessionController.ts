/**
 * Mistral's hosted voice agent (Voxtral 3 kit) for the internal comparison page
 * `/voice-agent-test`. We open and close the session and run its tool calls;
 * the browser streams audio straight to Mistral's LiveKit room, and Mistral
 * Small answers — not our chat graph. Two flavours:
 *
 *  - `tools`: the chat's tool set (voiceAgentTools.ts), run here per call.
 *  - `notebook`: one Landesverband notebook behind a single `notebook_fragen`.
 *
 * The endpoint is global on purpose: on 2026-10-21 `api.eu.mistral.ai`
 * answered `/v1/audio/sessions` with "no Route matched", while transcription
 * and speech exist there. Audio and tool results from this page therefore
 * leave the EU endpoint, which is why it stays an internal test.
 */

import express, { type NextFunction, type Request, type Response, type Router } from 'express';
import { z } from 'zod';

import { env } from '../../config/env.js';
import { buildVoiceContextBias } from '../../services/transcription/transcriptionBias.js';
import {
  NOTEBOOK_TOOL,
  isVoiceFiller,
  runVoicePortTool,
  voiceNotebooks,
  voicePortDeclarations,
  type VoiceThread,
} from '../../services/voice/voicePort.js';
import {
  historyForInstructions,
  loadVoiceHistory,
  openVoiceThread,
  saveVoiceLine,
} from '../../services/voice/voiceThread.js';
import { VOXTRAL_DEFAULT_VOICE_ID } from '../../services/voice/voxtralSpeechService.js';
import { requireInstanceAdmin } from '../../utils/adminAuthz.js';
import { createLogger } from '../../utils/logger.js';

import { TURN_MODEL } from './voxtralTurnSession.js';

const log = createLogger('voiceAgentSession');

const SESSIONS_URL = 'https://api.mistral.ai/v1/audio/sessions';
const LLM_MODEL = 'mistral-small-latest';

const SPOKEN_STYLE =
  'Antworte auf Deutsch, kurz und gesprochen: zwei bis drei Sätze, keine Listen, kein Markdown, keine Links vorlesen.';

const TOOLS_INSTRUCTIONS = [
  'Du bist der Grünerator, ein Sprachassistent für Mitglieder von Bündnis 90/Die Grünen.',
  SPOKEN_STYLE,
  'Für alles, was Programme, Beschlüsse, Notebooks, eigene Inhalte, Bundestag, Umfragen oder aktuelle Fakten betrifft, nutze zuerst die passenden Werkzeuge und antworte aus deren Ergebnis — nicht aus dem Gedächtnis.',
  `Fragen an den Inhalt eines Notebooks — eigenes, geteiltes oder das eines Landesverbands wie Berlin — beantwortest du mit ${NOTEBOOK_TOOL}; gib ihm den Namen, den die Person nennt.`,
  'Will die Person etwas erstellt haben — ein Sharepic, eine Präsentation, eine Tabelle, ein Dokument, ein PDF, ein Board oder ein Explainable —, nimm das passende Erstell-Werkzeug und gib ihm den Inhalt vollständig mit. Das Ergebnis erscheint auf dem Bildschirm der Person: lies es nicht vor, sag kurz, dass es fertig ist, und biete Änderungen an.',
].join(' ');

function notebookInstructions(name: string): string {
  return [
    `Du bist die Sprachsuche für das Notebook „${name}“ im Grünerator.`,
    `Beantworte jede inhaltliche Frage mit dem Werkzeug ${NOTEBOOK_TOOL} und nur aus dessen Antwort; das Notebook ist fest eingestellt.`,
    // The notebook answer is the product here; squeezing it into the general
    // two-to-three-sentence rule threw away most of what it found.
    'Gib die Antwort des Werkzeugs vollständig wieder, auf Deutsch und gesprochen: alle wesentlichen Punkte und Forderungen, ruhig sechs bis zehn Sätze. Keine Listen, kein Markdown, keine Links vorlesen.',
    'Nenne, woher es stammt (etwa Beschluss, Wahlprogramm oder Pressemitteilung), wenn die Antwort das sagt. Biete am Ende an, bei einem Punkt tiefer zu gehen.',
    'Findet das Werkzeug nichts, sag das ehrlich.',
  ].join(' ');
}

const createBodySchema = z.object({
  mode: z.enum(['tools', 'notebook']).default('tools'),
  notebookId: z.string().nullish(),
  /** The thread the call continues; none starts a new one. */
  threadId: z.string().uuid().nullish(),
});

const toolCallBodySchema = z.object({
  args: z.record(z.unknown()).default({}),
  notebookId: z.string().nullish(),
  fastMode: z.boolean().default(true),
  threadId: z.string().uuid().nullish(),
});

const lineBodySchema = z.object({
  threadId: z.string().uuid(),
  role: z.enum(['user', 'assistant']),
  text: z.string().trim().min(1).max(20_000),
});

interface MistralSession {
  id: string;
  participant_token: string;
  server_url: string;
  created_at: string;
  expires_at: string;
  /** Effective declarations; the browser SDK checks its handlers against them. */
  function_tools?: unknown[];
}

const router: Router = express.Router();

// The internal boundary lives here, not in the hidden web route: everything
// below sends audio and tool results to Mistral's global endpoint.
router.use(async (req: Request, res: Response, next: NextFunction) => {
  const user = req.user;
  if (!user?.id || !(await requireInstanceAdmin(user.id, user.email))) {
    res.status(403).json({ error: 'Nur für Instanz-Admins' });
    return;
  }
  next();
});

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${env.MISTRAL_API_KEY}`, 'Content-Type': 'application/json' };
}

function userLocale(req: Request): 'de-DE' | 'de-AT' {
  return req.user?.locale === 'de-AT' ? 'de-AT' : 'de-DE';
}

/** The Landesverband notebooks the product offers (switched-off ones like Hamburg excluded). */
function lvNotebooks(req: Request) {
  return voiceNotebooks(userLocale(req)).filter((n) => n.category === 'landesebene');
}

function lvNotebook(req: Request, id: string | null | undefined) {
  return lvNotebooks(req).find((n) => n.id === id) ?? null;
}

router.get('/notebooks', (req: Request, res: Response) => {
  res.json({ notebooks: lvNotebooks(req).map((n) => ({ id: n.id, name: n.title })) });
});

router.post('/', async (req: Request, res: Response) => {
  const parsed = createBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'Ungültige Anfrage' });
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Nicht angemeldet' });

  let instructions: string;
  let tools: unknown[];
  let threadId: string | null = null;
  if (parsed.data.mode === 'notebook') {
    const notebook = lvNotebook(req, parsed.data.notebookId);
    if (!notebook) return res.status(400).json({ error: 'Unbekanntes Notebook' });
    instructions = notebookInstructions(notebook.title);
    // The port with one tool, pinned to this notebook (see voicePort.ts).
    tools = await voicePortDeclarations(userId, userLocale(req), {
      only: [NOTEBOOK_TOOL],
      fixedNotebook: notebook.id,
    });
  } else {
    threadId = await openVoiceThread(userId, parsed.data.threadId ?? null);
    if (!threadId) return res.status(403).json({ error: 'Kein Zugriff auf diese Unterhaltung' });
    const history = await loadVoiceHistory(threadId);
    instructions = TOOLS_INSTRUCTIONS + historyForInstructions(history);
    tools = await voicePortDeclarations(userId, userLocale(req), {
      thread: { id: threadId, req, history },
    });
  }

  try {
    const response = await fetch(SESSIONS_URL, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        llm: { model: LLM_MODEL },
        stt: {
          model: TURN_MODEL,
          language: 'de',
          context_bias: buildVoiceContextBias(userLocale(req)),
          turn_detection: {},
        },
        tts: { model: 'voxtral-mini-tts-3', voice_id: VOXTRAL_DEFAULT_VOICE_ID },
        // No welcome message: the person starts talking, cued by a tone on
        // the device once the agent has joined.
        instructions,
        tools,
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      log.error('[AgentSession] Create failed: %d %s', response.status, detail.slice(0, 500));
      return res.status(502).json({ error: `Mistral antwortete mit ${response.status}` });
    }
    const session = (await response.json()) as MistralSession;
    // The browser SDK expects its own camelCase response type.
    return res.json({
      id: session.id,
      participantToken: session.participant_token,
      serverUrl: session.server_url,
      createdAt: session.created_at,
      expiresAt: session.expires_at,
      functionTools: session.function_tools ?? [],
      toolNames: tools.map((t) => (t as { function: { name: string } }).function.name),
      threadId,
    });
  } catch (error) {
    log.error('[AgentSession] Create error:', error);
    return res.status(502).json({ error: 'Sitzung konnte nicht erstellt werden' });
  }
});

/** One tool call of a running session, forwarded by the browser's function handler. */
router.post('/tools/:name', async (req: Request<{ name: string }>, res: Response) => {
  const parsed = toolCallBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'Ungültige Anfrage' });
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Nicht angemeldet' });
  const started = Date.now();

  // A notebook session's tool stays on its notebook, whatever the model names.
  const fixedNotebook = lvNotebook(req, parsed.data.notebookId)?.id ?? null;
  let thread: VoiceThread | null = null;
  if (parsed.data.threadId) {
    const id = await openVoiceThread(userId, parsed.data.threadId);
    if (!id) return res.status(403).json({ error: 'Kein Zugriff auf diese Unterhaltung' });
    thread = { id, req, history: await loadVoiceHistory(id) };
  }
  const { text, artifact } = await runVoicePortTool(
    userId,
    userLocale(req),
    req.params.name,
    parsed.data.args,
    { fixedNotebook, fastMode: parsed.data.fastMode, thread }
  );
  return res.json({ result: text, artifact, ms: Date.now() - started });
});

/** A final line of the call — spoken or typed — into the call's thread. */
router.post('/messages', async (req: Request, res: Response) => {
  const parsed = lineBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'Ungültige Anfrage' });
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Nicht angemeldet' });
  const { threadId, role, text } = parsed.data;
  if (!(await openVoiceThread(userId, threadId))) {
    return res.status(403).json({ error: 'Kein Zugriff auf diese Unterhaltung' });
  }
  if (role === 'assistant' && isVoiceFiller(text)) return res.status(204).end();
  try {
    await saveVoiceLine(threadId, userId, role, text);
    return res.status(204).end();
  } catch (error) {
    log.error('[AgentSession] Saving a line failed:', error);
    return res.status(500).json({ error: 'Nicht gespeichert' });
  }
});

router.delete('/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const response = await fetch(`${SESSIONS_URL}/${encodeURIComponent(req.params.id)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    // 404: the session already expired or ended on Mistral's side.
    if (!response.ok && response.status !== 404) {
      log.warn('[AgentSession] Delete failed: %d', response.status);
    }
  } catch (error) {
    log.warn('[AgentSession] Delete error:', error);
  }
  return res.status(204).end();
});

export default router;
