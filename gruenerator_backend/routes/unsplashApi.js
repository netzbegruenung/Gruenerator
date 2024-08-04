const express = require('express');
const axios = require('axios');
const router = express.Router();
require('dotenv').config();

const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;

// Hilfsfunktion zum Loggen
const logInfo = (message, data) => {
  console.log(`[INFO] ${message}`, data);
};

const logError = (message, error) => {
  console.error(`[ERROR] ${message}`, error);
};

router.get('/random-images', async (req, res) => {
  logInfo('Received request for images');
  try {
    if (!UNSPLASH_ACCESS_KEY) {
      throw new Error('UNSPLASH_ACCESS_KEY is not set');
    }

    const query = req.query.query;
    if (!query) {
      throw new Error('Query parameter is required');
    }

    logInfo('Fetching images with query:', query);

    const response = await axios.get('https://api.unsplash.com/search/photos', {
      params: {
        query: query,
        per_page: 6,
        client_id: UNSPLASH_ACCESS_KEY
      }
    });

    logInfo('Successfully fetched images from Unsplash');

    if (response.data.results.length === 0) {
      throw new Error('No images found for the given query');
    }

    const imagesData = response.data.results.map(image => ({
      imageUrl: image.urls.regular,
      downloadLocation: image.links.download_location,
      photographerName: image.user.name,
      photographerUsername: image.user.username
    }));

    logInfo('Sending images data to client');
    res.json(imagesData);
  } catch (error) {
    logError('Error fetching images from Unsplash:', error);

    if (error.response) {
      logError('Unsplash API response:', error.response.data);
    }

    res.status(500).json({
      error: 'Failed to fetch images from Unsplash',
      message: error.message,
      details: error.response ? error.response.data : 'No additional details'
    });
  }
});

module.exports = router;

router.get('/trigger-download', async (req, res) => {
  logInfo('Received request to trigger download');
  try {
    const downloadLocation = req.query.downloadLocation;
    if (!downloadLocation) {
      throw new Error('Download location is required');
    }

    logInfo('Triggering download for location:', downloadLocation);

    await axios.get(downloadLocation, {
      params: { client_id: UNSPLASH_ACCESS_KEY }
    });

    logInfo('Successfully triggered download');
    res.sendStatus(200);
  } catch (error) {
    logError('Error triggering download:', error);

    if (error.response) {
      logError('Unsplash API response for download:', error.response.data);
    }

    res.status(500).json({ 
      error: 'Failed to trigger download',
      message: error.message,
      details: error.response ? error.response.data : 'No additional details'
    });
  }
});

module.exports = router;