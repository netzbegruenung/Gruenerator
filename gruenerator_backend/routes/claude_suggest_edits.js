const express = require('express');
const router = express.Router();

// Helper: robust JSON parse with simple fallbacks
function parseJsonSafe(raw) {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch (e1) {
    const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch (e2) {
      return null;
    }
  }
}

router.post('/', async (req, res) => {
  const { instruction, currentText } = req.body || {};

  if (!instruction || !currentText) {
    return res.status(400).json({
      error: 'instruction und currentText sind erforderlich.',
      details: { instruction: !!instruction, currentText: !!currentText }
    });
  }

  try {
    const systemPrompt = `Du bist ein präziser Text-Editor. Aufgabe: Analysiere den gegebenen Text und die Nutzer-Anweisung und schlage konkrete, wortgetreue Satz-/Abschnittsänderungen vor. Gib NUR valides JSON zurück.\n\nFORMAT (zwingend):\n{\n  "changes": [\n    { "text_to_find": "<exakter Originalausschnitt AUS dem gegebenen Text>", "replacement_text": "<neuer Text>" }\n  ]\n}\n\nKRITISCH WICHTIG:\n- text_to_find MUSS ein exakt im Text vorkommender Ausschnitt sein (inkl. Satzzeichen/Zeilenumbrüche).\n- Wähle Ausschnitte so lang wie nötig, um Eindeutigkeit sicherzustellen.\n- Gib KEINE Erklärungen, KEINE Einleitung, KEINE Codeblöcke, NUR JSON.\n- replacement_text darf kein HTML enthalten.`;

    const userContent = `AKTUELLER TEXT (Markdown):\n---\n${currentText}\n---\n\nNUTZER-ANWEISUNG:\n${instruction}\n\nGib NUR das JSON-Objekt gemäß Spezifikation zurück.`;

    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'text_adjustment',
      systemPrompt,
      messages: [{ role: 'user', content: userContent }],
      options: { max_tokens: 1024, temperature: 0.3 }
    }, req);

    if (!result?.success) {
      return res.status(500).json({ error: result?.error || 'AI-Verarbeitung fehlgeschlagen' });
    }

    const parsed = parseJsonSafe(result.content);
    if (!parsed || !Array.isArray(parsed.changes)) {
      return res.status(400).json({
        error: 'Ungültige AI-Antwort. Erwartete Struktur { changes: [...] }',
        raw: result.content
      });
    }

    // Validate elements
    const validChanges = parsed.changes.filter(c => c && typeof c.text_to_find === 'string' && typeof c.replacement_text === 'string');
    return res.json({ changes: validChanges });
  } catch (error) {
    console.error('[claude_suggest_edits] Fehler:', error);
    return res.status(500).json({ error: 'Interner Fehler bei der Bearbeitung', details: error.message });
  }
});

module.exports = router;

