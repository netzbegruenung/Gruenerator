import React from 'react';
import PropTypes from 'prop-types';
import '../assets/styles/components/error-boundary.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, copied: false, isChunkError: false };
  }

  static getDerivedStateFromError(error) {
    const isChunkError = ErrorBoundary.isChunkLoadError(error);
    return { hasError: true, error, isChunkError };
  }

  static isChunkLoadError(error) {
    return (
      error?.message?.includes('Failed to fetch dynamically imported module') ||
      error?.message?.includes('Loading chunk') ||
      error?.message?.includes('Loading CSS chunk') ||
      error?.name === 'ChunkLoadError'
    );
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });

    // Handle chunk load errors with auto-reload
    if (ErrorBoundary.isChunkLoadError(error)) {
      const hasReloaded = sessionStorage.getItem('chunk-reload-attempted');
      if (!hasReloaded) {
        sessionStorage.setItem('chunk-reload-attempted', 'true');
        window.location.reload();
        return;
      }
      // Clear the flag so future chunk errors can trigger reload
      sessionStorage.removeItem('chunk-reload-attempted');
    }

    this.logErrorToService(error, errorInfo);
  }

  logErrorToService(error, errorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    // Hier könnte ein Aufruf zu einem Fehlerprotokollierungsdienst erfolgen
  }

  copyErrorText = () => {
    const { error, errorInfo } = this.state;
    const errorMessage = this.getErrorMessage();
    
    let errorText = `Fehler: ${errorMessage.title}\n`;
    errorText += `Nachricht: ${errorMessage.message}\n`;
    
    if (errorMessage.errorId) {
      errorText += `Fehler-ID: ${errorMessage.errorId}\n`;
    }
    
    if (errorMessage.timestamp) {
      errorText += `Zeitstempel: ${new Date(errorMessage.timestamp).toLocaleString()}\n`;
    }
    
    if (errorMessage.errorCode) {
      errorText += `Fehlercode: ${errorMessage.errorCode}\n`;
    }
    
    if (errorMessage.errorType) {
      errorText += `Fehlertyp: ${errorMessage.errorType}\n`;
    }
    
    if (errorMessage.details) {
      errorText += `Details: ${errorMessage.details}\n`;
    }
    
    if (errorInfo) {
      errorText += `\nComponent Stack:\n${errorInfo.componentStack}`;
    }
    
    navigator.clipboard.writeText(errorText).then(() => {
      this.setState({ copied: true });
      setTimeout(() => {
        this.setState({ copied: false });
      }, 2000);
    }).catch(err => {
      console.error('Fehler beim Kopieren:', err);
    });
  };

  getErrorMessage() {
    const { error, isChunkError } = this.state;

    // Check for chunk load error first (after auto-reload failed)
    if (isChunkError) {
      return {
        title: 'Neue Version verfügbar',
        message: 'Eine neue Version der Anwendung wurde veröffentlicht. Bitte führen Sie einen harten Refresh durch: Strg+Shift+R (Windows/Linux) oder Cmd+Shift+R (Mac).',
        isChunkError: true
      };
    }

    // Verbesserte Fehlertyperkennung
    if (error?.name === 'ServerError') {
      return {
        title: 'Serverfehler',
        message: error.message || 'Ein unerwarteter Serverfehler ist aufgetreten.',
        details: error.originalError ? `Original: ${error.originalError.message}` : '',
        errorId: error.errorId,
        timestamp: error.timestamp,
        errorCode: error.originalError?.response?.data?.errorCode,
        errorType: error.originalError?.response?.data?.errorType
      };
    }
    
    // Prüfe auf "Something broke!" Fehler
    if (error?.message?.includes('Something broke!')) {
      return {
        title: 'Serverfehler',
        message: 'Ein kritischer Serverfehler ist aufgetreten. Bitte versuchen Sie es später erneut.',
        details: error.message
      };
    }
    
    // Standard-Fehlermeldung
    return {
      title: 'Oops, etwas ist schiefgelaufen.',
      message: 'Wir entschuldigen uns für die Unannehmlichkeiten. Bitte versuchen Sie, die Seite neu zu laden.',
      details: error?.message || 'Unbekannter Fehler'
    };
  }

  render() {
    if (this.state.hasError) {
      const errorMessage = this.getErrorMessage();
      
      return (
        <div className="error-boundary">
          <h1>{errorMessage.title}</h1>
          <p>{errorMessage.message}</p>
          
          {/* Zeige Fehler-ID und Zeitstempel an, wenn vorhanden */}
          {errorMessage.errorId && (
            <p className="error-id">
              Fehler-ID: {errorMessage.errorId}
              {errorMessage.timestamp && ` (${new Date(errorMessage.timestamp).toLocaleString()})`}
              {errorMessage.errorCode && ` | Code: ${errorMessage.errorCode}`}
              {errorMessage.errorType && ` | Typ: ${errorMessage.errorType}`}
            </p>
          )}
          
          {errorMessage.details && (
            <details>
              <summary>Technische Details</summary>
              <p>{errorMessage.details}</p>
              {this.state.errorInfo && (
                <pre>{this.state.errorInfo.componentStack}</pre>
              )}
            </details>
          )}
          
          <div className="error-actions">
            {this.props.fallback ? (
              this.props.fallback(this.state.error, this.state.errorInfo)
            ) : (
              <>
                <button onClick={() => window.location.reload()}>Seite neu laden</button>
                <a href="/" className="button">Zur Startseite</a>
                <button 
                  onClick={this.copyErrorText}
                  className={`copy-button ${this.state.copied ? 'copied' : ''}`}
                >
                  {this.state.copied ? 'Kopiert!' : 'Fehlertext kopieren'}
                </button>
              </>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
  fallback: PropTypes.func,
};

export default ErrorBoundary;