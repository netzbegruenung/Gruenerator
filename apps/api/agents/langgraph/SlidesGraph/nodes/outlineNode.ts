/**
 * Outline Node
 *
 * Generates a structured presentation outline from user content.
 * This is the first step of the SlidesGraph pipeline.
 *
 * Ported from SlideGenerationService.generateOutline().
 */

import { generateObject } from 'ai';

import { SlideOutlineSchema, TONE_DESCRIPTIONS, VERBOSITY_HINTS, getSlideModel } from '../types.js';

import type { SlidesGraphState } from '../types.js';

/**
 * Generates a presentation outline with slide titles, descriptions, and
 * suggested layouts based on the user's content and generation options.
 */
export async function outlineNode(state: SlidesGraphState): Promise<Partial<SlidesGraphState>> {
  const startTime = Date.now();
  const { options } = state;

  console.log('[slides-graph] outlineNode starting', {
    contentPreview: options.content.slice(0, 200),
    nSlides: options.nSlides,
    tone: options.tone,
    verbosity: options.verbosity,
  });

  try {
    const model = getSlideModel();

    const toneHint = TONE_DESCRIPTIONS[options.tone] || '';
    const verbosityHint = VERBOSITY_HINTS[options.verbosity] || '';

    const systemPrompt = `Du bist ein Experte für Präsentationsdesign. Erstelle eine strukturierte Gliederung für eine Präsentation.
${toneHint}
${verbosityHint}
Sprache: ${options.language}
${options.instructions ? `Zusätzliche Anweisungen: ${options.instructions}` : ''}

Regeln:
- Erstelle genau ${options.nSlides} Folien
${options.includeTitleSlide ? '- Die erste Folie muss eine Intro/Titelfolie sein (Layout: intro)' : ''}
${options.includeTableOfContents ? '- Füge eine Inhaltsverzeichnis-Folie nach der Titelfolie ein (Layout: table-of-contents)' : ''}
- Jede Folie braucht einen klaren Titel und eine Beschreibung des Inhalts
- Wähle passende Layout-Typen für jeden Inhalt
- Die letzte Folie sollte ein Fazit oder Abschluss sein (Layout: closing)

Layout-Typen und wann sie verwendet werden:
- intro: NUR für die erste Titelfolie (Titel, Beschreibung, Name, Datum)
- table-of-contents: NUR für ein Inhaltsverzeichnis — NICHT für Inhaltsfolien verwenden!
- bullet-points: Für Aufzählungen mit Kennzahlen (Text + Metriken). Standardwahl für die meisten Inhaltsfolien.
- bullet-with-icons: Für Aufzählungen mit Icons und Bildern
- metrics: Für reine Kennzahlen-Folien (2-3 große Zahlen mit Labels)
- chart: Für Daten-Visualisierungen mit Diagramm und Stichpunkten
- table: Für tabellarische Übersichten (Vergleiche, Listen)
- numbered-bullets: Für nummerierte Schritte/Prozesse mit Bild
- team: Für Teamvorstellungen mit Fotos
- quote: Für Zitate mit Hintergrundbild
- closing: NUR für die Abschlussfolie (Fazit, Kontaktdaten)`;

    const userPrompt = `Erstelle eine Präsentation zum Thema: ${options.content}`;

    console.log('[slides-graph] outlineNode system prompt:', systemPrompt);
    console.log('[slides-graph] outlineNode user prompt:', userPrompt);

    const result = await generateObject({
      model,
      schema: SlideOutlineSchema,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.7,
    });

    const outline = result.object;
    const outlineTimeMs = Date.now() - startTime;

    console.log('[slides-graph] outlineNode completed', {
      title: outline.title,
      slideCount: outline.slides.length,
      outlineTimeMs,
      slides: outline.slides.map((s, i) => ({
        index: i,
        title: s.title,
        suggestedLayout: s.suggestedLayout,
        contentPreview: s.content.slice(0, 80),
      })),
    });

    return {
      outline,
      presentationTitle: outline.title,
      outlineTimeMs,
    };
  } catch (err) {
    const outlineTimeMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : String(err);
    console.error('[slides-graph] outlineNode FAILED:', message);

    return {
      error: `Outline generation failed: ${message}`,
      outlineTimeMs,
    };
  }
}
