const axios = require('axios');

const ETHERPAD_API_URL = process.env.ETHERPAD_API_URL || 'https://gruenera.uber.space/api';
const ETHERPAD_API_KEY = process.env.ETHERPAD_API_KEY;

if (!ETHERPAD_API_KEY) {
  throw new Error('ETHERPAD_API_KEY ist nicht in den Umgebungsvariablen definiert');
}

const etherpadApi = axios.create({
  baseURL: ETHERPAD_API_URL,
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded'
  }
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

    // Erstelle Pad
    await etherpadApi.post('/api/1.2.15/createPad', null, {
      params: { 
        apikey: ETHERPAD_API_KEY,
        padID: formattedPadId 
      }
    });
    
    // Setze HTML
    const formData = new URLSearchParams();
    formData.append('apikey', ETHERPAD_API_KEY);
    formData.append('padID', formattedPadId);
    formData.append('html', text);
    
    await etherpadApi.post('/api/1.2.15/setHTML', formData);
    
    // Generiere URL
    const padURL = `${ETHERPAD_FRONTEND_URL}/p/${formattedPadId}`;
    return padURL;
  } catch (error) {
    console.error('Fehler bei Etherpad-API-Aufruf:', error.response ? error.response.data : error.message);
    throw new Error('Fehler bei der Kommunikation mit Etherpad');
  }
};
