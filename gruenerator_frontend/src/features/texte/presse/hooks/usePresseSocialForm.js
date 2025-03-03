import { useState, useCallback } from 'react';

const usePresseSocialForm = (initialContent = { thema: '', details: '' }) => {
  // Social Media States
  const [thema, setThema] = useState(initialContent.thema);
  const [details, setDetails] = useState(initialContent.details);
  const [platforms, setPlatforms] = useState({
    facebook: false,
    instagram: false,
    twitter: false,
    linkedin: false,
    actionIdeas: false,
    reelScript: false,
    pressemitteilung: false
  });

  // Pressemitteilung States
  const [zitatgeber, setZitatgeber] = useState('');
  const [pressekontakt, setPressekontakt] = useState('');

  const handlePlatformChange = useCallback((platform) => {
    setPlatforms(prev => ({ ...prev, [platform]: !prev[platform] }));
  }, []);

  const getFormData = useCallback(() => {
    const selectedPlatforms = Object.keys(platforms).filter(key => platforms[key]);
    const formData = {
      thema,
      details,
      platforms: selectedPlatforms
    };

    // Wenn Pressemitteilung ausgewählt ist, füge die entsprechenden Daten hinzu
    if (platforms.pressemitteilung) {
      formData.was = thema;
      formData.wie = details;
      formData.zitatgeber = zitatgeber;
      formData.pressekontakt = pressekontakt;
    }

    return formData;
  }, [thema, details, platforms, zitatgeber, pressekontakt]);

  return {
    // Social Media
    thema,
    setThema,
    details,
    setDetails,
    platforms,
    setPlatforms,
    handlePlatformChange,

    // Pressemitteilung
    zitatgeber,
    setZitatgeber,
    pressekontakt,
    setPressekontakt,

    // Helper
    getFormData
  };
};

export default usePresseSocialForm; 