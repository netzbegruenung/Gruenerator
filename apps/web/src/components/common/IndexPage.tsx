import type { ReactNode } from 'react';
import '../../assets/styles/components/gallery-layout.css';

interface IndexPageProps {
  title?: string;
  description?: ReactNode;
  headerContent?: ReactNode;
  children?: ReactNode;
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  className?: string;
  [key: string]: any;
}

const IndexPage = ({
  title,
  description = null,
  headerContent = null,
  children,
  loading = false,
  error = null,
  emptyMessage = 'Keine Inhalte verfügbar.',
  className = '',
  ...props
}: IndexPageProps) => {
  return (
    <div className={`container with-header gallery-layout ${className}`} {...props}>
      <div className="gallery-header">
        {title && <h1>{title}</h1>}
        {description && <p className="gallery-description">{description}</p>}
        {headerContent && <div className="gallery-header-content">{headerContent}</div>}
      </div>

      <div className="gallery-content">
        {loading && (
          <div className="gallery-loading">
            <div className="spinner" />
            <p>Lädt...</p>
          </div>
        )}

        {error && (
          <div className="gallery-error">
            <p>Fehler: {error}</p>
          </div>
        )}

        {!loading && !error && !children && (
          <div className="gallery-empty">
            <p>{emptyMessage}</p>
          </div>
        )}

        {!loading && !error && children && (
          <div className="gallery-grid">
            {children}
          </div>
        )}
      </div>
    </div>
  );
};

export default IndexPage;
