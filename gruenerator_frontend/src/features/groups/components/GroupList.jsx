import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Spinner from '../../../components/common/Spinner';
import useGroups from '../hooks/useGroups';

const GroupList = ({ onSelectGroup, onCreateNew }) => {
  const {
    userGroups,
    isLoadingGroups,
    isErrorGroups,
    errorGroups
  } = useGroups();

  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [joinToken, setJoinToken] = useState('');

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  return (
    <div className="groups-list-container">
      <div className="groups-list-header">
        <h2>Meine Gruppen</h2>
        <div className="groups-actions">
          <button
            onClick={onCreateNew}
            className="button primary"
            type="button"
          >
            Neue Gruppe erstellen
          </button>
          <button
            onClick={() => setJoinDialogOpen(true)}
            className="button secondary"
            type="button"
          >
            Gruppe beitreten
          </button>
        </div>
      </div>

      {isLoadingGroups && (
        <div className="loading-container">
          <Spinner size="medium" />
        </div>
      )}

      {isErrorGroups && (
        <div className="error-message">
          Fehler beim Laden der Gruppen: {errorGroups.message}
        </div>
      )}

      {!isLoadingGroups && !isErrorGroups && (
        <>
          {(!userGroups || userGroups.length === 0) ? (
            <div className="no-groups-message">
              <p>Du bist noch kein Mitglied einer Gruppe.</p>
              <p>Erstelle eine neue Gruppe oder tritt einer bestehenden Gruppe bei.</p>
            </div>
          ) : (
            <ul className="groups-list">
              {userGroups.map(group => (
                <li key={group.id} className="group-item">
                  <button
                    className="group-item-button"
                    onClick={() => onSelectGroup(group.id)}
                    type="button"
                  >
                    <div className="group-item-content">
                      <div className="group-name">{group.name}</div>
                      <div className="group-meta">
                        <span className="group-role">{group.isAdmin ? 'Admin' : 'Mitglied'}</span>
                        <span className="group-created">Erstellt am: {formatDate(group.created_at)}</span>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {joinDialogOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Gruppe beitreten</h3>
              <button className="close-button" onClick={() => setJoinDialogOpen(false)} type="button">×</button>
            </div>
            <div className="modal-body">
              <p>Gib den Einladungslink oder den Beitrittscode ein, um einer Gruppe beizutreten.</p>
              <div className="form-field-wrapper">
                <label htmlFor="joinToken">Einladungslink oder Token:</label>
                <input
                  id="joinToken"
                  type="text"
                  className="form-input"
                  value={joinToken}
                  onChange={(e) => setJoinToken(e.target.value)}
                  placeholder="z.B. /join-group/abc123 oder abc123"
                />
              </div>
              <p className="help-text">
                Der Link oder Code wurde dir vom Gruppenadmin mitgeteilt.
              </p>
            </div>
            <div className="modal-footer">
              <button
                className="button secondary"
                onClick={() => {
                  setJoinDialogOpen(false);
                  setJoinToken('');
                }}
                type="button"
              >
                Abbrechen
              </button>
              <Link
                to={`/join-group/${joinToken.includes('/') ? joinToken.split('/').pop() : joinToken}`}
                className="button primary"
                onClick={() => setJoinDialogOpen(false)}
              >
                Beitreten
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupList; 