import { GRUENERATOR_TEMPLATE_TYPE } from '@gruenerator/contracts';
import { Badge, Button } from '@gruenerator/ui';
import { useCallback, useMemo } from 'react';
import { HiExternalLink } from 'react-icons/hi';
import { HiOutlineArrowDownTray, HiOutlinePencilSquare } from 'react-icons/hi2';

import { CanvaLogo } from '@/features/canva/components/CanvaLogo';
import {
  VorlageDetailDialog,
  type VorlageInteractionProps,
} from '@/features/vorlagen/components/VorlageDetailDialog';
import { cn } from '@/utils/cn';

const formatDate = (value: string | number | Date | null | undefined) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '';
  }
};

interface TemplateContentData {
  originalUrl?: string;
  dimensions?: { width: number; height: number };
  [key: string]: unknown;
}

interface TemplateMetadata {
  dimensions?: { width: number; height: number };
  author_name?: string;
  contact_email?: string;
  [key: string]: unknown;
}

interface Template {
  id?: string | number;
  content_data?: TemplateContentData;
  metadata?: TemplateMetadata;
  external_url?: string;
  download_url?: string;
  template_type?: string;
  tags?: string[];
  images?: Array<{ url: string; title?: string; display_order?: number }>;
  thumbnail_url?: string;
  title?: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

type TemplatePreviewModalProps = VorlageInteractionProps & {
  onClose: () => void;
  template: Template;
  onTagClick?: (tag: string) => void;
  // "Use" action for native Grünerator-Vorlagen (clone snapshot → open editor).
  onUseTemplate?: () => void;
  isUsing?: boolean;
};

/** Pretty labels for known template_type values; falls back to capitalized. */
const TEMPLATE_TYPE_LABELS: Record<string, string> = {
  canva: 'Canva',
  [GRUENERATOR_TEMPLATE_TYPE]: 'Grünerator',
};

const TemplatePreviewModal = ({
  onClose,
  template,
  onTagClick,
  onUseTemplate,
  isUsing = false,
  ...interactions
}: TemplatePreviewModalProps): React.ReactNode => {
  const allImages = useMemo(() => {
    const images: Array<{ url: string; title: string }> = [];
    const images_array = (template as Record<string, unknown>)?.images;
    if (Array.isArray(images_array)) {
      const sorted = Array.from(images_array).sort((a, b) => {
        const aOrder = ((a as Record<string, unknown>)?.display_order as number | undefined) || 0;
        const bOrder = ((b as Record<string, unknown>)?.display_order as number | undefined) || 0;
        return aOrder - bOrder;
      });
      sorted.forEach((img) => {
        const url = (img as Record<string, unknown>)?.url;
        const title = (img as Record<string, unknown>)?.title as string | undefined;
        if (url) images.push({ url: url as string, title: title || '' });
      });
    }
    const thumbnail = (template as Record<string, unknown>)?.thumbnail_url as string | undefined;
    if (thumbnail && !images.some((img) => img.url === thumbnail)) {
      images.unshift({ url: thumbnail, title: 'Vorschau' });
    }
    return images;
  }, [template]);

  const handleOpenExternal = useCallback(() => {
    const url =
      template?.content_data?.originalUrl || template?.external_url || template?.download_url;
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, [template]);

  const handleTagClick = useCallback(
    (tag: string) => {
      if (onTagClick) {
        onClose();
        onTagClick(tag);
      }
    },
    [onTagClick, onClose]
  );

  if (!template) return null;

  const title = template.title || 'Vorlage';
  const templateType = template.template_type
    ? (TEMPLATE_TYPE_LABELS[template.template_type] ??
      template.template_type.charAt(0).toUpperCase() + template.template_type.slice(1))
    : '';
  const isCanva = template.template_type === 'canva';
  const isGruenerator = template.template_type === GRUENERATOR_TEMPLATE_TYPE;
  const dimensions = template.content_data?.dimensions || template.metadata?.dimensions;
  const tags = Array.isArray(template.tags) ? template.tags : [];
  // The single openable target, in priority order. When none exists (e.g. a
  // file template still being processed) the primary action is hidden entirely
  // instead of rendering a button that does nothing.
  const openUrl =
    template.content_data?.originalUrl || template.external_url || template.download_url || '';
  const isDownloadOnly =
    !template.content_data?.originalUrl && !template.external_url && Boolean(template.download_url);
  const slides = allImages.length;

  return (
    <VorlageDetailDialog
      {...interactions}
      onClose={onClose}
      title={title}
      description={template.description}
      meta={[
        templateType,
        dimensions && `${dimensions.width} × ${dimensions.height}`,
        formatDate(template.created_at),
      ]
        .filter(Boolean)
        .join(' · ')}
      pages={allImages.map((img, i) => ({
        src: img.url,
        alt:
          slides > 1 ? `Bild ${i + 1} von ${slides}: ${img.title || title}` : `Vorschau: ${title}`,
      }))}
      credits={
        template.metadata?.author_name && (
          <p className="text-xs text-grey-600 dark:text-grey-400">
            Autor*in: {template.metadata.author_name}
            {template.metadata?.contact_email && (
              <>
                {' · '}
                <a href={`mailto:${template.metadata.contact_email}`} className="underline">
                  {template.metadata.contact_email}
                </a>
              </>
            )}
          </p>
        )
      }
      primaryAction={
        isGruenerator && onUseTemplate ? (
          <Button
            variant="brand"
            size="brand-md"
            className="w-full"
            onClick={onUseTemplate}
            disabled={isUsing}
          >
            <HiOutlinePencilSquare aria-hidden="true" />
            {isUsing ? 'Wird geöffnet...' : 'Vorlage verwenden'}
          </Button>
        ) : openUrl ? (
          <Button variant="brand" size="brand-md" className="w-full" onClick={handleOpenExternal}>
            {isCanva ? (
              <>
                <CanvaLogo size={16} />
                In Canva öffnen
              </>
            ) : isDownloadOnly ? (
              <>
                <HiOutlineArrowDownTray aria-hidden="true" />
                Herunterladen
              </>
            ) : (
              <>
                <HiExternalLink aria-hidden="true" />
                Öffnen
              </>
            )}
          </Button>
        ) : null
      }
      share={
        openUrl || isGruenerator
          ? { title, url: openUrl || undefined, templateId: String(template.id) }
          : undefined
      }
    >
      {tags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
          {tags.map((tag: string) => (
            <li key={tag}>
              <Badge
                variant="secondary"
                className={cn(
                  onTagClick &&
                    'cursor-pointer transition-colors duration-200 hover:bg-primary-500 hover:text-white'
                )}
                onClick={onTagClick ? () => handleTagClick(tag) : undefined}
                role={onTagClick ? 'button' : undefined}
                tabIndex={onTagClick ? 0 : undefined}
              >
                #{tag}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </VorlageDetailDialog>
  );
};

export default TemplatePreviewModal;
