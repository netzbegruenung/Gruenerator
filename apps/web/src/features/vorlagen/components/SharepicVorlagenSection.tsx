import { sharepicVorlageThumbPath, type SharepicVorlage } from '@gruenerator/contracts';
import { useMemo, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';

import VorlagenCard from '../../../components/common/Gallery/VorlagenCard';
import { useSharepicVorlagen } from '../hooks/useSharepicVorlagen';

import { SharepicVorlageDialog } from './SharepicVorlageDialog';

interface SharepicVorlagenSectionProps {
  /** The gallery's free-text query; matched against title and description. */
  query: string;
  gridClassName: string;
  /** Show at most this many, with a link to the full gallery. */
  limit?: number;
}

const matches = (v: SharepicVorlage, query: string): boolean => {
  const q = query.trim().toLowerCase();
  return !q || `${v.titel} ${v.beschreibung}`.toLowerCase().includes(q);
};

/**
 * The Grünerator's own sharepic Vorlagen above the community gallery. Renders
 * nothing while there are none (e.g. the private catalogue is not rolled out).
 */
export function SharepicVorlagenSection({
  query,
  gridClassName,
  limit,
}: SharepicVorlagenSectionProps): JSX.Element | null {
  const { data } = useSharepicVorlagen();
  const [open, setOpen] = useState<SharepicVorlage | null>(null);
  const vorlagen = useMemo(
    () => (data ?? []).filter((v) => matches(v, query)).slice(0, limit),
    [data, query, limit]
  );

  if (vorlagen.length === 0) return null;

  return (
    <section aria-labelledby="gruenerator-vorlagen-heading" className="mb-xl">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2
          id="gruenerator-vorlagen-heading"
          className="text-xl font-semibold text-foreground-heading"
        >
          Grünerator-Vorlagen
        </h2>
        {limit !== undefined && (
          <Link to="/vorlagen" className="text-sm font-semibold text-foreground underline">
            Alle Vorlagen
          </Link>
        )}
      </div>
      <p className="mb-md text-sm text-foreground/70">
        Sharepics zum Kopieren und Bearbeiten — oder als Anregung für deinen Wunsch an den Chat.
      </p>
      <div className={gridClassName}>
        {vorlagen.map((v) => (
          <VorlagenCard
            key={v.id}
            item={{
              id: v.id,
              title: v.titel,
              template_type: 'gruenerator',
              thumbnail_url: sharepicVorlageThumbPath(v.id),
              content_data: { format: v.spec.format ?? 'post-portrait' },
            }}
            badge={
              v.spec.slides.length > 1 ? (
                <span className="rounded-full bg-[#0f1210]/60 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                  {v.spec.slides.length} Seiten
                </span>
              ) : undefined
            }
            onOpen={() => setOpen(v)}
          />
        ))}
      </div>
      {open && <SharepicVorlageDialog vorlage={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
