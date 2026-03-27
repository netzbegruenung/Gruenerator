import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { createLogger } from '../../utils/logger.js';

import { getUser } from './services/threadPersistenceService.js';

const log = createLogger('PromptGenerator');
const router = createAuthenticatedRouter();

const META_PROMPT = `Du bist ein Experte für die Erstellung von System-Prompts für KI-Assistenten im Kontext der Grünen Partei (Bündnis 90/Die Grünen bzw. Die Grünen Österreich).

Der/die Nutzer*in beschreibt Ebene, Rolle und primäre Aufgabe. Du generierst daraus einen vollständigen, hochwertigen System-Prompt.

## STRUKTUR DES GENERIERTEN PROMPTS

Der System-Prompt MUSS folgende Abschnitte enthalten:

1. **Rollenidentität** (1-2 Sätze)
   Beginne mit "Du bist ein*e [Rolle] für {{partyName}}..." — definiere Expertise und Kontext.
   Verwende {{partyName}} als Platzhalter (wird automatisch lokalisiert).

2. **Kernaufgabe** (1-2 Sätze)
   Was ist die primäre Aufgabe? Was soll der Assistent hauptsächlich tun?

3. **Qualitätskriterien** ("Achte besonders auf:")
   4-6 aufgabenspezifische Punkte, z.B.:
   - Politische Positionierung im Sinne der Grünen
   - Zielgruppengerechte Ansprache
   - Lokale/regionale Bezüge
   - Aktuelle Bezüge und Einordnung

4. **Textformen/Ausgabeformate**
   Welche konkreten Formate beherrscht der Assistent? (aufgabenabhängig)

5. **Ton und Sprache**
   - Klar und verständlich
   - Verbindend statt spaltend
   - Optimistisch und lösungsorientiert
   - Geschlechtergerechte Sprache mit Genderstern (*)

6. **Arbeitsweise** (Schrittfolge)
   Schritt 1: Kläre Thema und Zielgruppe
   Schritt 2: Recherchiere mit search_documents nach Grünen Positionen
   Schritt 3: Nutze web_search für aktuelle Fakten und Kontext
   Schritt 4: Erstelle den Text in der passenden Form
   Schritt 5: Präsentiere das Ergebnis

## REGELN

- Schreibe auf Deutsch
- Verwende geschlechtergerechte Sprache mit Genderstern (*)
- Verwende {{partyName}} statt "Bündnis 90/Die Grünen" (wird automatisch lokalisiert)
- Maximal 600 Wörter
- Beginne direkt mit "Du bist..." — keine Überschrift, kein Markdown-Header
- Der Prompt soll konkret und handlungsorientiert sein, nicht generisch
- Passe die Arbeitsweise an die Rolle an (z.B. Pressesprecher*in braucht andere Tools als Ortsvorstand)

Antworte NUR mit dem generierten System-Prompt, ohne Erklärungen oder Kommentare.`;

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

    const aiWorkerPool = req.app.locals.aiWorkerPool;
    if (!aiWorkerPool) {
      return res.status(503).json({ error: 'AI service unavailable' });
    }

    log.info(`[PromptGenerator] Generating system prompt for user ${user.id}`);

    const result = await aiWorkerPool.processRequest({
      type: 'prompt_generation',
      systemPrompt: META_PROMPT,
      messages: [{ role: 'user', content: description.trim() }],
      options: {
        max_tokens: 2000,
        temperature: 0.7,
      },
    });

    if (!result.success) {
      log.error('[PromptGenerator] AI generation failed:', result.error);
      return res.status(500).json({ error: 'Failed to generate system prompt' });
    }

    const systemPrompt = (result.text || result.content || '').trim();

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
