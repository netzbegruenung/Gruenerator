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
): Pick<VorlagenCardProps, 'item' | 'badge' | 'pages'> {
  return {
    item: {
      id: v.id,
      title: v.titel,
      template_type: 'gruenerator',
      thumbnail_url: sharepicVorlageThumbPath(v.id, 1, v.thumbVersion),
      content_data: { format: v.spec.format ?? 'post-portrait' },
      likes_count: likesCount,
    },
    pages: v.spec.slides.map((_, i) => sharepicVorlageThumbPath(v.id, i + 1, v.thumbVersion)),
    badge:
      v.spec.slides.length > 1 ? (
        <span className="rounded-full bg-[#0f1210]/60 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
          {v.spec.slides.length} Seiten
        </span>
      ) : undefined,
  };
}

type Interactions = Pick<ReturnType<typeof useVorlageInteractions>, 'cardProps' | 'likesCount'>;

/**
 * Cards for the Grünerator's own sharepic Vorlagen plus the dialog they open.
 * `renderCard` lets the gallery place them anywhere in its grid, e.g. sorted
 * among the community templates; render `dialog` once next to the grid.
 */
export function useSharepicVorlageCards(
  vorlagen: SharepicVorlage[],
  { cardProps, likesCount }: Interactions
): { renderCard: (v: SharepicVorlage) => JSX.Element; dialog: JSX.Element | null } {
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

  return {
    renderCard: (v) => (
      <VorlagenCard
        key={v.id}
        {...catalogCardProps(v, likesCount(v.id))}
        onOpen={() => setOpen(v)}
        {...cardProps(v.id)}
      />
    ),
    dialog: open && (
      <SharepicVorlageDialog vorlage={open} onClose={() => setOpen(null)} {...cardProps(open.id)} />
    ),
  };
}

export function SharepicVorlagenCards({ vorlagen }: { vorlagen: SharepicVorlage[] }): JSX.Element {
  const ids = useMemo(() => vorlagen.map((v) => v.id), [vorlagen]);
  const { renderCard, dialog } = useSharepicVorlageCards(vorlagen, useVorlageInteractions(ids));
  return (
    <>
      {vorlagen.map(renderCard)}
      {dialog}
    </>
  );
}
