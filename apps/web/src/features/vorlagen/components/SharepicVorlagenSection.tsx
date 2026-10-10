import { sharepicVorlageThumbPath, type SharepicVorlage } from '@gruenerator/contracts';
import { useMemo, type JSX } from 'react';
import { useSearchParams } from 'react-router-dom';

import VorlagenCard, {
  type VorlagenCardProps,
} from '../../../components/common/Gallery/VorlagenCard';
import { useVorlageInteractions } from '../hooks/useVorlageInteractions';

import { SharepicVorlageDialog } from './SharepicVorlageDialog';

/** Free-text match of a catalogue Vorlage against the gallery's search query. */
export const catalogMatches = (v: SharepicVorlage, query: string): boolean => {
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
      thumbnail_url: sharepicVorlageThumbPath(v.id, 1, v.thumbVersion),
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
 * Cards for the Grünerator's own sharepic Vorlagen, rendered into the
 * gallery's grid next to the community templates.
 */
export function SharepicVorlagenCards({ vorlagen }: { vorlagen: SharepicVorlage[] }): JSX.Element {
  // The open Vorlage lives in the URL, so a shared `/vorlagen?vorlage=<id>`
  // link lands on its dialog.
  const [params, setParams] = useSearchParams();
  const open = vorlagen.find((v) => v.id === params.get('vorlage')) ?? null;
  const setOpen = (v: SharepicVorlage | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (v) next.set('vorlage', v.id);
        else next.delete('vorlage');
        return next;
      },
      { replace: true }
    );
  const ids = useMemo(() => vorlagen.map((v) => v.id), [vorlagen]);
  const { cardProps, likesCount } = useVorlageInteractions(ids);

  return (
    <>
      {vorlagen.map((v) => (
        <VorlagenCard
          key={v.id}
          {...catalogCardProps(v, likesCount(v.id))}
          onOpen={() => setOpen(v)}
          {...cardProps(v.id)}
        />
      ))}
      {open && (
        <SharepicVorlageDialog
          vorlage={open}
          onClose={() => setOpen(null)}
          {...cardProps(open.id)}
        />
      )}
    </>
  );
}
