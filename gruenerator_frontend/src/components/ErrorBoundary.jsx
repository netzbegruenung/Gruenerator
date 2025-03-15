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
        timestamp: error.timestamp
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
          
          {this.props.fallback ? (
            this.props.fallback(this.state.error, this.state.errorInfo)
          ) : (
            <button onClick={() => window.location.reload()}>Seite neu laden</button>
          )}
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