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

exports.createPadWithText = async (padId, text) => {
  try {
    // Erstelle Pad
    await etherpadApi.get('/api/1.2.15/createPad', {
      params: { padID: padId }
    });
    
    // Setze Text
    await etherpadApi.get('/api/1.2.15/setText', {
      params: { padID: padId, text }
    });
    
    // Generiere URL
    return `${process.env.ETHERPAD_FRONTEND_URL || 'https://gruenera.uber.space'}/p/${padId}`;
  } catch (error) {
    console.error('Fehler bei Etherpad-API-Aufruf:', error.response ? error.response.data : error.message);
    throw new Error('Fehler bei der Kommunikation mit Etherpad');
  }
};
