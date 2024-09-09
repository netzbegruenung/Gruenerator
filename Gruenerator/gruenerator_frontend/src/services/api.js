// src/services/api.js

import { AppError, ErrorTypes } from '../components/utils/errorHandling';

const API_BASE_URL = '/api'; // Dies könnte später in eine Konstanten-Datei verschoben werden

async function fetchWithErrorHandling(url, options = {}) {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new AppError(`HTTP error! status: ${response.status}`, ErrorTypes.API);
    }
    return response;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Ein Netzwerkfehler ist aufgetreten.', ErrorTypes.NETWORK, error);
  }
}

export const sharepicAPI = {
  generateText: async (type, formData) => {
    const response = await fetchWithErrorHandling(`${API_BASE_URL}/${type.toLowerCase()}_claude`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    return response.json();
  },

  generateImage: async (formData) => {
    const endpoint = formData.type === 'Zitat' ? 'zitat_canvas' : 'dreizeilen_canvas';
    const requestBody = new FormData();
    
    if (formData.uploadedImage) {
      requestBody.append('image', formData.uploadedImage);
    }
    Object.keys(formData).forEach(key => {
      if (key !== 'uploadedImage') {
        requestBody.append(key, formData[key]);
      }
    });

    const response = await fetchWithErrorHandling(`${API_BASE_URL}/${endpoint}`, {
      method: 'POST',
      body: requestBody,
    });

    const textData = await response.text();
    const data = JSON.parse(textData);

    if (data && data.image) {
      return data.image;
    } else {
      throw new AppError("Keine Bilddaten in der Antwort", ErrorTypes.API);
    }
  }
};