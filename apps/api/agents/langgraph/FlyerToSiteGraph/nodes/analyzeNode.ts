import {
  extractLocaleFromRequest,
  localizePlaceholders,
} from '../../../../services/localization/index.js';
import { createLogger } from '../../../../utils/logger.js';

import type { FlyerAnalysis, FlyerToSiteState } from '../types.js';

const log = createLogger('FlyerToSite:analyze');

const ANALYZE_SYSTEM_PROMPT = `Du bist ein Experte für politische Kommunikation bei {{partyName}}.

Analysiere den folgenden Text, der per OCR aus einem Kampagnen-Flyer extrahiert wurde. Extrahiere daraus eine strukturierte Analyse als JSON.

Antworte NUR mit validem JSON in diesem Format:

{
  "name": "Name der Kandidat*in (oder 'Unbekannt')",
  "politicalRole": "Politische Rolle/Amt (z.B. 'Stadträtin', 'Bundestagskandidat')",
  "region": "Region/Wahlkreis (z.B. 'Musterstadt', 'Wahlkreis 42')",
  "themes": ["Thema 1", "Thema 2", "Thema 3"],
  "slogans": ["Slogan oder Kernbotschaft 1", "Slogan 2"],
  "contactInfo": {
    "email": "email@example.de",
    "phone": "+49...",
    "address": "Straße...",
    "website": "https://..."
  },
  "keyMessages": ["Zentrale Aussage 1", "Zentrale Aussage 2"],
  "rawDescription": "Eine zusammenhängende Beschreibung der Kandidat*in in 300-500 Wörtern. Schreibe in der Ich-Form aus Sicht der Kandidat*in. Beschreibe Name, politische Rolle, Region, Kernthemen, Motivation und persönlichen Hintergrund. Verwende die Informationen aus dem Flyer, um eine authentische, persönliche Beschreibung zu erstellen."
}

WICHTIG:
- Die rawDescription ist das wichtigste Feld — sie wird zur Website-Generierung verwendet
- Schreibe die rawDescription in der Ich-Form ("Ich bin...", "Mir ist wichtig...")
- Wenn Informationen im Flyer fehlen, lass die Felder leer oder schreibe "Unbekannt"
- Erfinde KEINE Informationen, die nicht im Flyer stehen
- contactInfo-Felder sind alle optional — nur ausfüllen, wenn im Flyer vorhanden`;

export async function analyzeNode(state: FlyerToSiteState): Promise<Partial<FlyerToSiteState>> {
  const startTime = Date.now();

  if (!state.extractedText) {
    return {
      flyerAnalysis: null,
      analyzeTimeMs: Date.now() - startTime,
      error: state.error || 'Kein extrahierter Text vorhanden.',
    };
  }

  try {
    const locale = extractLocaleFromRequest(state.req);
    const systemPrompt = localizePlaceholders(ANALYZE_SYSTEM_PROMPT, locale);

    const userPrompt = `Analysiere diesen Flyer-Text:\n\n${state.extractedText}`;

    const result = await state.req.app.locals.aiWorkerPool.processRequest(
      {
        type: 'flyer-analysis',
        systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        options: { max_tokens: 3000, temperature: 0.3 },
      },
      state.req
    );

    if (!result.success || !result.content) {
      log.warn('AI analysis failed, using raw text as fallback', { error: result.error });
      return {
        flyerAnalysis: {
          name: 'Unbekannt',
          politicalRole: '',
          region: '',
          themes: [],
          slogans: [],
          contactInfo: {},
          keyMessages: [],
          rawDescription: state.extractedText.slice(0, 2000),
        },
        analyzeTimeMs: Date.now() - startTime,
      };
    }

    let jsonContent = result.content
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    jsonContent = jsonContent.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (match: string) => {
      return match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
    });

    let analysis: FlyerAnalysis;
    try {
      analysis = JSON.parse(jsonContent) as FlyerAnalysis;
    } catch {
      log.warn('JSON parse failed for analysis, using raw text fallback');
      analysis = {
        name: 'Unbekannt',
        politicalRole: '',
        region: '',
        themes: [],
        slogans: [],
        contactInfo: {},
        keyMessages: [],
        rawDescription: state.extractedText.slice(0, 2000),
      };
    }

    if (!analysis.rawDescription?.trim()) {
      analysis.rawDescription = state.extractedText.slice(0, 2000);
    }

    log.debug('Analysis complete', {
      name: analysis.name,
      themes: analysis.themes?.length,
      descriptionLength: analysis.rawDescription.length,
    });

    return {
      flyerAnalysis: analysis,
      analyzeTimeMs: Date.now() - startTime,
    };
  } catch (err) {
    log.error('Analysis failed', { error: (err as Error).message });
    return {
      flyerAnalysis: {
        name: 'Unbekannt',
        politicalRole: '',
        region: '',
        themes: [],
        slogans: [],
        contactInfo: {},
        keyMessages: [],
        rawDescription: state.extractedText.slice(0, 2000),
      },
      analyzeTimeMs: Date.now() - startTime,
    };
  }
}
