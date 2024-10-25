import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import '../../assets/styles/components/linksave.css';
import { supabase } from '../utils/supabaseClient';

const checkLinkExists = async (generatedLink) => {
  try {
    const { data, error } = await supabase
      .from('editor_contents')
      .select('id')
      .eq('generated_link', generatedLink)
      .single();

    if (error) throw error;

    return !!data; // Returns true if data exists, false otherwise
  } catch (err) {
    console.error('Fehler beim Überprüfen des Links:', err);
    return false; // Assume the link doesn't exist if there's an error
  }
};

const SaveLinkModal = ({ isOpen, onClose, onSave, savedLinks = [], onDelete, onLoad, existingLinkData }) => {
  const [linkName, setLinkName] = useState('');
  const [generatedLink, setGeneratedLink] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (existingLinkData) {
        setLinkName(existingLinkData.linkName);
        setGeneratedLink(existingLinkData.generatedLink);
      } else {
        const defaultLinkName = `antrag-${Math.random().toString(36).substring(2, 6)}`;
        setLinkName(defaultLinkName);
        const newGeneratedLink = generateUniqueLink(defaultLinkName);
        setGeneratedLink(newGeneratedLink);
      }
    }
  }, [isOpen, existingLinkData]);

  const generateUniqueLink = (baseName) => {
    const baseUrl = 'gruenerator-test.de/ae/';
    const sanitizedName = baseName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const randomSuffix = Math.random().toString(36).substring(2, 6);
    return `${baseUrl}${sanitizedName}-${randomSuffix}`;
  };

  const handleSave = async () => {
    console.log('handleSave aufgerufen', { linkName, generatedLink });
    if (!linkName.trim()) {
      setErrorMessage('Bitte geben Sie einen Link-Namen ein.');
      return;
    }

    try {
      if (!existingLinkData) {
        const linkExists = await checkLinkExists(generatedLink);
        if (linkExists) {
          setErrorMessage('Dieser Link existiert bereits. Bitte wählen Sie einen anderen Namen.');
          return;
        }
      }

      const result = await onSave(linkName, generatedLink);
      console.log('onSave Ergebnis:', result);
      if (result.success) {
        setSuccessMessage('Inhalt erfolgreich gespeichert!');
      } else {
        throw new Error(result.error || 'Unbekannter Fehler beim Speichern');
      }
    } catch (err) {
      console.error('Fehler beim Speichern:', err);
      setErrorMessage(`Fehler beim Speichern: ${err.message}`);
    }
  };

  const handleLinkNameChange = (e) => {
    const newLinkName = e.target.value;
    setLinkName(newLinkName);
    const newGeneratedLink = generateUniqueLink(newLinkName);
    setGeneratedLink(newGeneratedLink);
    setErrorMessage('');
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedLink).then(() => {
      setSuccessMessage('Link in die Zwischenablage kopiert!');
      setTimeout(() => setSuccessMessage(''), 2000);
    }, () => {
      setErrorMessage('Fehler beim Kopieren des Links');
    });
  };

  const handleLoad = (link) => {
    onLoad(link.link_name, link.generated_link);
  };

  const handleDelete = (link) => {
    onDelete(link.link_name, link.generated_link);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button onClick={onClose} className="close-button">&times;</button>
        <h2>Inhalt speichern</h2>
        <input
          type="text"
          value={linkName}
          onChange={handleLinkNameChange}
          placeholder="Geben Sie einen Namen für Ihren Link ein"
          className="link-name-input"
        />
        {generatedLink && (
          <div className="generated-link">
            <p>Generierter Link: {generatedLink}</p>
            <button onClick={copyToClipboard} className="copy-button">Kopieren</button>
          </div>
        )}
        <div className="button-container">
          <button onClick={handleSave} className="save-button">Speichern</button>
          <button onClick={onClose} className="cancel-button">Schließen</button>
        </div>
        {errorMessage && <p className="error-message">{errorMessage}</p>}
        {successMessage && <p className="success-message">{successMessage}</p>}
        
        {Array.isArray(savedLinks) && savedLinks.length > 0 && (
          <div className="saved-links">
            <h3>Gespeicherte Links:</h3>
            <ul>
              {savedLinks.map((link, index) => (
                <li key={index}>
                  {link.link_name} - {link.generated_link}
                  <button onClick={() => handleLoad(link)}>Laden</button>
                  <button onClick={() => handleDelete(link)}>Löschen</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

SaveLinkModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  savedLinks: PropTypes.array,
  onDelete: PropTypes.func.isRequired,
  onLoad: PropTypes.func.isRequired,
  existingLinkData: PropTypes.object,
};

export default SaveLinkModal;
