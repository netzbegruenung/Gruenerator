import React, { useState } from 'react';
import PropTypes from 'prop-types';

export const useSharepicSubmit = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submitSharepicData = async (type, formData) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/${type.toLowerCase()}_claude`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!response.ok) throw new Error('Netzwerkfehler');
      
      const data = await response.json();
      setLoading(false);
      return data;
    } catch (err) {
      setError(err.message);
      setLoading(false);
      throw err;
    }
  };

  return { submitSharepicData, loading, error };
};

export const generateSharepic = async (formData) => {
  const endpoint = formData.type === 'Zitat' ? '/api/zitat_canvas' : '/api/dreizeilen_canvas';
  
  const requestBody = new FormData();
  
  // Fügen Sie das Bild hinzu, wenn es vorhanden ist
  if (formData.uploadedImage) {
    requestBody.append('image', formData.uploadedImage);
  }

  // Fügen Sie die anderen Formularfelder hinzu
  Object.keys(formData).forEach(key => {
    if (key !== 'uploadedImage') {
      requestBody.append(key, formData[key]);
    }
  });

  const response = await fetch(endpoint, {
    method: 'POST',
    body: requestBody,
    // Entfernen Sie den Content-Type Header, damit der Browser den korrekten Boundary für FormData setzen kann
  });

  if (!response.ok) throw new Error('Fehler bei der Bildgenerierung');
  const data = await response.json();
  return data.image;
};

export const SharepicDisplay = ({ image }) => {
  if (!image) return null;

  return (
    <div>
      <img src={image} alt="Generiertes Sharepic" style={{maxWidth: '100%'}} />
      <a href={image} download="sharepic.png">Download Sharepic</a>
    </div>
  );
};

SharepicDisplay.propTypes = {
  image: PropTypes.string.isRequired,
};