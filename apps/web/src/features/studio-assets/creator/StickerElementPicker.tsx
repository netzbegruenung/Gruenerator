import {
  DEFAULT_ICON_SET,
  EMOJI_ASSETS,
  loadAllIcons,
  loadEmojiCatalog,
  loadIconSetCatalog,
  rankByQuery,
  type IconDef,
} from '@gruenerator/canvas-editor/stickerElements';
import { Input } from '@gruenerator/ui';
import { useQuery } from '@tanstack/react-query';
import { useDeferredValue, useEffect, useMemo, useState, type JSX } from 'react';

import { TOOL_HINT } from '../../studio-tools/components/ToolUi';

import { iconMaskUrl } from './stickerElementImages';

import { cn } from '@/utils/cn';

/** What the picker hands to the stage. */
export type StickerElementPick =
  { kind: 'emoji'; src: string; label: string } | { kind: 'icon'; iconId: string; label: string };

const LIMIT = 60;

const TILE =
  'flex aspect-square min-w-0 cursor-pointer items-center justify-center rounded-[10px] bg-background-alt p-1.5 outline-none transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 motion-reduce:hover:translate-y-0';

/** An icon thumbnail tinted by the theme: the SVG is the mask, the text colour fills it. */
function IconTile({ icon, onPick }: { icon: IconDef; onPick: () => void }): JSX.Element {
  const [mask, setMask] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void iconMaskUrl(icon.id).then((url) => {
      if (!cancelled) setMask(url);
    });
    return () => {
      cancelled = true;
    };
  }, [icon.id]);
  return (
    <button
      type="button"
      aria-label={`Icon ${icon.name} hinzufügen`}
      title={icon.name}
      onClick={onPick}
      className={TILE}
    >
      <span
        aria-hidden="true"
        className="size-7 bg-foreground"
        style={
          mask
            ? {
                maskImage: `url(${mask})`,
                WebkitMaskImage: `url(${mask})`,
                maskSize: 'contain',
                WebkitMaskSize: 'contain',
              }
            : { opacity: 0.1 }
        }
      />
    </button>
  );
}

/** The canvas editor's emoji or icon catalogue, searchable; one tap adds to the badge. */
export function StickerElementPicker({
  kind: tab,
  onPick,
}: {
  kind: StickerElementPick['kind'];
  onPick: (pick: StickerElementPick) => void;
}): JSX.Element {
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query.trim());

  const emojiCatalog = useQuery({
    queryKey: ['canvas', 'emoji', 'catalog'],
    queryFn: loadEmojiCatalog,
    enabled: tab === 'emoji' && !!deferred,
    staleTime: Infinity,
  });
  const iconCatalog = useQuery({
    queryKey: ['canvas', 'icons', 'catalog', deferred ? '__all__' : DEFAULT_ICON_SET],
    queryFn: () => (deferred ? loadAllIcons() : loadIconSetCatalog(DEFAULT_ICON_SET)),
    enabled: tab === 'icon',
    staleTime: Infinity,
  });

  const emoji = useMemo(() => {
    if (!deferred) return EMOJI_ASSETS;
    const all = emojiCatalog.data?.flatMap((g) => g.emoji) ?? EMOJI_ASSETS;
    return rankByQuery(all, deferred, (e) => [e.label, e.tags]).slice(0, LIMIT);
  }, [deferred, emojiCatalog.data]);

  const icons = useMemo(() => {
    const all = iconCatalog.data ?? [];
    if (!deferred) return all.slice(0, LIMIT);
    return rankByQuery(all, deferred, (i) => [
      i.name,
      [i.name.replace(/-/g, ' '), i.library],
    ]).slice(0, LIMIT);
  }, [deferred, iconCatalog.data]);

  const loading = tab === 'emoji' ? emojiCatalog.isFetching : iconCatalog.isFetching;
  const empty = tab === 'emoji' ? emoji.length === 0 : icons.length === 0;

  return (
    <div className="flex flex-col gap-sm">
      <Input
        type="search"
        aria-label={tab === 'emoji' ? 'Emojis suchen' : 'Icons suchen'}
        placeholder={tab === 'emoji' ? 'Emoji suchen, z. B. Herz' : 'Icon suchen, z. B. Blume'}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div
        className={cn(
          'grid max-h-[232px] grid-cols-6 gap-1.5 overflow-y-auto p-0.5',
          loading && 'opacity-60'
        )}
      >
        {tab === 'emoji'
          ? emoji.map((e) => (
              <button
                key={e.id}
                type="button"
                aria-label={`Emoji ${e.label} hinzufügen`}
                title={e.label}
                onClick={() => onPick({ kind: 'emoji', src: e.src, label: e.label })}
                className={TILE}
              >
                <img src={e.src} alt="" loading="lazy" className="size-7" />
              </button>
            ))
          : icons.map((icon) => (
              <IconTile
                key={icon.id}
                icon={icon}
                onPick={() => onPick({ kind: 'icon', iconId: icon.id, label: icon.name })}
              />
            ))}
      </div>
      {empty && !loading ? <p className={TOOL_HINT}>Nichts gefunden.</p> : null}
    </div>
  );
}
