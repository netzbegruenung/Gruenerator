import {
  GRUENERATOR_TEMPLATE_TYPE,
  type GalleryTemplate,
  type SharepicVorlage,
} from '@gruenerator/contracts';
import { useMemo, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';

import VorlagenCard, {
  type VorlagenCardProps,
} from '../../../components/common/Gallery/VorlagenCard';
import TemplatePreviewModal from '../../../components/common/TemplatePreviewModal';
import { useGrueneratorVorlage } from '../hooks/useGrueneratorVorlage';
import { popularVorlageId, usePopularVorlagen } from '../hooks/usePopularVorlagen';
import { useVorlageInteractions } from '../hooks/useVorlageInteractions';

import { SharepicVorlageDialog } from './SharepicVorlageDialog';
import { catalogCardProps } from './SharepicVorlagenSection';

import { cn } from '@/utils/cn';

/** One row at every width: two cards below `sm`, four from `sm` on. */
const ROW_LIMIT = 4;
const ROW_GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-4';
const SM_UP = 'max-sm:hidden';

/**
 * „Beliebte Vorlagen" on the studio landing page: Grünerator-, Canva- and
 * community Vorlagen mixed, ranked by likes (newest as fallback).
 */
export function PopularVorlagenRow(): JSX.Element | null {
  const { data } = usePopularVorlagen(ROW_LIMIT);
  const popular = useMemo(() => data ?? [], [data]);
  const ids = useMemo(() => popular.map(popularVorlageId), [popular]);
  const { cardProps, likesCount } = useVorlageInteractions(ids);
  const [openCatalog, setOpenCatalog] = useState<SharepicVorlage | null>(null);
  const [openTemplate, setOpenTemplate] = useState<GalleryTemplate | null>(null);
  const { openVorlage, usingId } = useGrueneratorVorlage();

  if (popular.length === 0) return null;

  const templateId = openTemplate ? String(openTemplate.id) : '';

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
        {popular.map((p, index) => {
          const id = popularVorlageId(p);
          const className = cn(index >= 2 && SM_UP);
          if (p.kind === 'catalog') {
            return (
              <div key={id} className={className}>
                <VorlagenCard
                  {...catalogCardProps(p.vorlage, likesCount(id, p.likes_count))}
                  onOpen={() => setOpenCatalog(p.vorlage)}
                  {...cardProps(id)}
                />
              </div>
            );
          }
          // Gallery rows are a loose passthrough shape; the card reads only its known fields.
          const item = p.template as VorlagenCardProps['item'];
          return (
            <div key={id} className={className}>
              <VorlagenCard
                item={{ ...item, likes_count: likesCount(id, p.likes_count) }}
                onOpen={() => setOpenTemplate(p.template)}
                {...cardProps(id)}
              />
            </div>
          );
        })}
      </div>

      {openCatalog && (
        <SharepicVorlageDialog
          vorlage={openCatalog}
          onClose={() => setOpenCatalog(null)}
          {...cardProps(openCatalog.id)}
        />
      )}
      {openTemplate && (
        <TemplatePreviewModal
          onClose={() => setOpenTemplate(null)}
          template={openTemplate as Parameters<typeof TemplatePreviewModal>[0]['template']}
          {...cardProps(templateId)}
          onUseTemplate={
            openTemplate.template_type === GRUENERATOR_TEMPLATE_TYPE
              ? () =>
                  void openVorlage({
                    id: templateId,
                    content_data: openTemplate.content_data as Record<string, unknown> | null,
                  })
              : undefined
          }
          isUsing={usingId === templateId}
        />
      )}
    </section>
  );
}
