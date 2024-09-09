const express = require('express');
const { Anthropic } = require('@anthropic-ai/sdk');
const router = express.Router();
const fs = require('fs');
const path = require('path');

console.log('Wahlpruefstein Thueringen route module loaded');

require('dotenv').config();
console.log('Environment variables loaded');

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY
});
console.log('Anthropic client initialized');

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
    const { question, sectionIndex } = req.body;
    console.log('Question:', question);
    console.log('Section Index:', sectionIndex);
    console.log('Using API Key:', process.env.CLAUDE_API_KEY);

    if (typeof question !== 'string' || typeof sectionIndex !== 'number' || sectionIndex < 0 || sectionIndex >= programSections.length) {
        console.log('Invalid input received');
        return res.status(400).json({ message: 'Invalid input' });
    }

    const selectedSection = programSections[sectionIndex];
    console.log('Selected section length:', selectedSection.length);

    try {
        console.log('Sending request to Claude API');
        const response = await anthropic.messages.create({
            model: "claude-3-5-sonnet-20240620",
            max_tokens: 4000,
            temperature: 0.9,
            system: `You are an expert on the election program of Bündnis 90/Die Grünen. Provide detailed answers based on the following context:\n\n${selectedSection}`,
            messages: [
                {
                    role: "user",
                    content: question
                }
            ]
        });

        console.log('Received response from Claude API');

        if (response && response.content && Array.isArray(response.content)) {
            const textContent = response.content.map(item => item.text).join("\n");
            console.log('Processed API response, sending to client');
            res.json({ content: textContent });
        } else {
            console.error('API response missing or incorrect content structure:', response);
            res.status(500).send('API response missing or incorrect content structure');
        }
    } catch (error) {
        console.error('Error with Claude API:', error.response ? error.response.data : error.message);
        console.error('Full error object:', JSON.stringify(error, null, 2));
        res.status(500).send('Internal Server Error');
    }
});

console.log('Wahlpruefstein Thueringen routes configured');

module.exports = router;