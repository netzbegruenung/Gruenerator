import { getCanvasFormat } from '@gruenerator/canvas-editor/formats';
import { type PrintVorlage } from '@gruenerator/canvas-editor/print-vorlagen';
import { type JSX } from 'react';

import VorlagenCard from '../../../components/common/Gallery/VorlagenCard';

/** The gallery's hard-wired category for the print Vorlagen. */
export const PRINT_TEMPLATE_TYPE = 'print';

/** Free-text match of a print Vorlage against the gallery's search query. */
export const printMatches = (v: PrintVorlage, query: string): boolean => {
  const q = query.trim().toLowerCase();
  return !q || `${v.titel} ${v.beschreibung}`.toLowerCase().includes(q);
};

const BADGE =
  'rounded-full bg-[#0f1210]/60 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm';

/** A print Vorlage in the gallery: a click opens it as an editable canvas. */
export function PrintVorlageCard({
  vorlage,
  opening,
  onOpen,
}: {
  vorlage: PrintVorlage;
  opening: boolean;
  onOpen: (v: PrintVorlage) => void;
}): JSX.Element {
  const seiten = getCanvasFormat(vorlage.spec.format)?.print?.seiten ?? 1;
  return (
    <VorlagenCard
      item={{
        id: vorlage.id,
        title: vorlage.titel,
        template_type: PRINT_TEMPLATE_TYPE,
        thumbnail_url: vorlage.thumb,
        content_data: { format: vorlage.spec.format },
      }}
      badge={
        opening ? (
          <span className={BADGE}>Wird geöffnet …</span>
        ) : seiten > 1 ? (
          <span className={BADGE}>{seiten} Seiten</span>
        ) : undefined
      }
      // Page n > 1 of a print Vorlage previews as `<thumb>-n.webp`.
      pages={Array.from({ length: seiten }, (_, i) =>
        i === 0 ? vorlage.thumb : vorlage.thumb.replace(/\.webp$/, `-${i + 1}.webp`)
      )}
      onOpen={() => onOpen(vorlage)}
    />
  );
}
