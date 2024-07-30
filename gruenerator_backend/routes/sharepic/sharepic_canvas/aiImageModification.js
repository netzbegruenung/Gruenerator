const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const router = express.Router();
require('dotenv').config();

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY
});

function flattenParams(params) {
  console.log('[AI Image Modification API] Flattening params:', params);
  return {
    'fontSize': params.fontSize,
    'colors_0_background': params.colors[0].background,
    'colors_0_text': params.colors[0].text,
    'colors_1_background': params.colors[1].background,
    'colors_1_text': params.colors[1].text,
    'colors_2_background': params.colors[2].background,
    'colors_2_text': params.colors[2].text,
    'balkenOffset_0': params.balkenOffset[0],
    'balkenOffset_1': params.balkenOffset[1],
    'balkenOffset_2': params.balkenOffset[2],
    'sunflowerOffset_x': params.sunflowerOffset[0],
    'sunflowerOffset_y': params.sunflowerOffset[1],
    'sunflowerPosition': params.sunflowerPosition,
    'balkenGruppenOffset_x': params.balkenGruppenOffset[0],
    'balkenGruppenOffset_y': params.balkenGruppenOffset[1]
  };
}

function validateModifiedParams(params) {
  console.log('[AI Image Modification API] Validating params:', params);
  const validatedParams = { ...params };

  // Validierung für balkenGruppenOffset
  validatedParams.balkenGruppenOffset = Array.isArray(params.balkenGruppenOffset) && params.balkenGruppenOffset.length === 2
    ? params.balkenGruppenOffset.map(offset => Math.min(Math.max(offset, -100), 100))
    : [0, 0];

  // Validierung für fontSize (jetzt mit Maximum 110)
  validatedParams.fontSize = Math.min(Math.max(params.fontSize || 85, 75), 110);

  // Validierung für colors
  validatedParams.colors = Array.isArray(params.colors) && params.colors.length === 3
    ? params.colors.map(color => ({
        background: /^#[0-9A-F]{6}$/i.test(color.background) ? color.background : '#085f36',
        text: /^#[0-9A-F]{6}$/i.test(color.text) ? color.text : '#f5f1e9'
      }))
    : [
        { background: '#085f36', text: '#f5f1e9' },
        { background: '#085f36', text: '#f5f1e9' },
        { background: '#085f36', text: '#f5f1e9' }
      ];

  // Neue Validierung für balkenOffset
  validatedParams.balkenOffset = Array.isArray(params.balkenOffset) && params.balkenOffset.length === 3
    ? params.balkenOffset.map(offset => Math.min(Math.max(offset, -50), 50))
    : [0, 0, 0];

  // Validierung für sunflowerPosition
  validatedParams.sunflowerPosition = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'].includes(params.sunflowerPosition)
    ? params.sunflowerPosition
    : 'bottomRight';

  // Validierung für sunflowerOffset
  validatedParams.sunflowerOffset = Array.isArray(params.sunflowerOffset) && params.sunflowerOffset.length === 2
    ? params.sunflowerOffset.map(offset => Math.min(Math.max(offset, -100), 100))
    : [0, 0];

  console.log('[AI Image Modification API] Validated params:', validatedParams);
  return validatedParams;
}

