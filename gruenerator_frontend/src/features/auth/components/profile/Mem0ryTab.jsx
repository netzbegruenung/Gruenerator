import React, { useState, useEffect } from 'react';
import { motion } from "motion/react";
import { HiRefresh, HiInformationCircle, HiTrash, HiChip } from 'react-icons/hi';
import FeatureToggle from '../../../../components/common/FeatureToggle';
import HelpTooltip from '../../../../components/common/HelpTooltip';
import { useOptimizedAuth } from '../../../../hooks/useAuth';
import { useAuthStore } from '../../../../stores/authStore';

// Auth Backend URL aus Environment Variable oder Fallback zu aktuellem Host
const AUTH_BASE_URL = import.meta.env.VITE_AUTH_BASE_URL || '';

const Mem0ryTab = ({ onSuccessMessage, onErrorMessage, isActive }) => {
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [addingMemory, setAddingMemory] = useState(false);
  const [newMemoryText, setNewMemoryText] = useState('');
  const [newMemoryTopic, setNewMemoryTopic] = useState('');
  const [currentView, setCurrentView] = useState('overview');
  // Get authenticated user and memory preferences
  const { user, isAuthenticated, loading: authLoading } = useOptimizedAuth();
  const { memoryEnabled, setMemoryEnabled } = useAuthStore();

  // Fetch memories when tab becomes active and user is authenticated
  useEffect(() => {
    if (isActive && isAuthenticated && user?.id && !authLoading && memoryEnabled) {
      fetchMemories();
    }
  }, [isActive, isAuthenticated, user?.id, authLoading, memoryEnabled]);

  const fetchMemories = async () => {
    if (!user?.id) {
      onErrorMessage('Benutzer nicht authentifiziert');
      return;
    }

    if (!memoryEnabled) {
      console.log('[Mem0ryTab] Memory disabled, skipping fetch');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      console.log('[Mem0ryTab] Fetching memories for user:', user.id);
      const response = await fetch(`${AUTH_BASE_URL}/api/mem0/user/${user.id}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('[Mem0ryTab] API Response:', data);
      setMemories(data.memories || []);
      
      if (!data.memories || data.memories.length === 0) {
        console.log('[Mem0ryTab] No memories found for user');
      }
    } catch (err) {
      console.error('[Mem0ryTab] Error fetching memories:', err);
      const errorMessage = err.message || 'Unbekannter Fehler';
      setError(errorMessage);
      onErrorMessage('Fehler beim Laden der Memories: ' + errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const refreshMemories = () => {
    fetchMemories();
  };

  const addMemory = async () => {
    if (!newMemoryText.trim()) {
      onErrorMessage('Bitte gib einen Text ein');
      return;
    }

    setAddingMemory(true);
    try {
      const response = await fetch(`${AUTH_BASE_URL}/api/mem0/add-text`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: newMemoryText.trim(),
          topic: newMemoryTopic.trim() || 'general'
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        onSuccessMessage('Memory erfolgreich hinzugefügt');
        setNewMemoryText('');
        setNewMemoryTopic('');
        // Refresh memories list
        fetchMemories();
      } else {
        onErrorMessage('Fehler beim Hinzufügen der Memory');
      }
    } catch (err) {
      console.error('[Mem0ryTab] Error adding memory:', err);
      const errorMessage = err.message || 'Unbekannter Fehler';
      onErrorMessage('Fehler beim Hinzufügen der Memory: ' + errorMessage);
    } finally {
      setAddingMemory(false);
    }
  };

  const handleTabClick = (view) => {
    setCurrentView(view);
  };

  const handleMemoryToggle = async () => {
    const newState = !memoryEnabled;
    
    try {
      await setMemoryEnabled(newState);
      
      // If memory is being disabled and user is on add tab, switch to overview
      if (!newState && currentView === 'add') {
        setCurrentView('overview');
      }
      
      if (newState) {
        onSuccessMessage('Memory-Personalisierung aktiviert');
      } else {
        onSuccessMessage('Memory-Personalisierung deaktiviert');
      }
    } catch (error) {
      console.error('[Mem0ryTab] Failed to update memory settings:', error);
      onErrorMessage('Fehler beim Speichern der Memory-Einstellungen: ' + error.message);
    }
  };

  const deleteMemory = async (memoryId) => {
    try {
      const response = await fetch(`${AUTH_BASE_URL}/api/mem0/${memoryId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        onSuccessMessage('Memory erfolgreich gelöscht');
        // Remove from local state
        setMemories(prev => prev.filter(m => m.id !== memoryId));
      } else {
        onErrorMessage('Fehler beim Löschen der Memory');
      }
    } catch (err) {
      console.error('[Mem0ryTab] Error deleting memory:', err);
      onErrorMessage('Fehler beim Löschen der Memory: ' + err.message);
    }
  };

  const deleteAllMemories = async () => {
    if (!window.confirm(`Wirklich alle ${memories.length} Memories löschen?\n\nDiese Aktion kann nicht rückgängig gemacht werden und alle deine gespeicherten persönlichen Informationen gehen verloren.`)) {
      return;
    }

    try {
      // Delete each memory individually since there's no bulk delete endpoint
      const deletePromises = memories.map(memory => 
        fetch(`${AUTH_BASE_URL}/api/mem0/${memory.id}`, {
          method: 'DELETE',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        })
      );

      await Promise.all(deletePromises);
      
      onSuccessMessage('Alle Memories erfolgreich gelöscht');
      setMemories([]);
    } catch (err) {
      console.error('[Mem0ryTab] Error deleting all memories:', err);
      onErrorMessage('Fehler beim Löschen aller Memories: ' + err.message);
    }
  };

  const renderNavigationPanel = () => (
    <div className="groups-vertical-navigation">
      <button
        className={`groups-vertical-tab ${currentView === 'overview' ? 'active' : ''}`}
        onClick={() => handleTabClick('overview')}
      >
        Memory Verwaltung
      </button>
      {memoryEnabled && (
        <button
          className={`groups-vertical-tab ${currentView === 'add' ? 'active' : ''}`}
          onClick={() => handleTabClick('add')}
        >
          Memory hinzufügen
        </button>
      )}
    </div>
  );


  return (
    <motion.div 
      className="profile-content groups-management-layout"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="groups-navigation-panel">
        {renderNavigationPanel()}
      </div>
      <div className="groups-content-panel profile-form-section">
        <div className="group-content-card">
          <div className="auth-form">

            {error && (
              <div className="auth-error-message">
                <HiInformationCircle />
                Fehler: {error}
              </div>
            )}

            {currentView === 'overview' && (
              <>
                <div className="form-group">
                  <div className="header-with-help">
                    <div className="form-group-title">
                      Memory-Einstellungen
                    </div>
                    <HelpTooltip>
                      <p>
                        Hier kannst du persönliche Informationen speichern, die das KI-System über dich wissen soll.
                      </p>
                      <p>
                        <strong>Tipp:</strong> Füge Informationen über deine Vorlieben, deinen Arbeitsbereich oder andere wichtige Details hinzu.
                      </p>
                    </HelpTooltip>
                  </div>
                  <p className="form-group-description">
                    Aktiviere die Memory-Personalisierung, um dass das KI-System deine gespeicherten Informationen beim Generieren von Inhalten berücksichtigt.
                  </p>
                  
                  <FeatureToggle
                    isActive={memoryEnabled}
                    onToggle={handleMemoryToggle}
                    label="Memory-Personalisierung"
                    icon={HiChip}
                    description={memoryEnabled 
                      ? 'Das System nutzt deine gespeicherten Memories für personalisierte Inhalte.'
                      : 'Das System verwendet keine Memories. Inhalte werden ohne Personalisierung generiert.'
                    }
                  />
                </div>

                {memoryEnabled && (
                  <div className="form-group">
                    <div className="form-group-title-container">
                      <div className="form-group-title">
                        {memories.length > 0 ? `Gespeicherte Memories (${memories.length})` : 'Meine Memories'}
                      </div>
                      <button 
                        onClick={refreshMemories} 
                        className="add-knowledge-button"
                        disabled={loading}
                        title="Memories aktualisieren"
                      >
                        <HiRefresh />
                      </button>
                    </div>
                    
                    {memories.length === 0 ? (
                      <div className="knowledge-empty-state">
                        <HiInformationCircle size={48} className="empty-state-icon" />
                        <p>Keine Memories gefunden</p>
                        <p className="empty-state-description">
                          Du hast noch keine Memories gespeichert.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="memories-list">
                          {memories.map((memory, index) => (
                            <div key={memory.id || index} className="knowledge-entry knowledge-entry-bordered">
                              <div className="form-field-wrapper">
                                <div className="memory-content">
                                  <div className="memory-header">
                                    <p className="memory-text">
                                      {memory.memory || memory.text || JSON.stringify(memory)}
                                    </p>
                                    <button
                                      onClick={() => deleteMemory(memory.id)}
                                      className="delete-memory-button"
                                      title="Memory löschen"
                                    >
                                      <HiTrash />
                                    </button>
                                  </div>
                                  {memory.metadata && (
                                    <div className="memory-metadata">
                                      {memory.metadata.topic && (
                                        <span className="metadata-badge">
                                          {memory.metadata.topic}
                                        </span>
                                      )}
                                      {memory.created_at && (
                                        <span className="memory-timestamp">Erstellt: {new Date(memory.created_at).toLocaleString('de-DE')}</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        <div className="delete-all-container">
                          <button 
                            onClick={deleteAllMemories} 
                            className="delete-all-link"
                          >
                            Alle Memories löschen
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            {currentView === 'add' && memoryEnabled && (
              <div className="form-group">
                <div className="form-group-title">
                  Neue Memory hinzufügen
                </div>
                <p className="form-group-description">
                  Füge hier Informationen über dich hinzu, die das System sich merken soll.
                </p>
                
                <div className="form-field-wrapper">
                  <label className="form-label">
                    Memory Text *
                  </label>
                  <textarea
                    className="form-textarea"
                    value={newMemoryText}
                    onChange={(e) => setNewMemoryText(e.target.value)}
                    placeholder="Gib hier Informationen über dich ein, die das System sich merken soll..."
                    rows={4}
                    disabled={addingMemory}
                  />
                </div>
                <div className="form-field-wrapper">
                  <label className="form-label">
                    Thema (optional)
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={newMemoryTopic}
                    onChange={(e) => setNewMemoryTopic(e.target.value)}
                    placeholder="z.B. Persönliche Vorlieben, Arbeitsbereich, etc."
                    disabled={addingMemory}
                  />
                </div>
                <div className="profile-actions profile-actions-container">
                  <button 
                    onClick={addMemory}
                    className="submit-button"
                    disabled={addingMemory || !newMemoryText.trim()}
                  >
                    <div className="submit-button__content-wrapper">
                      <div className="submit-button__content">
                        {addingMemory ? 'Wird hinzugefügt...' : 'Memory hinzufügen'}
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default Mem0ryTab; 