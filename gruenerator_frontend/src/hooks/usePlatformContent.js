import { useState, useCallback, useContext } from 'react';
import { FormContext } from '../components/utils/FormContext';

const usePlatformContent = () => {
  const [activePlatform, setActivePlatform] = useState(null);
  const [platformContents, setPlatformContents] = useState({});
  const { updateValue, value } = useContext(FormContext);

  // Initialisiere oder aktualisiere Platform-Contents
  const updatePlatformContents = useCallback((contents) => {
    setPlatformContents(contents);
    // Wenn eine Plattform aktiv ist, aktualisiere den Editor-Content
    if (activePlatform && contents[activePlatform]) {
      updateValue(contents[activePlatform]);
    }
  }, [activePlatform, updateValue]);

  // Plattform bearbeiten
  const handleEditPlatform = useCallback((platform) => {
    if (activePlatform === platform) {
      setActivePlatform(null);
      updateValue('');
    } else {
      setActivePlatform(platform);
      if (platformContents[platform]) {
        updateValue(platformContents[platform]);
      }
    }
  }, [activePlatform, platformContents, updateValue]);

  // Content für aktive Plattform speichern
  const handleSavePlatformContent = useCallback(() => {
    if (activePlatform && value) {
      setPlatformContents(prev => ({
        ...prev,
        [activePlatform]: value
      }));
      setActivePlatform(null);
      updateValue('');
    }
  }, [activePlatform, value, updateValue]);

  // Prüfen ob eine bestimmte Plattform bearbeitet wird
  const isEditingPlatform = useCallback((platform) => {
    return activePlatform === platform;
  }, [activePlatform]);

  // Hole Content für eine bestimmte Plattform
  const getPlatformContent = useCallback((platform) => {
    return platformContents[platform] || '';
  }, [platformContents]);

  return {
    activePlatform,
    platformContents,
    updatePlatformContents,
    handleEditPlatform,
    handleSavePlatformContent,
    isEditingPlatform,
    getPlatformContent
  };
};

export default usePlatformContent; 