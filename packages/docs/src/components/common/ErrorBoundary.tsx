import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

import { isChunkLoadError } from '../../utils/chunkErrors';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  showHomeLink?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  isChunkError: boolean;
  componentStack: string | null;
}

const CHUNK_RELOAD_KEY = 'docs-chunk-reload-attempted';

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    isChunkError: false,
    componentStack: null,
  };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error, isChunkError: isChunkLoadError(error) };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error.message);
    this.setState({ componentStack: errorInfo.componentStack || null });

    if (isChunkLoadError(error)) {
      const hasReloaded = sessionStorage.getItem(CHUNK_RELOAD_KEY);
      if (!hasReloaded) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
        window.location.reload();
        return;
      }
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    }

    this.props.onError?.(error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, isChunkError: false });
  };

  override render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '200px',
          padding: '2rem',
          textAlign: 'center',
          gap: '1rem',
        }}
      >
        {this.state.isChunkError ? (
          <>
            <p style={{ fontSize: '1.1rem', margin: 0, fontWeight: 600 }}>Neue Version verfügbar</p>
            <p style={{ fontSize: '0.9rem', margin: 0, color: '#6b7280' }}>
              Die Anwendung wurde aktualisiert. Bitte lade die Seite neu, um die neueste Version zu
              verwenden.
            </p>
          </>
        ) : (
          <p style={{ fontSize: '1.1rem', margin: 0 }}>Ein unerwarteter Fehler ist aufgetreten.</p>
        )}
        {process.env.NODE_ENV === 'development' && this.state.error && (
          <pre
            style={{
              fontSize: '0.75rem',
              color: '#b91c1c',
              background: '#fef2f2',
              padding: '0.75rem',
              borderRadius: '6px',
              maxWidth: '80vw',
              maxHeight: '50vh',
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              textAlign: 'left',
            }}
          >
            {this.state.error.message}
            {this.state.componentStack && (
              <>
                {'\n\n--- Component Stack ---\n'}
                {this.state.componentStack}
              </>
            )}
          </pre>
        )}
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={this.handleReset}
            style={{
              padding: '0.5rem 1rem',
              cursor: 'pointer',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              background: '#fff',
            }}
          >
            Erneut versuchen
          </button>
          {this.props.showHomeLink ? (
            <a
              href="/"
              style={{
                padding: '0.5rem 1rem',
                cursor: 'pointer',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                background: '#fff',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              Zur Startseite
            </a>
          ) : (
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '0.5rem 1rem',
                cursor: 'pointer',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                background: '#fff',
              }}
            >
              Seite neu laden
            </button>
          )}
        </div>
      </div>
    );
  }
}
