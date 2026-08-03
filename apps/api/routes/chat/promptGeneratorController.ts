import { getAIWorkerPool } from '../../utils/getAIWorkerPool.js';
import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { createLogger } from '../../utils/logger.js';

import { getUser } from './services/threadPersistenceService.js';

const log = createLogger('PromptGenerator');
const router = createAuthenticatedRouter();

// Was hier entsteht, hängt bei JEDER Nachricht eines Rollen-Threads im
// Systemprompt (`customSystemPrompt` in respondNode) — die Länge ist also kein
// einmaliger, sondern ein laufender Preis. Deshalb steht im erzeugten Prompt
// nur, was diese eine Rolle von jeder anderen unterscheidet. Ton, Sprache,
// Werkzeug- und Zitierregeln liefert die Laufzeit ohnehin bei jedem Turn
// (`buildToolUsageBlock`); im Rollenprompt wiederholt wären sie doppelt — und
// eine dort ausbuchstabierte Schrittfolge ("erst gruenerator_search, dann
// web_search") widerspricht ihr sogar, weil die Laufzeit möglichst wenige
// Tool-Aufrufe und bei parteifremden Fragen den direkten Weg ins Web verlangt.
const META_PROMPT = `Du schreibst kurze Rollenprofile als System-Prompt für den Grünerator, den KI-Assistenten von Bündnis 90/Die Grünen bzw. Die Grünen Österreich.

Der*die Nutzer*in beschreibt Ebene, Rolle und Aufgabe. Du machst daraus ein Profil, das ausschließlich enthält, was DIESE Rolle von jeder anderen unterscheidet.

## AUFBAU (in dieser Reihenfolge, ohne Überschriften, als Fließtext)

1. Ein Satz Identität: "Du bist ein*e [Rolle] für {{partyName}} ..." — {{partyName}} bleibt wörtlich als Platzhalter stehen, er wird zur Laufzeit nach Land aufgelöst.
2. Ein bis zwei Sätze Kernaufgabe: woran diese Rolle konkret arbeitet und für wen.
3. "Achte besonders auf:" mit 3-4 Stichpunkten, die NUR auf diese Rolle zutreffen — Zuständigkeiten, Zielgruppe, typische Textformen, Gremien- oder Regionalbezug.
4. Als letzte Zeile exakt: "Schreibe auf Deutsch, in der Du-Form, mit Genderstern."

## WEGLASSEN — das liefert die Laufzeit bereits bei jeder Nachricht

- Ton- und Stilregeln ("klar und verständlich", "verbindend statt spaltend", "optimistisch und lösungsorientiert")
- Werkzeuge und Schrittfolgen ("Schritt 1: gruenerator_search", "danach web_search"), Recherche- und Zitierregeln
- Klärungsschritte ("Kläre zuerst Thema und Zielgruppe") — der Assistent arbeitet direkt los, statt zurückzufragen
- Allgemeine grüne Grundwerte und Sätze, die auf jede Rolle genauso passen
- Ebene, Gliederung, Bundesland noch einmal aufzählen — die stehen bereits im Profil der Person

## FORM

- Deutsch, geschlechtergerecht mit Genderstern
- HÖCHSTENS 120 Wörter insgesamt
- Beginne direkt mit "Du bist" — keine Überschrift, kein Markdown-Header, keine Einleitung

Antworte NUR mit dem Profil, ohne Erklärungen oder Kommentare.`;

router.post('/', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { description } = req.body as { description?: string };

    if (!description || description.trim().length < 5) {
      return res.status(400).json({ error: 'Description must be at least 5 characters' });
    }

    if (description.length > 2000) {
      return res.status(400).json({ error: 'Description must be under 2000 characters' });
    }

    const aiWorkerPool = getAIWorkerPool(req);

    log.info(`[PromptGenerator] Generating system prompt for user ${user.id}`);

    const result = await aiWorkerPool.processRequest({
      type: 'prompt_generation',
      systemPrompt: META_PROMPT,
      messages: [{ role: 'user', content: description.trim() }],
      options: {
        temperature: 0.7,
      },
    });

    if (!result.success) {
      log.error('[PromptGenerator] AI generation failed:', result.error);
      return res.status(500).json({ error: 'Failed to generate system prompt' });
    }

    const systemPrompt = (result.content || '').trim();

    if (!systemPrompt) {
      return res.status(500).json({ error: 'Empty response from AI' });
    }

    log.info(`[PromptGenerator] Generated ${systemPrompt.length} char prompt for user ${user.id}`);
    res.json({ systemPrompt });
  } catch (error) {
    log.error('Error generating system prompt:', error);
    res.status(500).json({ error: 'Failed to generate system prompt' });
  }
});

export default router;
