import React from 'react';
import PropTypes from 'prop-types';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    this.logErrorToService(error, errorInfo);
  }

  logErrorToService(error, errorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    // Hier könnte ein Aufruf zu einem Fehlerprotokollierungsdienst erfolgen
  }

  getErrorMessage() {
    const { error } = this.state;
    
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

  // Versuche, den Fehler zu beheben
  handleTryFix = () => {
    // Lösche den Cache
    if (window.caches) {
      caches.keys().then(cacheNames => {
        cacheNames.forEach(cacheName => {
          caches.delete(cacheName);
        });
      });
    }
    
    // Lösche lokale Speicherdaten, die Probleme verursachen könnten
    localStorage.removeItem('termsAccepted');
    localStorage.removeItem('popupShown2024');
    
    // Seite neu laden
    window.location.reload(true); // true erzwingt ein Neuladen vom Server
  };

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
                <button onClick={this.handleTryFix}>Fehler beheben versuchen</button>
                <a href="/" className="button">Zur Startseite</a>
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