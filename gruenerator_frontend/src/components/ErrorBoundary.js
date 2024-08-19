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

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h1>Oops, etwas ist schiefgelaufen.</h1>
          <p>Wir entschuldigen uns für die Unannehmlichkeiten. Bitte versuchen Sie, die Seite neu zu laden.</p>
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