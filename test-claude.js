require('dotenv').config();
const { AnthropicVertex } = require('@anthropic-ai/vertex-sdk');

async function testClaude() {
  try {
    // Prüfe Umgebungsvariablen
    if (!process.env.GCP_PROJECT_ID) {
      throw new Error('GCP_PROJECT_ID ist nicht gesetzt');
    }

    console.log('Starte Test mit folgender Konfiguration:', {
      projectId: process.env.GCP_PROJECT_ID,
      region: process.env.CLOUD_ML_REGION || 'europe-west1',
      apiEndpoint: `${process.env.CLOUD_ML_REGION || 'europe-west1'}-aiplatform.googleapis.com`
    });

    // Vereinfachte Client-Konfiguration
    const anthropic = new AnthropicVertex({
      projectId: process.env.GCP_PROJECT_ID,
      location: process.env.CLOUD_ML_REGION || 'europe-west1'
    });

    console.log('Client erfolgreich initialisiert, sende Test-Anfrage...');

    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-v2@20241022",
      messages: [{
        role: "user",
        content: "Sage 'Hallo Welt!'"
      }],
      max_tokens: 1000,
      temperature: 0.7
    });

    console.log('Erfolg! Antwort von Claude:', response.content[0].text);
  } catch (error) {
    console.error('Fehler beim Test:', {
      message: error.message,
      name: error.name,
      stack: error.stack,
      details: error.details || 'Keine weiteren Details verfügbar'
    });
  }
}

// Prüfe Umgebungsvariablen vor dem Start
console.log('Umgebungsvariablen:', {
  GCP_PROJECT_ID: process.env.GCP_PROJECT_ID,
  CLOUD_ML_REGION: process.env.CLOUD_ML_REGION,
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS
});

testClaude(); 