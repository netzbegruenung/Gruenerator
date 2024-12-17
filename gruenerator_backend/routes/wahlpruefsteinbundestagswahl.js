const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

console.log('Wahlpruefstein Bundestagswahl route module loaded');

require('dotenv').config();
console.log('Environment variables loaded');

const loadProgramText = () => {
    console.log('Loading Bundestagswahlprogramm');
    // Absoluter Pfad für Debugging
    const absolutePath = path.resolve(__dirname);
    console.log('Current directory:', absolutePath);
    
    const uploadsDir = path.join(__dirname, 'uploads');
    const filePath = path.join(uploadsDir, 'Wahlprogramm', 'BundestagswahlprogrammGruene.txt');
    console.log('Attempting to read file from:', filePath);
    
    try {
        // Liste alle Dateien im Verzeichnis auf
        console.log('Checking if uploads directory exists:', fs.existsSync(uploadsDir));
        if (fs.existsSync(uploadsDir)) {
            console.log('Contents of uploads directory:', fs.readdirSync(uploadsDir));
            
            const wahlprogrammDir = path.join(uploadsDir, 'Wahlprogramm');
            if (fs.existsSync(wahlprogrammDir)) {
                console.log('Contents of Wahlprogramm directory:', fs.readdirSync(wahlprogrammDir));
            }
        }
        
        if (!fs.existsSync(filePath)) {
            console.error(`File does not exist at path: ${filePath}`);
            return null;
        }
        
        const programText = fs.readFileSync(filePath, 'utf-8');
        console.log('Successfully loaded Bundestagswahlprogramm');
        return programText;
    } catch (error) {
        console.error('Error loading Bundestagswahlprogramm:', error.message);
        console.error('Full error:', error);
        console.error('Stack trace:', error.stack);
        return null;
    }
};

const programText = loadProgramText();

router.post('/frage', async (req, res) => {
    console.log('Received question request');
    const { question, useBackupProvider } = req.body;
    console.log('Question:', question);
    console.log('Using backup provider:', useBackupProvider);

    if (!programText) {
        return res.status(500).json({ 
            error: 'Wahlprogramm konnte nicht geladen werden',
            details: 'Datei nicht gefunden oder Lesefehler'
        });
    }

    if (typeof question !== 'string' || question.trim().length === 0) {
        console.log('Invalid input received');
        return res.status(400).json({ 
            error: 'Ungültige Eingabe',
            details: 'Bitte geben Sie eine Frage ein'
        });
    }

    try {
        const result = await req.app.locals.aiWorkerPool.processRequest({
            type: 'wahlpruefsteinBTW',
            messages: [{
                role: "user",
                content: `Du bist ein KI-Assistent, spezialisiert auf das Bundestagswahlprogramm von Bündnis 90/Die Grünen. Deine Aufgabe ist es, Fragen von Bürger*innen zum Wahlprogramm präzise und verständlich zu beantworten.

Analysiere die Frage in folgenden Schritten:
1. Identifiziere die Kernthemen und Aspekte der Frage
2. Suche alle relevanten Passagen im Wahlprogramm
3. Prüfe die Zusammenhänge zwischen verschiedenen Programmteilen
4. Strukturiere die Antwort logisch und nachvollziehbar

Formuliere deine Antwort in zwei Teilen:

TEIL 1 - ZITATE:
- Beginne mit "Zitat:"
- Zitiere die wichtigsten und relevantesten Stellen aus dem Wahlprogramm wörtlich
- Wähle die Zitate sorgfältig aus, um alle Aspekte der Frage abzudecken
- Ordne die Zitate thematisch sinnvoll

TEIL 2 - BÜRGERNAHE ERKLÄRUNG:
- Beginne mit "Bürgernahe Antwort:"
- Erkläre die Position der Grünen in einfacher, verständlicher Sprache
- Verwende Alltagssprache und vermeide Fachbegriffe
- Falls Fachbegriffe nötig sind, erkläre sie direkt
- Stelle konkrete Bezüge zum Alltag der Bürger*innen her
- Nutze anschauliche Beispiele
- Erkläre die Zusammenhänge zwischen verschiedenen Aspekten
- Verdeutliche die praktischen Auswirkungen der Vorschläge
- Fasse am Ende die wichtigsten Punkte kurz zusammen

Wichtige Grundsätze für deine Antwort:
- Sei präzise und faktenbasiert
- Bleibe neutral und sachlich
- Erkläre komplexe Zusammenhänge Schritt für Schritt
- Verwende eine positive, lösungsorientierte Sprache
- Gehe auf alle Aspekte der Frage ein
- Stelle die Informationen in einen größeren Kontext
- Zeige die Relevanz für die Bürger*innen auf

Kontext (Wahlprogramm):
${programText}

Bitte beantworte nun folgende Frage: ${question}`
            }],
            options: {
                model: "claude-3-5-sonnet-20240620",
                max_tokens: 8000,
                temperature: 0.7
            },
            useBackupProvider
        });

        if (!result.success) {
            throw new Error(result.error);
        }

        res.json({ 
            content: result.content,
            metadata: result.metadata
        });
    } catch (error) {
        console.error('Fehler bei der Wahlprüfstein-Verarbeitung:', error);
        res.status(500).json({ 
            error: 'Fehler bei der Verarbeitung der Frage',
            details: error.message 
        });
    }
});

console.log('Wahlpruefstein Bundestagswahl routes configured');

module.exports = router; 