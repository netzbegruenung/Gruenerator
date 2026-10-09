import { sharepicVorlageThumbPath, type SharepicVorlage } from '@gruenerator/contracts';
import { useMemo, useState, type JSX } from 'react';

import VorlagenCard, {
  type VorlagenCardProps,
} from '../../../components/common/Gallery/VorlagenCard';
import { useSharepicVorlagen } from '../hooks/useSharepicVorlagen';
import { useVorlageInteractions } from '../hooks/useVorlageInteractions';

import { SharepicVorlageDialog } from './SharepicVorlageDialog';

interface SharepicVorlagenSectionProps {
  /** The gallery's free-text query; matched against title and description. */
  query: string;
  gridClassName: string;
  /** Only the Vorlagen the viewer has bookmarked („Gemerkt"). */
  onlyFavorites?: boolean;
}

const matches = (v: SharepicVorlage, query: string): boolean => {
  const q = query.trim().toLowerCase();
  return !q || `${v.titel} ${v.beschreibung}`.toLowerCase().includes(q);
};

/** Card props for a catalogue Vorlage, shared with the studio's popular row. */
export function catalogCardProps(
  v: SharepicVorlage,
  likesCount: number
): Pick<VorlagenCardProps, 'item' | 'badge'> {
  return {
    item: {
      id: v.id,
      title: v.titel,
      template_type: 'gruenerator',
      thumbnail_url: sharepicVorlageThumbPath(v.id),
      content_data: { format: v.spec.format ?? 'post-portrait' },
      likes_count: likesCount,
    },
    badge:
      v.spec.slides.length > 1 ? (
        <span className="rounded-full bg-[#0f1210]/60 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
          {v.spec.slides.length} Seiten
        </span>
      ) : undefined,
  };
}

/**
 * The Grünerator's own sharepic Vorlagen above the community gallery. Renders
 * nothing while there are none (e.g. the private catalogue is not rolled out).
 */
export function SharepicVorlagenSection({
  query,
  gridClassName,
  onlyFavorites = false,
}: SharepicVorlagenSectionProps): JSX.Element | null {
  const { data } = useSharepicVorlagen();
  const [open, setOpen] = useState<SharepicVorlage | null>(null);
  const matching = useMemo(() => (data ?? []).filter((v) => matches(v, query)), [data, query]);
  const ids = useMemo(() => matching.map((v) => v.id), [matching]);
  const { cardProps, likesCount, favoritedIds } = useVorlageInteractions(ids);
  const vorlagen = onlyFavorites ? matching.filter((v) => favoritedIds.has(v.id)) : matching;

  if (vorlagen.length === 0) return null;

  return (
    <section aria-labelledby="gruenerator-vorlagen-heading">
      <h2 id="gruenerator-vorlagen-heading" className="sr-only">
        Grünerator-Vorlagen
      </h2>
      <div className={gridClassName}>
        {vorlagen.map((v) => (
          <VorlagenCard
            key={v.id}
            {...catalogCardProps(v, likesCount(v.id))}
            onOpen={() => setOpen(v)}
            {...cardProps(v.id)}
          />
        ))}
      </div>
      {open && <SharepicVorlageDialog vorlage={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
