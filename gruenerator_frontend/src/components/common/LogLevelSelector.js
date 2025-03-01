import React, { useState, useEffect } from 'react';
import logger, { LOG_LEVEL } from '../../utils/logger';
import '../../assets/styles/components/LogLevelSelector.css';

/**
 * Komponente zum Ändern des Log-Levels zur Laufzeit
 * Wird nur im Entwicklungsmodus angezeigt
 */
const LogLevelSelector = () => {
  const [logLevel, setLogLevel] = useState(logger.getLogLevel());
  const [isVisible, setIsVisible] = useState(false);

  // Nur im Entwicklungsmodus anzeigen
  useEffect(() => {
    setIsVisible(process.env.NODE_ENV === 'development');
  }, []);

  const handleLogLevelChange = (level) => {
    logger.setLogLevel(level);
    setLogLevel(level);
  };

  if (!isVisible) return null;

  return (
    <div className="log-level-selector">
      <div className="log-level-selector-toggle" onClick={() => setIsVisible(!isVisible)}>
        🔍 Log
      </div>
      <div className="log-level-selector-content">
        <h4>Log-Level</h4>
        <div className="log-level-options">
          {Object.entries(LOG_LEVEL).map(([name, level]) => (
            <button
              key={name}
              className={`log-level-button ${logLevel === level ? 'active' : ''}`}
              onClick={() => handleLogLevelChange(level)}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LogLevelSelector; 