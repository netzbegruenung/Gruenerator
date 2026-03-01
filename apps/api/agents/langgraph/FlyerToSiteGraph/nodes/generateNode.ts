import {
  extractLocaleFromRequest,
  localizePlaceholders,
} from '../../../../services/localization/index.js';
import { createLogger } from '../../../../utils/logger.js';

import type { Locale } from '../../../../services/localization/index.js';
import type { WebsiteContent } from '../../../../types/routes.js';
import type { FlyerToSiteState } from '../types.js';

const log = createLogger('FlyerToSite:generate');

function buildWebsiteSystemPrompt(email: string, locale: Locale): string {
  return localizePlaceholders(
    `Du bist ein Spezialist für politische Kommunikation und erstellst Landing-Page-Inhalte für Politiker*innen von {{partyName}}.

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
    "email": "${email}"
  }
}

Wichtige Hinweise:
- Die Texte sollen motivierend und aktivierend sein
- Verwende konkrete Beispiele aus der Beschreibung der Person
- Der about.content sollte Absätze durch Leerzeilen trennen (kein HTML)
- Stelle sicher, dass das JSON valide ist`,
    locale
  );
}

export async function generateNode(state: FlyerToSiteState): Promise<Partial<FlyerToSiteState>> {
  const startTime = Date.now();

  if (!state.flyerAnalysis) {
    return {
      websiteContent: null,
      generateTimeMs: Date.now() - startTime,
      error: state.error || 'Keine Flyer-Analyse vorhanden.',
    };
  }

  try {
    const analysis = state.flyerAnalysis;
    const email = analysis.contactInfo?.email || state.email || 'kontakt@example.com';
    const locale = extractLocaleFromRequest(state.req);
    const systemPrompt = buildWebsiteSystemPrompt(email, locale);

    const themesInfo = analysis.themes?.length
      ? `\n\nPolitische Schwerpunkte: ${analysis.themes.join(', ')}`
      : '';
    const slogansInfo = analysis.slogans?.length
      ? `\n\nSlogans/Kernbotschaften: ${analysis.slogans.join(', ')}`
      : '';

    const userPrompt = `Erstelle eine professionelle Landing-Page für folgende Person:

${analysis.rawDescription}${themesInfo}${slogansInfo}`;

    log.debug('Generating website content', {
      promptLength: userPrompt.length,
      name: analysis.name,
    });

    const result = await state.req.app.locals.aiWorkerPool.processRequest(
      {
        type: 'website',
        systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        options: { max_tokens: 4000, temperature: 0.7 },
      },
      state.req
    );

    if (!result.success || !result.content) {
      throw new Error(result.error || 'AI generation failed');
    }

    let jsonContent = result.content
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    jsonContent = jsonContent.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (match: string) => {
      return match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
    });

    let parsedJson: WebsiteContent;
    try {
      parsedJson = JSON.parse(jsonContent) as WebsiteContent;
    } catch {
      log.error('JSON parse error', { raw: jsonContent.substring(0, 500) });
      throw new Error('Die KI hat kein valides JSON generiert. Bitte versuche es erneut.');
    }

    const requiredFields: (keyof WebsiteContent)[] = [
      'hero',
      'about',
      'hero_image',
      'themes',
      'actions',
      'contact',
    ];
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

    log.debug('Website content generated', {
      themes: parsedJson.themes.length,
      actions: parsedJson.actions.length,
    });

    return {
      websiteContent: parsedJson,
      generateTimeMs: Date.now() - startTime,
    };
  } catch (err) {
    log.error('Generation failed', { error: (err as Error).message });
    return {
      websiteContent: null,
      generateTimeMs: Date.now() - startTime,
      error: `Website-Generierung fehlgeschlagen: ${(err as Error).message}`,
    };
  }
}
