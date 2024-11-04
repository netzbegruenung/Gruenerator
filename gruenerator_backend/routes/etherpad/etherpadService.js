const axios = require('axios');

const ETHERPAD_API_URL = process.env.ETHERPAD_API_URL || 'https://gruenera.uber.space/api';
const ETHERPAD_API_KEY = process.env.ETHERPAD_API_KEY;

if (!ETHERPAD_API_KEY) {
  throw new Error('ETHERPAD_API_KEY ist nicht in den Umgebungsvariablen definiert');
}

const etherpadApi = axios.create({
  baseURL: ETHERPAD_API_URL,
  params: { apikey: ETHERPAD_API_KEY }
});

const ETHERPAD_FRONTEND_URL = process.env.ETHERPAD_FRONTEND_URL || 'https://gruenera.uber.space';

if (!ETHERPAD_FRONTEND_URL) {
  throw new Error('ETHERPAD_FRONTEND_URL ist nicht in den Umgebungsvariablen definiert');
}

exports.createPadWithText = async (padId, text, documentType) => {
  try {
    // Formatiere den Dokumenttyp (Kleinbuchstaben, Leerzeichen durch Bindestriche ersetzen)
    const formattedDocType = documentType ? 
      documentType.toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[äöüß]/g, match => {
          return {
            'ä': 'ae',
            'ö': 'oe',
            'ü': 'ue',
            'ß': 'ss'
          }[match];
        }) : '';

    // Erstelle eine formatierte padId mit Dokumenttyp
    const formattedPadId = formattedDocType ? 
      `${formattedDocType}-${padId}` : 
      padId;

    console.log('Creating pad with ID:', formattedPadId); // Debug-Log

    // Erstelle Pad
    await etherpadApi.get('/api/1.2.15/createPad', {
      params: { padID: formattedPadId }
    });
    
    // Setze Text
    await etherpadApi.get('/api/1.2.15/setText', {
      params: { padID: formattedPadId, text }
    });
    
    // Generiere URL
    const padURL = `${ETHERPAD_FRONTEND_URL}/p/${formattedPadId}`;
    console.log('Generated URL:', padURL); // Debug-Log
    return padURL;
  } catch (error) {
    console.error('Fehler bei Etherpad-API-Aufruf:', error.response ? error.response.data : error.message);
    throw new Error('Fehler bei der Kommunikation mit Etherpad');
  }
};
