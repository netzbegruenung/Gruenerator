import { type ExportFormat } from '../../types/slide';

interface SlideToolbarProps {
  title: string;
  onTitleChange?: (title: string) => void;
  onExport?: (format: ExportFormat) => void;
  onPresent?: () => void;
  onBack?: () => void;
  isSaving?: boolean;
  editable?: boolean;
  slideCount?: number;
  currentSlide?: number;
}

/**
 * Top toolbar for the presentation editor.
 * Shows title, export options, and present button.
 */
export function SlideToolbar({
  title,
  onTitleChange,
  onExport,
  onPresent,
  onBack,
  isSaving = false,
  editable = false,
  slideCount = 0,
  currentSlide = 0,
}: SlideToolbarProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-grey-200 dark:border-grey-700 bg-white/80 dark:bg-grey-900/80 backdrop-blur-sm sticky top-0 z-40">
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg hover:bg-grey-100 dark:hover:bg-grey-800 transition-colors"
            aria-label="Zurück"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {editable && onTitleChange ? (
          <input
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            className="text-lg font-semibold bg-transparent border-none outline-none focus:ring-1 focus:ring-primary-500 rounded px-1 max-w-[400px]"
            placeholder="Präsentationstitel"
          />
        ) : (
          <h1 className="text-lg font-semibold truncate max-w-[400px]">{title}</h1>
        )}

        {isSaving && (
          <span className="text-xs text-grey-400 flex items-center gap-1">
            <svg
              className="w-3 h-3 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            Speichern...
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-grey-500">
          {currentSlide + 1} / {slideCount}
        </span>

        {onPresent && slideCount > 0 && (
          <button
            onClick={onPresent}
            className="px-3 py-1.5 rounded-lg bg-grey-100 dark:bg-grey-800 hover:bg-grey-200 dark:hover:bg-grey-700 transition-colors text-sm flex items-center gap-1.5"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
            Präsentieren
          </button>
        )}

        {onExport && slideCount > 0 && (
          <div className="relative group">
            <button className="px-3 py-1.5 rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors text-sm flex items-center gap-1.5">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              Exportieren
            </button>
            <div className="absolute right-0 top-full mt-1 bg-white dark:bg-grey-800 border border-grey-200 dark:border-grey-700 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 min-w-[140px]">
              <button
                onClick={() => onExport('pptx')}
                className="w-full px-3 py-2 text-left text-sm hover:bg-grey-50 dark:hover:bg-grey-700 rounded-t-lg"
              >
                Als PPTX
              </button>
              <button
                onClick={() => onExport('pdf')}
                className="w-full px-3 py-2 text-left text-sm hover:bg-grey-50 dark:hover:bg-grey-700 rounded-b-lg"
              >
                Als PDF
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
