const fs = require('fs');
const { OpenAI } = require('openai');

const client = new OpenAI();

async function transcribeWithOpenAI(filePath) {
  try {
    // Log der Dateigröße vor dem Senden
    const stats = fs.statSync(filePath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`Sende Audio an OpenAI (${fileSizeMB} MB): ${filePath}`);
    
    const audioFile = fs.createReadStream(filePath);
    const transcription = await client.audio.transcriptions.create({
      model: "whisper-1",
      file: audioFile,
      language: "de"
    });
    
    return transcription.text;
  } catch (error) {
    console.error('OpenAI Transkriptionsfehler:', error);
    throw error;
  }
}

module.exports = {
  transcribeWithOpenAI
}; 