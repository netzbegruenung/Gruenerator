const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

console.log('Wahlpruefstein Thueringen route module loaded');

require('dotenv').config();
console.log('Environment variables loaded');

const loadProgramSections = () => {
    console.log('Loading program sections');
    const sections = [];
    const filenames = [
        'WahlprogrammThueringenFreiheit.txt',
        'WahlprogrammThueringenGesellschaft.txt',
        'WahlprogrammThueringenUmwelt.txt'
    ];

    filenames.forEach(filename => {
        const sectionPath = path.join(__dirname, 'uploads', 'WahlprogrammThueringen', filename);
        console.log(`Attempting to read file: ${sectionPath}`);
        try {
            const sectionText = fs.readFileSync(sectionPath, 'utf-8');
            sections.push(sectionText);
            console.log(`Successfully loaded: ${filename}`);
        } catch (error) {
            console.error(`Error loading file ${filename}:`, error.message);
        }
    });

    console.log(`Loaded ${sections.length} program sections`);
    return sections;
};

const programSections = loadProgramSections();

router.get('/programSections', (req, res) => {
    console.log('Received request for program sections');
    res.json(programSections);
});

router.post('/frage', async (req, res) => {
    console.log('Received question request');
    const { question, sectionIndex, useBackupProvider } = req.body;
    console.log('Question:', question);
    console.log('Section Index:', sectionIndex);
    console.log('Using Backup Provider:', useBackupProvider);

    if (typeof question !== 'string' || typeof sectionIndex !== 'number' || sectionIndex < 0 || sectionIndex >= programSections.length) {
        console.log('Invalid input received');
        return res.status(400).json({ 
            error: 'Ungültige Eingabe',
            details: 'Frage oder Themenbereich ungültig'
        });
    }

    const selectedSection = programSections[sectionIndex];

    try {
        const result = await req.app.locals.aiWorkerPool.processRequest({
            type: 'wahlpruefstein',
            systemPrompt: `Du bist ein Experte für das Wahlprogramm von Bündnis 90/Die Grünen. Beantworte Fragen basierend auf folgendem Kontext:\n\n${selectedSection}`,
            messages: [{
                role: "user",
                content: question
            }],
            options: {
                model: "claude-3-5-sonnet-20240620",
                max_tokens: 4000,
                temperature: 0.9
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

console.log('Wahlpruefstein Thueringen routes configured');

module.exports = router;