/**
 * Logger-Utility für bessere Console-Logs
 * 
 * Verwendung:
 * import logger from '../../../utils/logger';
 * 
 * logger.info('KomponentenName', 'Nachricht');
 * logger.debug('KomponentenName', 'Nachricht mit Daten', daten);
 */

// Log-Level
const LOG_LEVEL = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4
};

// Aktuelles Log-Level (kann je nach Bedarf angepasst werden)
// Im Produktionsmodus standardmäßig nur Warnungen und Fehler anzeigen
let currentLogLevel = process.env.NODE_ENV === 'production' ? LOG_LEVEL.WARN : LOG_LEVEL.INFO;

// Maximale Länge für Objekte/Arrays/Strings in den Logs
const MAX_LENGTH = {
  STRING: 100,
  OBJECT: 150
};

// Farben für verschiedene Log-Typen
const COLORS = {
  DEBUG: 'color: gray',
  INFO: 'color: #0066cc',
  WARN: 'color: #cc9900',
  ERROR: 'color: #cc0000',
  COMPONENT: 'color: #009900; font-weight: bold'
};

/**
 * Kürzt lange Strings oder Objekte für die Ausgabe
 * @param {*} data - Zu kürzende Daten
 * @returns {*} - Gekürzte Daten
 */
const truncate = (data) => {
  if (data === null || data === undefined) return data;
  
  if (typeof data === 'string') {
    if (data.length > MAX_LENGTH.STRING) {
      return `${data.substring(0, MAX_LENGTH.STRING)}... (${data.length} Zeichen)`;
    }
    return data;
  }
  
  if (typeof data === 'object') {
    try {
      const json = JSON.stringify(data);
      if (json.length > MAX_LENGTH.OBJECT) {
        // Bei Objekten mit vielen Eigenschaften nur die wichtigsten anzeigen
        if (Array.isArray(data)) {
          return `Array mit ${data.length} Elementen`;
        }
        
        // Bei Objekten mit content-Eigenschaft diese kürzen
        if (data.content && typeof data.content === 'string') {
          const contentSummary = data.content.length > 50 
            ? `${data.content.substring(0, 50)}... (${data.content.length} Zeichen)` 
            : data.content;
          
          return {
            ...data,
            content: contentSummary
          };
        }
        
        // Allgemeiner Fall: Objekt kürzen
        return `Objekt mit ${Object.keys(data).length} Eigenschaften`;
      }
      return data;
    } catch (e) {
      return '[Nicht serialisierbares Objekt]';
    }
  }
  
  return data;
};

/**
 * Formatiert Komponenten-Namen für einheitliche Logs
 * @param {string} component - Name der Komponente
 * @returns {string} - Formatierter Name
 */
const formatComponent = (component) => {
  return `[${component}]`;
};

/**
 * Erstellt eine formatierte Log-Nachricht
 * @param {string} component - Komponenten-Name
 * @param {string} message - Log-Nachricht
 * @returns {string} - Formatierte Nachricht
 */
const formatMessage = (component, message) => {
  return `%c${formatComponent(component)}%c ${message}`;
};

const logger = {
  /**
   * Setzt das aktuelle Log-Level
   * @param {number} level - Neues Log-Level
   */
  setLogLevel: (level) => {
    currentLogLevel = level;
    console.info(`Log-Level gesetzt auf: ${Object.keys(LOG_LEVEL).find(key => LOG_LEVEL[key] === level) || level}`);
  },
  
  /**
   * Gibt das aktuelle Log-Level zurück
   * @returns {number} - Aktuelles Log-Level
   */
  getLogLevel: () => currentLogLevel,
  
  /**
   * Debug-Log (nur für detaillierte Entwicklungsinformationen)
   * @param {string} component - Komponenten-Name
   * @param {string} message - Log-Nachricht
   * @param {*} data - Optionale Daten
   */
  debug: (component, message, data) => {
    if (currentLogLevel <= LOG_LEVEL.DEBUG) {
      if (data !== undefined) {
        console.debug(
          formatMessage(component, message), 
          COLORS.COMPONENT, 
          COLORS.DEBUG, 
          truncate(data)
        );
      } else {
        console.debug(
          formatMessage(component, message), 
          COLORS.COMPONENT, 
          COLORS.DEBUG
        );
      }
    }
  },
  
  /**
   * Info-Log (für allgemeine Informationen)
   * @param {string} component - Komponenten-Name
   * @param {string} message - Log-Nachricht
   * @param {*} data - Optionale Daten
   */
  info: (component, message, data) => {
    if (currentLogLevel <= LOG_LEVEL.INFO) {
      if (data !== undefined) {
        console.info(
          formatMessage(component, message), 
          COLORS.COMPONENT, 
          COLORS.INFO, 
          truncate(data)
        );
      } else {
        console.info(
          formatMessage(component, message), 
          COLORS.COMPONENT, 
          COLORS.INFO
        );
      }
    }
  },
  
  /**
   * Warn-Log (für Warnungen)
   * @param {string} component - Komponenten-Name
   * @param {string} message - Log-Nachricht
   * @param {*} data - Optionale Daten
   */
  warn: (component, message, data) => {
    if (currentLogLevel <= LOG_LEVEL.WARN) {
      if (data !== undefined) {
        console.warn(
          formatMessage(component, message), 
          COLORS.COMPONENT, 
          COLORS.WARN, 
          truncate(data)
        );
      } else {
        console.warn(
          formatMessage(component, message), 
          COLORS.COMPONENT, 
          COLORS.WARN
        );
      }
    }
  },
  
  /**
   * Error-Log (für Fehler)
   * @param {string} component - Komponenten-Name
   * @param {string} message - Log-Nachricht
   * @param {*} data - Optionale Daten
   */
  error: (component, message, data) => {
    if (currentLogLevel <= LOG_LEVEL.ERROR) {
      if (data !== undefined) {
        console.error(
          formatMessage(component, message), 
          COLORS.COMPONENT, 
          COLORS.ERROR, 
          data instanceof Error ? data : truncate(data)
        );
      } else {
        console.error(
          formatMessage(component, message), 
          COLORS.COMPONENT, 
          COLORS.ERROR
        );
      }
    }
  },
  
  /**
   * Gruppierte Logs für zusammengehörige Informationen
   * @param {string} component - Komponenten-Name
   * @param {string} title - Titel der Gruppe
   * @param {Function} logFunction - Funktion mit den Logs innerhalb der Gruppe
   */
  group: (component, title, logFunction) => {
    if (currentLogLevel <= LOG_LEVEL.INFO) {
      console.groupCollapsed(`%c${formatComponent(component)}%c ${title}`, COLORS.COMPONENT, COLORS.INFO);
      logFunction();
      console.groupEnd();
    }
  }
};

// Exportiere die Logger-Instanz und die Log-Level
export default logger;
export { LOG_LEVEL }; 