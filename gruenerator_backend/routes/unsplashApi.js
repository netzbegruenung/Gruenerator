const express = require('express');
const axios = require('axios');
const router = express.Router();
require('dotenv').config();

const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;

// Hilfsfunktion zum Loggen
const logInfo = (message, data) => {
  console.log(`[INFO] [${new Date().toISOString()}] ${message}`, data ? JSON.stringify(data, null, 2) : '');
};

const logError = (message, error) => {
  console.error(`[ERROR] [${new Date().toISOString()}] ${message}`, error ? JSON.stringify({
    message: error.message,
    stack: error.stack,
    response: error.response ? error.response.data : 'No response data'
  }, null, 2) : '');
};

router.get('/search-images', async (req, res) => {
  const startTime = Date.now();
  logInfo('Received request for images', { query: req.query, headers: req.headers });
  try {
    if (!UNSPLASH_ACCESS_KEY) {
      throw new Error('UNSPLASH_ACCESS_KEY is not set');
    }

    const query = req.query.query;
    if (!query) {
      throw new Error('Query parameter is required');
    }

    logInfo('Fetching images with query', { query });

    const response = await axios.get('https://api.unsplash.com/search/photos', {
      params: {
        query: query,
        order_by: 'relevant',
        per_page: 6,
        client_id: UNSPLASH_ACCESS_KEY
      }
    });

    logInfo('Unsplash API response headers', response.headers);
    logInfo('Unsplash API response status', response.status);
    logInfo('Successfully fetched images from Unsplash', { 
      total: response.data.total, 
      total_pages: response.data.total_pages,
      results_count: response.data.results.length 
    });

    if (response.data.results.length === 0) {
      throw new Error('No images found for the given query');
    }

    const imagesData = response.data.results.map(result => ({
      id: result.id,
      imageUrl: result.urls.regular,
      previewUrl: result.urls.small,
      fullImageUrl: result.urls.full,
      downloadLocation: result.links.download_location,
      photographerName: result.user.name,
      photographerUsername: result.user.username
    }));

    logInfo('Sending images data to client', { count: imagesData.length });
    res.json(imagesData);
    logInfo(`Request completed in ${Date.now() - startTime}ms`);
  } catch (error) {
    logError('Error fetching images from Unsplash', error);

    res.status(500).json({
      error: 'Failed to fetch images from Unsplash',
      message: error.message,
      details: error.response ? error.response.data : 'No additional details'
    });
    logInfo(`Request failed in ${Date.now() - startTime}ms`);
  }
});

router.get('/trigger-download', async (req, res) => {
  logInfo('Received request to trigger download', req.query);
  try {
    const downloadLocation = req.query.downloadLocation;
    if (!downloadLocation) {
      throw new Error('Download location is required');
    }

    logInfo('Triggering download for location', { downloadLocation });

    await axios.get(downloadLocation, {
      params: { client_id: UNSPLASH_ACCESS_KEY }
    });

    logInfo('Successfully triggered download');
    res.sendStatus(200);
  } catch (error) {
    logError('Error triggering download', error);

    res.status(500).json({
      error: 'Failed to trigger download',
      message: error.message,
      details: error.response ? error.response.data : 'No additional details'
    });
  }
});

// Fügen Sie diese Route am Ende der unsplashApi.js Datei hinzu

router.get('/proxy-image', async (req, res) => {
  const startTime = Date.now();
  const logInfo = (message, data) => {
    console.log(`[INFO] [${new Date().toISOString()}] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  };
  
  const logError = (message, error) => {
    console.error(`[ERROR] [${new Date().toISOString()}] ${message}`, error ? JSON.stringify({
      message: error.message,
      stack: error.stack,
      response: error.response ? error.response.data : 'Keine Antwortdaten'
    }, null, 2) : '');
  };

  logInfo('Empfangene Anfrage für Proxy-Image', { query: req.query });

  try {
    const { url } = req.query;
    if (!url) {
      throw new Error('URL-Parameter ist erforderlich');
    }

    logInfo('Bild von Unsplash abrufen', { url });

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      params: {
        client_id: UNSPLASH_ACCESS_KEY
      }
    });

    res.set('Content-Type', response.headers['content-type']);
    res.send(response.data);

    logInfo(`Anfrage abgeschlossen in ${Date.now() - startTime}ms`);
  } catch (error) {
    logError('Fehler beim Abrufen des Bildes von Unsplash', error);
    res.status(500).json({
      error: 'Fehler beim Abrufen des Bildes von Unsplash',
      message: error.message
    });
    logInfo(`Anfrage fehlgeschlagen in ${Date.now() - startTime}ms`);
  }
});

module.exports = router;
