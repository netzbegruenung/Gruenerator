import { Component, type ErrorInfo, type ReactNode } from 'react';

interface FeatureErrorBoundaryProps {
  children: ReactNode;
  featureName: string;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface FeatureErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class FeatureErrorBoundary extends Component<
  FeatureErrorBoundaryProps,
  FeatureErrorBoundaryState
> {
  constructor(props: FeatureErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): FeatureErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(
      `FeatureErrorBoundary (${this.props.featureName}) caught error:`,
      error,
      errorInfo
    );

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            padding: '2rem',
            margin: '1rem',
            backgroundColor: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: '8px',
            textAlign: 'center',
          }}
        >
          <h3
            style={{
              fontSize: '1.125rem',
              marginBottom: '0.5rem',
              color: '#856404',
            }}
          >
            Fehler in {this.props.featureName}
          </h3>
          <p
            style={{
              marginBottom: '1rem',
              color: '#856404',
            }}
          >
            Dieser Bereich konnte nicht geladen werden.
          </p>
          {this.state.error && import.meta.env.DEV && (
            <details
              style={{
                marginBottom: '1rem',
                textAlign: 'left',
                padding: '0.75rem',
                backgroundColor: '#fff',
                borderRadius: '4px',
                fontSize: '0.875rem',
              }}
            >
              <summary style={{ cursor: 'pointer', marginBottom: '0.5rem' }}>Fehlerdetails</summary>
              <pre
                style={{
                  overflow: 'auto',
                  fontSize: '0.75rem',
                  color: '#c7254e',
                }}
              >
                {this.state.error.toString()}
              </pre>
            </details>
          )}
          <button
            onClick={this.handleRetry}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#ffc107',
              color: '#856404',
              border: 'none',
              borderRadius: '4px',
              fontSize: '0.875rem',
              cursor: 'pointer',
              fontWeight: '500',
            }}
          >
            Erneut versuchen
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