async function generateImageModification(userInstruction, currentParams) {
  console.log('[AI Image Modification API] Generating image modification for instruction:', userInstruction);
  const prompt = `
  Du bist ein Experte für Bildmodifikation. Deine Aufgabe ist es, natürlichsprachliche Anweisungen genau wie vom User gewünscht in präzise Bildparameter umzuwandeln.
  
  Das Bild hat eine Größe von 1080x1080 Pixeln und enthält drei übereinander angeordnete Textbalken ("erster Balken", "zweiter Balken", "dritter Balken") sowie eine Sonnenblume.
  
  Benutzeranweisung: "${userInstruction}"
  
  Aktuelle Parameter:
  ${JSON.stringify(currentParams, null, 2)}
  
  Erstelle ein JSON-Objekt mit diesen Parametern:
  
  {
    "balkenGruppenOffset": [number, number],
    "fontSize": number,
    "colors": [
      { "background": string, "text": string },
      { "background": string, "text": string },
      { "background": string, "text": string }
    ],
    "balkenOffset": [number, number, number],
    "sunflowerPosition": string,
    "sunflowerOffset": [number, number]
  }
  
  Wichtige Hinweise:
  1. Die Schriftgröße (fontSize) darf nur zwischen 75 und 110 liegen.
  2. balkenGruppenOffset bewegt alle drei Textbalken gemeinsam:
     - Der erste Wert bewegt horizontal (positiv nach rechts, negativ nach links)
     - Der zweite Wert bewegt vertikal (positiv nach unten, negativ nach oben)
     - Maximale Verschiebung: ±200 Einheiten in jede Richtung
     - "weit": 150-200 Einheiten, "mittel": 80-149 Einheiten, "leicht": 20-79 Einheiten
  
  3. balkenOffset bewegt die einzelnen Balken zusätzlich nur horizontal:
     - Positive Werte bewegen nach rechts, negative nach links
     - Der erste Wert ist für den obersten Balken, der zweite für den mittleren, der dritte für den untersten
     - Maximale zusätzliche Verschiebung: ±50 Einheiten pro Balken
  
  4. sunflowerPosition bestimmt die Grundposition der Sonnenblume:
     - Mögliche Werte: "topLeft", "topRight", "bottomLeft", "bottomRight"
     - "links oben" entspricht "topLeft"
     - "rechts oben" entspricht "topRight"
     - "links unten" entspricht "bottomLeft"
     - "rechts unten" entspricht "bottomRight"
  
  5. sunflowerOffset ermöglicht Feinabstimmungen der Sonnenblumenposition:
     - Der erste Wert bewegt horizontal (positiv nach rechts, negativ nach links)
     - Der zweite Wert bewegt vertikal (positiv nach unten, negativ nach oben)
     - Maximale Verschiebung: ±100 Einheiten in jede Richtung
  
  6. Die Farben sollten als Hex-Codes angegeben werden. 
  Empfohlene Farbkombinationen (alle Balken):
  - Dunkelgrüner Hintergrund (#005538) mit weißem Text (#FFFFFF).
  - Beiger Hintergrund (#F5F1E9) mit dunkelgrünem Text (#005538).
  Erlaubte Farbkombinationen (die folgenden nur für den ersten Balken):
  - Beiger Hintergrund (#F5F1E9) mit dunkelgrünem Text (#005538).
  - Hellgrüner Hintergrund (#8ABD24) mit dunkelgrünem Text (#005538).
  - Dunkelgrüner Hintergrund (#005538) mit gelbem Text (#FFF17A).
  
  Achte auf eine sinnvolle Farbkombination auch zwischen den Balken. Maximal zwei Farbkombinationen bei den 3 Balken!
  
  Beachte bei allen Positionierungen und Verschiebungen die Bildgröße von 1080x1080 Pixeln, um sicherzustellen, dass alle Elemente innerhalb des Bildes bleiben.
  
  Gib nur das JSON-Objekt zurück, ohne zusätzlichen Text.
  `;
      
  try {
    const response = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 2000,
      temperature: 0.2,
      system: "Du bist ein erfahrener Bildbearbeiter. Deine Aufgabe ist es, Benutzeranweisungen in konkrete Bildmodifikationsparameter umzuwandeln. Gib nur das resultierende JSON-Objekt zurück.",
      messages: [{ role: "user", content: prompt }]
    });

    if (!response.content || !Array.isArray(response.content)) {
      throw new Error('Unexpected response format from Claude API');
    }

    const textContent = response.content.map(item => item.text).join("");
    console.log('[AI Image Modification API] Processed text content:', textContent);

    return JSON.parse(textContent);
  } catch (error) {
    console.error('[AI Image Modification API] Error generating image modification:', error);
    throw error;
  }
}

router.post('/', async (req, res) => {
  console.log('[AI Image Modification API] Received request:', req.body);
  const { userInstruction, currentImageParams } = req.body;

  try {
    const modifiedParams = await generateImageModification(userInstruction, currentImageParams);
    const validatedParams = validateModifiedParams(modifiedParams);
    const flattenedParams = flattenParams(validatedParams);

    // Füge die ursprünglichen Texte wieder hinzu
    flattenedParams.text_0 = currentImageParams.line1;
    flattenedParams.text_1 = currentImageParams.line2;
    flattenedParams.text_2 = currentImageParams.line3;

    console.log('[AI Image Modification API] Sending flattened params:', flattenedParams);
    res.json(flattenedParams);
  } catch (error) {
    console.error('[AI Image Modification API] Error processing request:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

module.exports = router;
