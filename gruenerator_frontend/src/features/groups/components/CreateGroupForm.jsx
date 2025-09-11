import React, { useState } from 'react';
import TextInput from '../../../components/common/Form/Input/TextInput';
import Spinner from '../../../components/common/Spinner';
import { useGroups } from '../hooks/useGroups';

const CreateGroupForm = ({ onCancel, onSuccess }) => {
  const [groupName, setGroupName] = useState('');
  const [nameError, setNameError] = useState('');
  
  const {
    createGroup,
    isCreatingGroup,
    isCreateGroupError,
    createGroupError,
    isCreateGroupSuccess
  } = useGroups();

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validation
    setNameError('');
    if (!groupName.trim()) {
      setNameError('Bitte gib einen Namen für die Gruppe ein.');
      return;
    }
    
    // Create group
    createGroup(groupName, {
      onSuccess: (groupId) => {
        if (onSuccess) onSuccess(groupId);
      }
    });
  };

  return (
    <div className="create-group-container">
      <div className="create-group-header">
        <h2>Neue Gruppe erstellen</h2>
        <p>
          Erstelle eine neue Gruppe, um Anweisungen und Wissen mit anderen zu teilen.
          Als Ersteller wirst du automatisch als Admin hinzugefügt.
        </p>
      </div>
      
      <form onSubmit={handleSubmit} className="create-group-form">
        <div className="form-field-wrapper">
          <label htmlFor="groupName">Gruppenname:</label>
          <TextInput
            id="groupName"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="z.B. OV Musterdorf, Bundestagsbüro Mustermann"
            aria-required="true"
            required
            disabled={isCreatingGroup}
          />
          {nameError && <p className="error-text">{nameError}</p>}
        </div>

        {isCreateGroupError && (
          <div className="error-message">
            Fehler beim Erstellen der Gruppe: {createGroupError.message}
          </div>
        )}
        
        <div className="form-actions">
          <button
            type="button"
            className="button secondary"
            onClick={onCancel}
            disabled={isCreatingGroup}
          >
            Abbrechen
          </button>
          <button
            type="submit"
            className="button primary"
            disabled={isCreatingGroup}
          >
            {isCreatingGroup ? <Spinner size="small" /> : 'Gruppe erstellen'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateGroupForm; 