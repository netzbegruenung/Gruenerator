import { HiCheck, HiDownload } from 'react-icons/hi';

interface AssetPackage {
  id: string;
  name: string;
  description?: string;
  thumbnail?: string;
  assets?: unknown[];
}

interface AssetPackageCardProps {
  package: AssetPackage | null;
  isImported: boolean;
  isImporting: boolean;
  onImport: () => void;
}

const AssetPackageCard = ({
  package: pkg,
  isImported,
  isImporting,
  onImport,
}: AssetPackageCardProps) => {
  if (!pkg) return null;

  return (
    <div
      className="asset-package-card"
      style={{
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--border-radius)',
        overflow: 'hidden',
        backgroundColor: 'var(--background-color)',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
      }}
    >
      <div
        className="package-thumbnail"
        style={{
          height: '160px',
          backgroundImage: `url(${pkg.thumbnail})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          position: 'relative',
        }}
      >
        {isImported && (
          <div
            style={{
              position: 'absolute',
              top: 'var(--spacing-small)',
              right: 'var(--spacing-small)',
              backgroundColor: 'var(--success-color, #10b981)',
              color: 'white',
              padding: '4px 8px',
              borderRadius: '12px',
              fontSize: '0.75rem',
              fontWeight: '500',
              textTransform: 'uppercase',
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
            }}
          >
            <HiCheck style={{ width: '12px', height: '12px' }} />
            Importiert
          </div>
        )}
      </div>

      <div style={{ padding: 'var(--spacing-medium)' }}>
        <h4
          style={{
            margin: '0 0 var(--spacing-small) 0',
            fontSize: '1.1rem',
            fontWeight: '600',
          }}
        >
          {pkg.name}
        </h4>
        <p
          style={{
            margin: '0 0 var(--spacing-medium) 0',
            fontSize: '0.9rem',
            color: 'var(--font-color-muted)',
            lineHeight: '1.4',
          }}
        >
          {pkg.description}
        </p>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 'var(--spacing-medium)',
          }}
        >
          <span
            style={{
              padding: '4px 8px',
              backgroundColor: 'var(--klee)',
              color: 'var(--background-color)',
              borderRadius: '12px',
              fontSize: '0.75rem',
              fontWeight: '500',
              textTransform: 'uppercase',
            }}
          >
            {pkg.assets?.length || 0} Assets
          </span>
        </div>

        <button
          type="button"
          className={isImported ? 'btn-secondary' : 'btn-primary'}
          style={{ width: '100%' }}
          onClick={onImport}
          disabled={isImporting || isImported}
          aria-label={
            isImporting
              ? `Importiere ${pkg.name}...`
              : isImported
                ? `${pkg.name} bereits importiert`
                : `${pkg.name} importieren`
          }
        >
          {isImporting ? (
            <>
              <div
                className="spinner"
                style={{ marginRight: '8px', width: '16px', height: '16px' }}
               />
              Importiere...
            </>
          ) : isImported ? (
            <>
              <HiCheck className="icon" />
              Bereits importiert
            </>
          ) : (
            <>
              <HiDownload className="icon" />
              Paket importieren
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default AssetPackageCard;
