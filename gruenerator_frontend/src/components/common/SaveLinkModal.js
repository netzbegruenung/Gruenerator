import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import '../../assets/styles/components/linksave.css';

const SaveLinkModal = ({ isOpen, onClose, onSave, savedLinks = [], onDelete, onLoad }) => {
  const [linkName, setLinkName] = useState('');
  const [generatedLink, setGeneratedLink] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (isOpen) {
      setGeneratedLink(generateUniqueLink(linkName));
    }
  }, [linkName, isOpen]);

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
      const result = await onSave(linkName, generatedLink);
      console.log('onSave Ergebnis:', result);
      if (result.success) {
        setSuccessMessage('Inhalt erfolgreich gespeichert!');
        setLinkName('');
        setTimeout(() => {
          setSuccessMessage('');
        }, 2000);
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      console.error('Fehler beim Speichern:', err);
      setErrorMessage('Fehler beim Speichern: ' + err.message);
    }
  };

  const handleLinkNameChange = (e) => {
    setLinkName(e.target.value);
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

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
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
          <button onClick={handleSave} className="save-button">
            Speichern
          </button>
          <button onClick={onClose} className="cancel-button">Abbrechen</button>
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
                  <button onClick={() => onLoad(link.link_name)}>Laden</button>
                  <button onClick={() => onDelete(link.link_name)}>Löschen</button>
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
};

export default SaveLinkModal;
