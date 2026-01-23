import { Router, Request, Response } from 'express';
import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { createLogger } from '../../utils/logger.js';
import imagePickerService from '../../services/image/ImageSelectionService.js';
import type { WebsiteContent } from '../../types/routes.js';
const log = createLogger('claude_website');
const router: Router = createAuthenticatedRouter();

interface WebsiteRequestBody {
  description: string;
  email?: string;
  usePrivacyMode?: boolean;
  useProMode?: boolean;
}

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { description, email, usePrivacyMode, useProMode } = req.body as WebsiteRequestBody;

  log.debug('[claude_website] Request received:', {
    hasDescription: !!description,
    descriptionLength: description?.length || 0,
    hasEmail: !!email,
    userId: req.user?.id || 'No user'
  });

  if (!description) {
    res.status(400).json({
      error: 'Bitte gib eine Beschreibung an'
    });
    return;
  }

  try {
    log.debug('[claude_website] Starting AI Worker request');

    const systemPrompt = `Du bist ein Spezialist für politische Kommunikation und erstellst Landing-Page-Inhalte für Politiker*innen von Bündnis 90/Die Grünen.

Deine Aufgabe: Generiere eine vollständige Landing-Page-Struktur als JSON basierend auf der Beschreibung der Person.

WICHTIGE REGELN:
1. Verwende authentische, persönliche Sprache mit Du-Ansprache
2. Fokussiere auf grüne Kernthemen: Klimaschutz, Nachhaltigkeit, soziale Gerechtigkeit, Mobilität, Bildung
3. Halte alle Zeichenlimits STRIKT ein
4. Antworte NUR mit validem JSON - keine Erklärungen, kein Markdown, keine Code-Blöcke

Der JSON muss EXAKT dieser Struktur folgen:

{
  "hero": {
    "heading": "Persönliche Begrüßung (max. 60 Zeichen)",
    "text": "Kurze Vorstellung mit politischer Rolle und Motivation (max. 200 Zeichen)"
  },
  "about": {
    "title": "Überschrift für 'Über mich' Bereich (max. 30 Zeichen)",
    "content": "Authentische persönliche Geschichte, Werdegang und politische Vision (300-500 Wörter, Absätze durch Leerzeilen trennen, KEIN HTML)"
  },
  "hero_image": {
    "title": "Hauptbotschaft/Slogan (max. 60 Zeichen)",
    "subtitle": "Motivierende Erläuterung und Aufruf zum Mitmachen (max. 200 Zeichen)"
  },
  "themes": [
    {
      "title": "Erster politischer Schwerpunkt (max. 40 Zeichen)",
      "content": "Beschreibung des Schwerpunkts und was erreicht werden soll (150-200 Zeichen)"
    },
    {
      "title": "Zweiter politischer Schwerpunkt (max. 40 Zeichen)",
      "content": "Beschreibung des Schwerpunkts und was erreicht werden soll (150-200 Zeichen)"
    },
    {
      "title": "Dritter politischer Schwerpunkt (max. 40 Zeichen)",
      "content": "Beschreibung des Schwerpunkts und was erreicht werden soll (150-200 Zeichen)"
    }
  ],
  "actions": [
    {
      "text": "Unterstütze uns",
      "link": "#spenden"
    },
    {
      "text": "Werde Mitglied",
      "link": "https://www.gruene.de/mitglied-werden"
    },
    {
      "text": "Mach mit",
      "link": "#kontakt"
    }
  ],
  "contact": {
    "title": "Einladende Überschrift für Kontaktbereich (max. 30 Zeichen)",
    "email": "${email || 'kontakt@example.com'}"
  }
}

Wichtige Hinweise:
- Die Texte sollen motivierend und aktivierend sein
- Verwende konkrete Beispiele aus der Beschreibung der Person
- Der about.content sollte Absätze durch Leerzeilen trennen (kein HTML)
- Stelle sicher, dass das JSON valide ist`;

    const userPrompt = `Erstelle eine professionelle Landing-Page für folgende Person:

${description}`;

    const payload = {
      systemPrompt,
      provider: useProMode ? 'claude' : 'mistral',
      messages: [{
        role: 'user',
        content: userPrompt
      }],
      options: {
        max_tokens: 4000,
        temperature: 0.7
      }
    };

    log.debug('[claude_website] Payload overview:', {
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length,
      provider: payload.provider,
      userId: req.user?.id
    });

    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'website',
      usePrivacyMode: usePrivacyMode || false,
      ...payload
    }, req);

    log.debug('[claude_website] AI Worker response received:', {
      success: result.success,
      contentLength: result.content?.length,
      error: result.error,
      userId: req.user?.id
    });

    if (!result.success) {
      log.error('[claude_website] AI Worker error:', result.error);
      throw new Error(result.error);
    }

    let jsonContent = result.content;

    jsonContent = jsonContent.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    jsonContent = jsonContent.trim();

    jsonContent = jsonContent.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (match: string) => {
      return match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
    });

    let parsedJson: WebsiteContent;
    try {
      parsedJson = JSON.parse(jsonContent) as WebsiteContent;
    } catch (parseError) {
      log.error('[claude_website] JSON parse error:', (parseError as Error).message);
      log.debug('[claude_website] Raw content:', jsonContent.substring(0, 500));
      throw new Error('Die KI hat kein valides JSON generiert. Bitte versuche es erneut.');
    }

    const requiredFields: (keyof WebsiteContent)[] = ['hero', 'about', 'hero_image', 'themes', 'actions', 'contact'];
    for (const field of requiredFields) {
      if (!parsedJson[field]) {
        throw new Error(`Fehlendes Feld im JSON: ${field}`);
      }
    }

    if (!Array.isArray(parsedJson.themes) || parsedJson.themes.length === 0) {
      throw new Error('Das themes-Array muss mindestens einen Eintrag haben');
    }

    if (parsedJson.themes.length > 3) {
      parsedJson.themes = parsedJson.themes.slice(0, 3);
    }

    if (!Array.isArray(parsedJson.actions) || parsedJson.actions.length === 0) {
      throw new Error('Das actions-Array muss mindestens einen Eintrag haben');
    }

    if (parsedJson.actions.length > 3) {
      parsedJson.actions = parsedJson.actions.slice(0, 3);
    }

    log.debug('[claude_website] Starting image selection...');

    const pickImage = async (text: string): Promise<string> => {
      try {
        const result = await imagePickerService.selectBestImage(
          text,
          req.app.locals.aiWorkerPool,
          { maxCandidates: 5 },
          req
        );
        return `/api/image-picker/stock-image/${result.selectedImage.filename}`;
      } catch (err) {
        log.warn('[claude_website] Image picker failed:', (err as Error).message);
        return '';
      }
    };

    const imagePromises = [
      pickImage(`${parsedJson.hero_image.title} ${parsedJson.hero_image.subtitle}`),
      ...parsedJson.themes.map(theme => pickImage(`${theme.title} ${theme.content}`)),
      ...parsedJson.actions.map(action => pickImage(action.text)),
      pickImage(`${parsedJson.contact.title} Kontakt Politik Grüne`)
    ];

    const imageResults = await Promise.all(imagePromises);

    const heroImageUrl = imageResults[0];
    const themeImageUrls = imageResults.slice(1, 4);
    const actionImageUrls = imageResults.slice(4, 7);
    const contactImageUrl = imageResults[7];

    parsedJson.hero_image.imageUrl = heroImageUrl;
    parsedJson.themes = parsedJson.themes.map((theme, i) => ({
      ...theme,
      imageUrl: themeImageUrls[i] || ''
    }));
    parsedJson.actions = parsedJson.actions.map((action, i) => ({
      ...action,
      imageUrl: actionImageUrls[i] || ''
    }));
    parsedJson.contact.backgroundImageUrl = contactImageUrl;

    log.debug('[claude_website] Image selection complete:', {
      heroImage: !!heroImageUrl,
      themeImages: themeImageUrls.filter(Boolean).length,
      actionImages: actionImageUrls.filter(Boolean).length,
      contactImage: !!contactImageUrl
    });

    const response = {
      json: parsedJson,
      metadata: result.metadata
    };

    log.debug('[claude_website] Sending successful response:', {
      hasJson: !!response.json,
      hasMetadata: !!response.metadata,
      userId: req.user?.id
    });

    res.json(response);

  } catch (error) {
    log.error('[claude_website] Error creating website content:', error);
    res.status(500).json({
      error: 'Fehler bei der Erstellung der Website-Inhalte',
      details: (error as Error).message
    });
  }
});

export default router;
