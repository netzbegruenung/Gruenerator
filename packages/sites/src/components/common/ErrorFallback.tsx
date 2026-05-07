interface ErrorFallbackProps {
  error?: Error;
  resetError?: () => void;
  title?: string;
  message?: string;
}

export function ErrorFallback({
  error,
  resetError,
  title = 'Etwas ist schiefgelaufen',
  message = 'Die Anwendung ist auf einen unerwarteten Fehler gestoßen.',
}: ErrorFallbackProps) {
  const handleReset = () => {
    if (resetError) {
      resetError();
    } else {
      window.location.reload();
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '2rem',
        textAlign: 'center',
        backgroundColor: 'var(--background-color, #f5f5f5)',
      }}
    >
      <div
        style={{
          maxWidth: '500px',
          padding: '2rem',
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            margin: '0 auto 1.5rem',
            backgroundColor: '#fee',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2rem',
          }}
        >
          ⚠️
        </div>

        <h1
          style={{
            fontSize: '1.5rem',
            marginBottom: '1rem',
            color: 'var(--font-color, #333)',
          }}
        >
          {title}
        </h1>

        <p
          style={{
            marginBottom: '1.5rem',
            color: 'var(--font-color-secondary, #666)',
            lineHeight: '1.6',
          }}
        >
          {message}
        </p>

        {error && import.meta.env.DEV && (
          <details
            style={{
              marginBottom: '1.5rem',
              textAlign: 'left',
              padding: '1rem',
              backgroundColor: '#f5f5f5',
              borderRadius: '4px',
              fontSize: '0.875rem',
            }}
          >
            <summary
              style={{
                cursor: 'pointer',
                marginBottom: '0.5rem',
                fontWeight: '500',
              }}
            >
              Fehlerdetails (nur in Entwicklung sichtbar)
            </summary>
            <pre
              style={{
                overflow: 'auto',
                fontSize: '0.75rem',
                color: '#c7254e',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {error.toString()}
              {error.stack && `\n\n${error.stack}`}
            </pre>
          </details>
        )}

        <button
          onClick={handleReset}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: 'var(--tanne, #005437)',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '1rem',
            cursor: 'pointer',
            fontWeight: '500',
            transition: 'opacity 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '0.9';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '1';
          }}
        >
          {resetError ? 'Erneut versuchen' : 'Seite neu laden'}
        </button>
      </div>
    </div>
  );
}
