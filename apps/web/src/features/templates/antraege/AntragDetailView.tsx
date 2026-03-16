import { Markdown } from '../../../components/common/Markdown';
import { cn } from '../../../utils/cn';

interface Antrag {
  title?: string;
  status?: string;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
  antragsteller?: string;
  kontakt_email?: string;
  description?: string;
  antragstext?: string;
}

interface AntragDetailViewProps {
  antrag: Antrag | null;
  onClose: () => void;
}

const AntragDetailView = ({ antrag, onClose }: AntragDetailViewProps) => {
  if (!antrag) {
    return null;
  }

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return '–';
    return new Date(dateString).toLocaleString('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusClass = (status: string | undefined) => {
    const statusLower = status?.toLowerCase() || 'unbekannt';
    switch (statusLower) {
      case 'angenommen':
        return 'status-angenommen';
      case 'in bearbeitung':
        return 'status-in-bearbeitung';
      case 'abgelehnt':
        return 'status-abgelehnt';
      case 'neu':
        return 'status-neu';
      default:
        return 'status-unbekannt';
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-md backdrop-blur-[4px]"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-2xl shadow-xl max-w-[800px] max-h-[90vh] w-full flex flex-col overflow-hidden relative p-lg overflow-y-auto"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {/* Close 'X' button */}
        <button
          className="absolute top-md right-md bg-transparent border-none text-2xl cursor-pointer text-grey-500 dark:text-grey-400 p-xs rounded-lg leading-none transition-all duration-200 min-w-[36px] h-9 flex items-center justify-center hover:bg-hover-alt hover:text-foreground z-10"
          onClick={onClose}
          aria-label="Schließen"
        >
          &times;
        </button>

        {/* --- Header Section --- */}
        <div className="flex justify-between items-start gap-lg mb-md pr-xl">
          <div className="flex flex-col gap-sm min-w-0 flex-1">
            <h2 className="m-0 text-foreground-heading break-words">
              {antrag.title || 'Unbenannter Antrag'}
            </h2>
            {antrag.tags && antrag.tags.length > 0 && (
              <div className="flex flex-wrap gap-xs">
                {antrag.tags.map((tag: string) => (
                  <span
                    key={tag}
                    className="inline-block py-xxs px-sm bg-background-alt border border-grey-200 dark:border-grey-700 rounded-[4px] text-[0.9em] text-foreground whitespace-nowrap"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          {antrag.status && (
            <span
              className={cn(
                'inline-block py-xxs px-sm rounded-[4px] text-[0.85em] font-semibold whitespace-nowrap',
                getStatusClass(antrag.status)
              )}
            >
              {antrag.status}
            </span>
          )}
        </div>

        {/* --- Meta Cards --- */}
        <div className="mb-lg">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
            <div className="p-md bg-background-alt rounded-sm border border-grey-200 dark:border-grey-700">
              <div className="flex flex-col gap-xxs mb-sm">
                <p className="font-semibold text-foreground text-[0.85em] opacity-80 uppercase tracking-[0.5px] m-0">
                  Erstellt:
                </p>
                <p className="text-foreground break-words leading-[1.4] text-[0.95em] m-0">
                  {formatDate(antrag.created_at)}
                </p>
              </div>
              <div className="flex flex-col gap-xxs">
                <p className="font-semibold text-foreground text-[0.85em] opacity-80 uppercase tracking-[0.5px] m-0">
                  Aktualisiert:
                </p>
                <p className="text-foreground break-words leading-[1.4] text-[0.95em] m-0">
                  {formatDate(antrag.updated_at)}
                </p>
              </div>
            </div>

            {(antrag.antragsteller || antrag.kontakt_email) && (
              <div className="p-md bg-background-alt rounded-sm border border-grey-200 dark:border-grey-700">
                {antrag.antragsteller && (
                  <div className="flex flex-col gap-xxs mb-sm">
                    <p className="font-semibold text-foreground text-[0.85em] opacity-80 uppercase tracking-[0.5px] m-0">
                      Antragsteller*in:
                    </p>
                    <p className="text-foreground break-words leading-[1.4] text-[0.95em] m-0">
                      {antrag.antragsteller}
                    </p>
                  </div>
                )}
                {antrag.kontakt_email && (
                  <div className="flex flex-col gap-xxs">
                    <p className="font-semibold text-foreground text-[0.85em] opacity-80 uppercase tracking-[0.5px] m-0">
                      Kontakt-E-Mail:
                    </p>
                    <p className="text-foreground break-words leading-[1.4] text-[0.95em] m-0">
                      <a
                        href={`mailto:${antrag.kontakt_email}`}
                        className="text-[var(--link-color)] underline"
                      >
                        {antrag.kontakt_email}
                      </a>
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Description Section */}
        {antrag.description && (
          <div className="mb-lg p-md bg-background-alt rounded-sm border border-grey-200 dark:border-grey-700">
            <h3 className="mt-0 mb-sm text-foreground-heading">Beschreibung:</h3>
            <Markdown>{antrag.description}</Markdown>
          </div>
        )}

        {/* Antragstext Section */}
        <h3 className="text-foreground-heading">Antragstext:</h3>
        <div className="markdown-content">
          {antrag.antragstext ? (
            <Markdown>{antrag.antragstext}</Markdown>
          ) : (
            <p>
              <em>Kein Text vorhanden.</em>
            </p>
          )}
        </div>

        {/* Close Button */}
        <button
          className="mt-lg px-lg py-sm bg-grey-100 dark:bg-grey-800 border border-grey-200 dark:border-grey-700 rounded-lg cursor-pointer text-foreground font-medium transition-colors duration-200 hover:bg-grey-200 dark:hover:bg-grey-700 self-center"
          onClick={onClose}
        >
          Schließen
        </button>
      </div>
    </div>
  );
};

export default AntragDetailView;
