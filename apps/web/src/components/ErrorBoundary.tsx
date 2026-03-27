import * as Sentry from '@sentry/react';
import React, { type ReactNode, type ErrorInfo } from 'react';

import { cn } from '@/utils/cn';

// Extended Error interface for server errors with additional metadata
interface ServerError extends Error {
  originalError?: {
    message?: string;
    response?: {
      data?: {
        errorCode?: string;
        errorType?: string;
      };
    };
  };
  errorId?: string;
  timestamp?: number;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: ServerError | null, errorInfo: ErrorInfo | null) => ReactNode);
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: ServerError | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
  isChunkError: boolean;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
      isChunkError: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    const isChunkError = ErrorBoundary.isChunkLoadError(error);
    return { hasError: true, error, isChunkError };
  }

  static isChunkLoadError(error: Error | null): boolean {
    return (
      error?.message?.includes('Failed to fetch dynamically imported module') ||
      error?.message?.includes('error loading dynamically imported module') ||
      error?.message?.includes('Importing a module script failed') ||
      error?.message?.includes('Unable to preload CSS') ||
      error?.message?.includes('Loading chunk') ||
      error?.message?.includes('Loading CSS chunk') ||
      error?.name === 'ChunkLoadError'
    );
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
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

  logErrorToService(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    Sentry.captureException(error, {
      extra: { componentStack: errorInfo.componentStack },
    });
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

    navigator.clipboard
      .writeText(errorText)
      .then(() => {
        this.setState({ copied: true });
        setTimeout(() => {
          this.setState({ copied: false });
        }, 2000);
      })
      .catch((err) => {
        console.error('Fehler beim Kopieren:', err);
      });
  };

  getErrorMessage() {
    const { error, isChunkError } = this.state;

    // Check for chunk load error first (after auto-reload failed)
    if (isChunkError) {
      return {
        title: 'Neue Version verfügbar',
        message:
          'Eine neue Version der Anwendung wurde veröffentlicht. Bitte führen Sie einen harten Refresh durch: Strg+Shift+R (Windows/Linux) oder Cmd+Shift+R (Mac).',
        isChunkError: true,
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
        errorType: error.originalError?.response?.data?.errorType,
      };
    }

    // Prüfe auf "Something broke!" Fehler
    if (error?.message?.includes('Something broke!')) {
      return {
        title: 'Serverfehler',
        message:
          'Ein kritischer Serverfehler ist aufgetreten. Bitte versuchen Sie es später erneut.',
        details: error.message,
      };
    }

    // Standard-Fehlermeldung
    return {
      title: 'Oops, etwas ist schiefgelaufen.',
      message:
        'Wir entschuldigen uns für die Unannehmlichkeiten. Bitte versuchen Sie, die Seite neu zu laden.',
      details: error?.message || 'Unbekannter Fehler',
    };
  }

  render() {
    if (this.state.hasError) {
      const errorMessage = this.getErrorMessage();

      return (
        <div className="p-lg border border-grey-200 dark:border-grey-700 rounded-xs bg-background-alt mx-auto my-lg max-w-[800px] text-center font-sans text-foreground">
          <h1 className="text-foreground-heading text-[2em] mb-md">{errorMessage.title}</h1>
          <p className="mb-md leading-relaxed">{errorMessage.message}</p>

          {/* Zeige Fehler-ID und Zeitstempel an, wenn vorhanden */}
          {errorMessage.errorId && (
            <p className="text-[0.9em] text-foreground mb-md p-xs bg-background border border-dashed border-grey-300 dark:border-grey-600 inline-block">
              Fehler-ID: {errorMessage.errorId}
              {errorMessage.timestamp && ` (${new Date(errorMessage.timestamp).toLocaleString()})`}
              {errorMessage.errorCode && ` | Code: ${errorMessage.errorCode}`}
              {errorMessage.errorType && ` | Typ: ${errorMessage.errorType}`}
            </p>
          )}

          {errorMessage.details && (
            <details className="my-lg text-left bg-background p-md rounded-xs">
              <summary className="cursor-pointer font-bold mb-sm text-primary-600">
                Technische Details
              </summary>
              <p>{errorMessage.details}</p>
              {this.state.errorInfo && (
                <pre className="whitespace-pre-wrap break-words bg-background-alt p-md rounded-xs border border-grey-200 dark:border-grey-700 max-h-[200px] overflow-y-auto text-[0.85em] text-foreground">
                  {this.state.errorInfo.componentStack}
                </pre>
              )}
            </details>
          )}

          <div className="mt-lg flex gap-md justify-center flex-wrap">
            {this.props.fallback ? (
              typeof this.props.fallback === 'function' ? (
                this.props.fallback(this.state.error, this.state.errorInfo)
              ) : (
                this.props.fallback
              )
            ) : (
              <>
                <button
                  onClick={() => window.location.reload()}
                  className="bg-primary-600 text-white px-sm py-sm border-none rounded-xs cursor-pointer text-base no-underline transition-all duration-200 hover:bg-primary-700"
                >
                  Seite neu laden
                </button>
                <a
                  href="/"
                  className="bg-primary-600 text-white px-sm py-sm border-none rounded-xs cursor-pointer text-base no-underline transition-all duration-200 hover:bg-primary-700"
                >
                  Zur Startseite
                </a>
                <button
                  onClick={this.copyErrorText}
                  className={cn(
                    'inline-flex items-center justify-center gap-2 px-sm py-sm border-none rounded-xs cursor-pointer text-base no-underline transition-all duration-200',
                    this.state.copied
                      ? 'bg-primary-600 text-white hover:bg-primary-700'
                      : 'bg-secondary-600 text-white hover:bg-secondary-700'
                  )}
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

export default ErrorBoundary;
