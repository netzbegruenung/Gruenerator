import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { FiArrowLeft, FiChevronRight, FiFolder, FiGitBranch, FiGrid, FiStar } from 'react-icons/fi';

import { useShareLinks, useWolkeBrowse } from '../hooks/useWolke';
import { type WolkeFileItem } from '../types';
import { buildNextcloudFileUrl, getFileIcon, sortFoldersFirst } from '../lib/fileUtils';
import useWolkePreferencesStore from '../stores/wolkePreferencesStore';

import FolderStarButton from './FolderStarButton';
import WolkeTreeBrowser from './WolkeTreeBrowser';

import { cn } from '@gruenerator/ui';

type ViewMode = 'tree' | 'grid';

interface WolkeFolderBrowserProps {
  shareLinkId?: string;
  shareLinkUrl?: string;
  onFolderSelect?: (folderPath: string, folderName: string) => void;
  /** Name reported for the share root, which has no folder name of its own. */
  rootLabel?: string;
  selectedPath?: string;
}

const SLIDE_VARIANTS = {
  enter: (direction: number) => ({ x: direction > 0 ? 80 : -80, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? -80 : 80, opacity: 0 }),
};

const SLIDE_TRANSITION = { duration: 0.2, ease: 'easeInOut' as const };

const WolkeFolderBrowser = ({
  shareLinkId: externalShareLinkId,
  shareLinkUrl,
  onFolderSelect,
  rootLabel = 'Stammverzeichnis',
  selectedPath: externalSelectedPath,
}: WolkeFolderBrowserProps) => {
  const [viewMode, setViewMode] = useState<ViewMode>('tree');
  const [pickedShareLinkId, setPickedShareLinkId] = useState<string | null>(null);
  const [ownSelectedPath, setOwnSelectedPath] = useState<string | undefined>(undefined);
  const { data: shareLinks = [] } = useShareLinks(undefined, undefined, {
    enabled: !externalShareLinkId,
  });

  const shareLinkId = externalShareLinkId ?? pickedShareLinkId;
  const activeShareLinks = shareLinks.filter((l) => l.is_active);

  useEffect(() => {
    if (!externalShareLinkId && !pickedShareLinkId && activeShareLinks.length === 1) {
      setPickedShareLinkId(activeShareLinks[0]!.id);
    }
  }, [externalShareLinkId, pickedShareLinkId, activeShareLinks]);

  // Selection lives here, not in the views, so switching tree ↔ grid keeps it.
  const selectedPath = externalSelectedPath ?? ownSelectedPath;
  const handleFolderSelect = (folderPath: string, folderName: string) => {
    setOwnSelectedPath(folderPath);
    onFolderSelect?.(folderPath, folderName);
  };

  if (!shareLinkId) {
    return (
      <div className="flex flex-col gap-xxs">
        <span className="text-xs text-grey-500 dark:text-grey-300">Verbindung wählen</span>
        {activeShareLinks.map((link) => (
          <button
            key={link.id}
            type="button"
            onClick={() => setPickedShareLinkId(link.id)}
            className="flex items-center gap-sm px-sm py-xs rounded-lg text-sm text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <FiFolder className="w-4 h-4 text-primary-500 dark:text-primary-400 shrink-0" />
            <span className="text-foreground">{link.label || link.base_url || 'Wolke'}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-sm relative">
      <div className="flex items-center justify-between gap-xs">
        {/* The share root is a folder like any other, but it has no row of its
            own in either view — without this button it cannot be picked. */}
        {onFolderSelect ? (
          <RootSelectButton
            label={rootLabel}
            isSelected={selectedPath === ''}
            onSelect={() => handleFolderSelect('', rootLabel)}
          />
        ) : (
          <span />
        )}
        <ViewToggle viewMode={viewMode} onChange={setViewMode} />
      </div>

      {viewMode === 'tree' ? (
        <WolkeTreeBrowser
          shareLinkId={shareLinkId}
          shareLinkUrl={shareLinkUrl}
          onFolderSelect={handleFolderSelect}
          selectedPath={selectedPath}
        />
      ) : (
        <GridView
          shareLinkId={shareLinkId}
          shareLinkUrl={shareLinkUrl}
          onFolderSelect={handleFolderSelect}
          selectedPath={selectedPath}
        />
      )}
    </div>
  );
};

const RootSelectButton = ({
  label,
  isSelected,
  onSelect,
}: {
  label: string;
  isSelected: boolean;
  onSelect: () => void;
}) => (
  <button
    type="button"
    onClick={onSelect}
    aria-pressed={isSelected}
    className={cn(
      'px-sm py-xxs rounded-md text-xs font-medium transition-colors',
      isSelected
        ? 'bg-primary-500 text-white'
        : 'text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20'
    )}
  >
    {isSelected ? `${label} ausgewählt` : `Ganzen Ordner (${label}) auswählen`}
  </button>
);

// ── Grid View ─────────────────────────────────────────────────────────

const GridView = ({
  shareLinkId,
  shareLinkUrl,
  onFolderSelect,
  selectedPath,
}: WolkeFolderBrowserProps) => {
  const [currentPath, setCurrentPath] = useState('');
  const directionRef = useRef(1);
  const {
    data: items,
    isLoading,
    isError,
    isFetching,
  } = useWolkeBrowse(shareLinkId ?? null, currentPath);
  const favourites = useWolkePreferencesStore((s) => s.favourites).filter(
    (f) => f.shareLinkId === shareLinkId
  );

  const pathSegments = currentPath ? currentPath.split('/').filter(Boolean) : [];

  const navigateTo = (path: string) => {
    directionRef.current = 1;
    setCurrentPath(path);
  };

  const navigateUp = () => {
    directionRef.current = -1;
    setCurrentPath(pathSegments.length <= 1 ? '' : pathSegments.slice(0, -1).join('/'));
  };

  const navigateToBreadcrumb = (index: number) => {
    directionRef.current = -1;
    setCurrentPath(index < 0 ? '' : pathSegments.slice(0, index + 1).join('/'));
  };

  const sorted = sortFoldersFirst(items ?? []);

  if (isLoading && !items) {
    return (
      <div className="flex flex-col gap-xs py-xs">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 rounded-lg bg-black/5 dark:bg-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  if (isError) {
    return <p className="text-sm text-grey-400 py-sm">Ordnerinhalt konnte nicht geladen werden.</p>;
  }

  return (
    <div className="flex flex-col gap-sm">
      <div className="flex items-center gap-xs">
        <div className="flex-1 min-w-0">
          {pathSegments.length > 0 ? (
            <Breadcrumb segments={pathSegments} onNavigate={navigateToBreadcrumb} />
          ) : (
            <span className="text-xs text-grey-400">Stammverzeichnis</span>
          )}
        </div>
        {isFetching && (
          <div className="w-3 h-3 rounded-full border-2 border-primary-500 border-t-transparent animate-spin shrink-0" />
        )}
      </div>

      {favourites.length > 0 && currentPath === '' && (
        <FavouritesSection favourites={favourites} onNavigate={navigateTo} />
      )}

      {pathSegments.length > 0 && (
        <button
          type="button"
          onClick={navigateUp}
          className="flex items-center gap-sm px-sm py-xs rounded-lg text-sm text-grey-500 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors -mt-xxs"
        >
          <FiArrowLeft className="w-4 h-4" />
          <span>Zurück</span>
        </button>
      )}

      <AnimatePresence mode="wait" custom={directionRef.current}>
        <motion.div
          key={currentPath}
          custom={directionRef.current}
          variants={SLIDE_VARIANTS}
          initial="enter"
          animate="center"
          exit="exit"
          transition={SLIDE_TRANSITION}
          className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-sm"
        >
          {sorted.length === 0 && (
            <p className="text-sm text-grey-400 text-center py-lg col-span-full">Leerer Ordner</p>
          )}

          {sorted.map((item) => (
            <FileGridItem
              key={item.name}
              item={item}
              currentPath={currentPath}
              shareLinkId={shareLinkId!}
              shareLinkUrl={shareLinkUrl}
              onNavigate={navigateTo}
              {...(onFolderSelect ? { onSelect: onFolderSelect } : {})}
              {...(selectedPath !== undefined ? { selectedPath } : {})}
            />
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

// ── View Toggle ───────────────────────────────────────────────────────

const ViewToggle = ({
  viewMode,
  onChange,
}: {
  viewMode: ViewMode;
  onChange: (mode: ViewMode) => void;
}) => (
  <div className="flex rounded-md border border-grey-200 dark:border-grey-700 overflow-hidden">
    <button
      type="button"
      onClick={() => onChange('tree')}
      className={cn(
        'p-1 transition-colors',
        viewMode === 'tree'
          ? 'bg-grey-100 dark:bg-grey-800 text-foreground'
          : 'text-grey-400 hover:text-foreground'
      )}
      title="Baumansicht"
    >
      <FiGitBranch className="w-3.5 h-3.5" />
    </button>
    <button
      type="button"
      onClick={() => onChange('grid')}
      className={cn(
        'p-1 transition-colors',
        viewMode === 'grid'
          ? 'bg-grey-100 dark:bg-grey-800 text-foreground'
          : 'text-grey-400 hover:text-foreground'
      )}
      title="Rasteransicht"
    >
      <FiGrid className="w-3.5 h-3.5" />
    </button>
  </div>
);

// ── Breadcrumb ────────────────────────────────────────────────────────

const Breadcrumb = ({
  segments,
  onNavigate,
}: {
  segments: string[];
  onNavigate: (index: number) => void;
}) => (
  <div className="flex items-center gap-xs text-xs text-grey-400 flex-wrap min-w-0">
    <button
      type="button"
      onClick={() => onNavigate(-1)}
      className="hover:text-foreground transition-colors shrink-0"
    >
      Stammverzeichnis
    </button>
    {segments.map((segment, i) => (
      <span key={i} className="flex items-center gap-xs min-w-0">
        <FiChevronRight className="w-3 h-3 shrink-0" />
        <button
          type="button"
          onClick={() => onNavigate(i)}
          className={cn(
            'hover:text-foreground transition-colors truncate max-w-[160px]',
            i === segments.length - 1 && 'text-foreground font-medium'
          )}
        >
          {segment}
        </button>
      </span>
    ))}
  </div>
);

// ── Favourites Section ────────────────────────────────────────────────

const FavouritesSection = ({
  favourites,
  onNavigate,
}: {
  favourites: { shareLinkId: string; folderPath: string; folderName: string }[];
  onNavigate: (path: string) => void;
}) => {
  const toggleFavourite = useWolkePreferencesStore((s) => s.toggleFavourite);

  return (
    <div className="flex flex-col gap-xs border-b border-grey-200 dark:border-grey-700 pb-sm">
      <span className="text-xs text-grey-400 flex items-center gap-xxs">
        <FiStar className="w-3 h-3" />
        Favoriten
      </span>
      <div className="flex flex-wrap gap-xs">
        {favourites.map((fav) => (
          <div
            key={fav.folderPath}
            role="button"
            tabIndex={0}
            onClick={() => onNavigate(fav.folderPath)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onNavigate(fav.folderPath);
            }}
            className="group/fav flex items-center gap-xs px-sm py-xs rounded-md bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors text-sm cursor-pointer"
          >
            <FiFolder className="w-3.5 h-3.5 text-primary-500 dark:text-primary-400 shrink-0" />
            <span className="truncate max-w-[140px]">{fav.folderName}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleFavourite(fav);
              }}
              className="shrink-0 opacity-0 group-hover/fav:opacity-100 transition-opacity text-yellow-500 hover:text-yellow-600"
              title="Aus Favoriten entfernen"
            >
              <FiStar className="w-3 h-3 fill-current" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Grid View Item ────────────────────────────────────────────────────

const FileGridItem = ({
  item,
  currentPath,
  shareLinkId,
  shareLinkUrl,
  onNavigate,
  onSelect,
  selectedPath,
}: {
  item: WolkeFileItem;
  currentPath: string;
  shareLinkId: string;
  shareLinkUrl?: string;
  onNavigate: (path: string) => void;
  onSelect?: (folderPath: string, folderName: string) => void;
  selectedPath?: string;
}) => {
  const isDir = item.isDirectory;
  const relativePath = currentPath ? `${currentPath}/${item.name}` : item.name;
  const isSelected = selectedPath === relativePath;
  const { Icon, color } = getFileIcon(item);

  const content = (
    <div className="flex flex-col items-center gap-sm p-md pb-sm">
      <Icon className={cn('w-8 h-8', color)} />
      <span
        className="text-xs text-center w-full line-clamp-3 leading-snug break-words hyphens-auto"
        lang="de"
      >
        {item.name}
      </span>
    </div>
  );

  const cellClass =
    'group/row rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-foreground';

  if (isDir) {
    // The corner control used to sit inside the navigation button — a button
    // inside a button, which no screen reader reaches. Now they are siblings.
    return (
      <div className={cn(cellClass, 'relative', isSelected && 'ring-1 ring-primary-500/50')}>
        <button
          type="button"
          onClick={() => onNavigate(relativePath)}
          className="w-full text-left"
          aria-label={`Ordner ${item.name} öffnen`}
        >
          {content}
        </button>
        <div className="absolute top-xs right-xs">
          {onSelect ? (
            <button
              type="button"
              onClick={() => onSelect(relativePath, item.name)}
              aria-pressed={isSelected}
              className={cn(
                'px-xs py-0.5 rounded text-[0.65rem] font-medium transition-all',
                isSelected
                  ? 'bg-primary-500 text-white'
                  : 'text-primary-600 dark:text-primary-400 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 hover:bg-primary-50 dark:hover:bg-primary-900/20'
              )}
            >
              {isSelected ? 'Ausgewählt' : 'Auswählen'}
            </button>
          ) : (
            <FolderStarButton
              shareLinkId={shareLinkId}
              folderPath={relativePath}
              folderName={item.name}
              className="opacity-0 group-hover/row:opacity-100"
            />
          )}
        </div>
      </div>
    );
  }

  if (shareLinkUrl) {
    const fileUrl = buildNextcloudFileUrl(shareLinkUrl, currentPath, item.name);
    return (
      <a
        href={fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(cellClass, 'no-underline')}
      >
        {content}
      </a>
    );
  }

  return <div className={cn(cellClass, 'cursor-default')}>{content}</div>;
};

export default WolkeFolderBrowser;
