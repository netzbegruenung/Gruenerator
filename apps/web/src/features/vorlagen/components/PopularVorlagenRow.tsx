import { type SharepicVorlage } from '@gruenerator/contracts';
import { useMemo, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';

import VorlagenCard from '../../../components/common/Gallery/VorlagenCard';
import { usePopularVorlagen } from '../hooks/usePopularVorlagen';
import { useVorlageInteractions } from '../hooks/useVorlageInteractions';

import { SharepicVorlageDialog } from './SharepicVorlageDialog';
import { catalogCardProps } from './SharepicVorlagenSection';

import { cn } from '@/utils/cn';

/** One row at every width: two cards below `sm`, four from `sm` on. */
const ROW_LIMIT = 4;
const ROW_GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-4';
const SM_UP = 'max-sm:hidden';

/**
 * „Beliebte Vorlagen" on the studio landing page: the most liked Grünerator-Vorlagen
 * (community and Canva ones live in the Marktplatz).
 */
export function PopularVorlagenRow(): JSX.Element | null {
  const { data } = usePopularVorlagen(ROW_LIMIT);
  const popular = useMemo(() => data ?? [], [data]);
  const ids = useMemo(() => popular.map((p) => p.vorlage.id), [popular]);
  const { cardProps, likesCount } = useVorlageInteractions(ids);
  const [openCatalog, setOpenCatalog] = useState<SharepicVorlage | null>(null);

  if (popular.length === 0) return null;

  return (
    <section aria-labelledby="beliebte-vorlagen-heading" className="mb-xl">
      <div className="mb-md flex items-baseline justify-between gap-3">
        <h2
          id="beliebte-vorlagen-heading"
          className="text-xl font-semibold text-foreground-heading"
        >
          Beliebte Vorlagen
        </h2>
        <Link to="/vorlagen" className="text-sm font-semibold text-foreground underline">
          Alle Vorlagen
        </Link>
      </div>
      <div className={ROW_GRID}>
        {popular.map((p, index) => (
          <div key={p.vorlage.id} className={cn(index >= 2 && SM_UP)}>
            <VorlagenCard
              {...catalogCardProps(p.vorlage, likesCount(p.vorlage.id, p.likes_count))}
              onOpen={() => setOpenCatalog(p.vorlage)}
              {...cardProps(p.vorlage.id)}
            />
          </div>
        ))}
      </div>

      {openCatalog && (
        <SharepicVorlageDialog
          vorlage={openCatalog}
          onClose={() => setOpenCatalog(null)}
          {...cardProps(openCatalog.id)}
        />
      )}
    </section>
  );
}
