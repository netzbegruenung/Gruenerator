import { printSeitenOf, printVorlageThumbPath, type PrintVorlage } from '@gruenerator/contracts';
import { Button } from '@gruenerator/ui';
import { Pencil } from 'lucide-react';
import { type JSX } from 'react';

import { getTemplateFormat } from '../../../components/common/Gallery/templateFormat';
import VorlagenCard from '../../../components/common/Gallery/VorlagenCard';

import { VorlageDetailDialog } from './VorlageDetailDialog';

/** The gallery's hard-wired category for the print Vorlagen. */
export const PRINT_TEMPLATE_TYPE = 'print';

/** Free-text match of a print Vorlage against the gallery's search query. */
export const printMatches = (v: PrintVorlage, query: string): boolean => {
  const q = query.trim().toLowerCase();
  return !q || `${v.titel} ${v.beschreibung}`.toLowerCase().includes(q);
};

const pageCount = (v: PrintVorlage) => printSeitenOf(v.spec);

/** Every page's preview in order, the front first. */
const printPages = (v: PrintVorlage): string[] =>
  Array.from({ length: pageCount(v) }, (_, i) =>
    printVorlageThumbPath(v.id, i + 1, v.thumbVersion)
  );

/** A print Vorlage in the gallery: a click opens its detail dialog. */
export function PrintVorlageCard({
  vorlage,
  onOpen,
}: {
  vorlage: PrintVorlage;
  onOpen: (v: PrintVorlage) => void;
}): JSX.Element {
  return (
    <VorlagenCard
      item={{
        id: vorlage.id,
        title: vorlage.titel,
        template_type: PRINT_TEMPLATE_TYPE,
        thumbnail_url: printVorlageThumbPath(vorlage.id, 1, vorlage.thumbVersion),
        content_data: { format: vorlage.spec.format },
      }}
      pages={printPages(vorlage)}
      onOpen={() => onOpen(vorlage)}
    />
  );
}

/** A print Vorlage up close: every page, and the way into the editor. */
export function PrintVorlageDialog({
  vorlage,
  opening,
  onEdit,
  onClose,
}: {
  vorlage: PrintVorlage;
  opening: boolean;
  onEdit: (v: PrintVorlage) => void;
  onClose: () => void;
}): JSX.Element {
  const seiten = pageCount(vorlage);
  const { formatLabel } = getTemplateFormat({
    template_type: PRINT_TEMPLATE_TYPE,
    content_data: { format: vorlage.spec.format },
  });
  return (
    <VorlageDetailDialog
      onClose={onClose}
      reactions={false}
      title={vorlage.titel}
      description={vorlage.beschreibung}
      meta={[formatLabel, seiten > 1 && `${seiten} Seiten`].filter(Boolean).join(' · ')}
      pages={printPages(vorlage).map((src, i) => ({
        src,
        alt:
          seiten > 1
            ? `Seite ${i + 1} von ${seiten}: ${vorlage.titel}`
            : `Vorschau: ${vorlage.titel}`,
      }))}
      primaryAction={
        <Button
          variant="brand"
          size="brand-md"
          className="w-full"
          disabled={opening}
          onClick={() => onEdit(vorlage)}
        >
          <Pencil className="size-4" aria-hidden="true" />
          {opening ? 'Wird geöffnet …' : 'Bearbeiten'}
        </Button>
      }
    />
  );
}
