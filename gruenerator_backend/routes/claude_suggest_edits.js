const express = require('express');
const router = express.Router();

// Helper: robust JSON parse with multiple fallback strategies
function parseJsonSafe(raw) {
  if (typeof raw !== 'string') return raw;
  
  // First try parsing as-is
  try {
    return JSON.parse(raw);
  } catch (e1) {
    // Only proceed with fallback strategies if initial parsing failed
    console.log('[parseJsonSafe] Initial parse failed, trying fallback strategies');
    
    // Strategy 1: Remove markdown code blocks (most common issue)
    let cleaned = raw.replace(/```json\s*\n?|```\s*\n?/g, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch (e2) {
      
      // Strategy 2: Remove all backticks and try again
      cleaned = raw.replace(/`+/g, '').trim();
      try {
        return JSON.parse(cleaned);
      } catch (e3) {
        
        // Strategy 3: Try to extract JSON between first { and last }
        const match = cleaned.match(/(\{[\s\S]*\})/);
        if (match) {
          try {
            return JSON.parse(match[1]);
          } catch (e4) {
            // Continue to next strategy
          }
        }
        
        // Strategy 4: Fix unescaped newlines within JSON string values
        const fixedNewlines = cleaned.replace(/"([^"]*?)(\n)([^"]*?)"/g, (match, before, newline, after) => {
          return `"${before}\\n${after}"`;
        });
        try {
          return JSON.parse(fixedNewlines);
        } catch (e5) {
          // Continue to next strategy
        }
        
        // Strategy 5: Last resort - look for JSON-like pattern with quotes
        const jsonMatch = cleaned.match(/"changes":\s*\[[\s\S]*\]/);
        if (jsonMatch) {
          try {
            const wrappedJson = `{${jsonMatch[0]}}`;
            const result = JSON.parse(wrappedJson);
            if (Array.isArray(result.changes)) {
              return result;
            }
          } catch (e6) {
            // Fall through to logging
          }
        }
        
        // All strategies failed - log for debugging
        console.error('[parseJsonSafe] All parsing strategies failed:', {
          originalLength: raw.length,
          originalPreview: raw.substring(0, 200),
          cleanedLength: cleaned.length,
          cleanedPreview: cleaned.substring(0, 200),
          errors: [e1.message, e2.message, e3.message]
        });
        
        return null;
      }
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
    const systemPrompt = `Du bist ein präziser Text-Editor. Aufgabe: Analysiere den gegebenen Text und die Nutzer-Anweisung und schlage konkrete, wortgetreue Satz-/Abschnittsänderungen vor. Gib NUR valides JSON zurück.\n\nFORMAT (zwingend):\n{\n  "changes": [\n    { "text_to_find": "<exakter Originalausschnitt AUS dem gegebenen Text>", "replacement_text": "<neuer Text>" }\n  ],\n  "summary": "<Kurze, freundliche Bestätigung der Änderungen in 1-2 Sätzen (optional, max. 1 Emoji)>"\n}\n\nKRITISCH WICHTIG:\n- text_to_find MUSS ein exakt im Text vorkommender Ausschnitt sein (inkl. Satzzeichen/Zeilenumbrüche).\n- Wähle Ausschnitte so lang wie nötig, um Eindeutigkeit sicherzustellen.\n- summary: Eine natürliche, kurze Nachricht über die vorgenommenen Änderungen. Emojis sind optional: Nutze sie manchmal, höchstens eines, und wähle es kontextpassend (z. B. ✏️ bei Formulierungen, ✂️ bei Kürzungen, ✅ bei erfolgreicher Anwendung). Verwende nicht in jeder Antwort ein Emoji, wiederhole nicht stets dasselbe, und benutze ✨ nicht als Standard.\n- Gib KEINE Erklärungen, KEINE Einleitung, KEINE Codeblöcke, NUR JSON.\n- replacement_text darf kein HTML enthalten.\n- ALLE Zeilenumbrüche in JSON-Strings müssen als \\\\n escaped werden - NIEMALS echte Zeilenumbrüche in JSON-String-Werten verwenden.`;

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
      console.error('[claude_suggest_edits] JSON parsing failed:', {
        hasContent: !!result.content,
        contentLength: result.content?.length || 0,
        contentPreview: result.content?.substring(0, 300) || '',
        parsedType: typeof parsed,
        parsedValue: parsed,
        hasChangesProperty: parsed && 'changes' in parsed,
        changesType: parsed ? typeof parsed.changes : 'undefined'
      });
      
      return res.status(400).json({
        error: 'Ungültige AI-Antwort. Erwartete Struktur { changes: [...] }',
        debug: {
          received: typeof parsed,
          hasChanges: parsed && 'changes' in parsed,
          changesType: parsed ? typeof parsed.changes : 'undefined'
        },
        raw: result.content?.substring(0, 500) // Limit raw content length
      });
    }

    // Validate elements
    const validChanges = parsed.changes.filter(c => c && typeof c.text_to_find === 'string' && typeof c.replacement_text === 'string');
    const summary = parsed.summary || `${validChanges.length} ${validChanges.length === 1 ? 'Änderung' : 'Änderungen'} durchgeführt! ✅`;
    return res.json({ changes: validChanges, summary });
  } catch (error) {
    console.error('[claude_suggest_edits] Fehler:', error);
    return res.status(500).json({ error: 'Interner Fehler bei der Bearbeitung', details: error.message });
  }
});

module.exports = router;
