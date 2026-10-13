import { resolveStoredImageUrl } from '@gruenerator/shared/media-library/shareUrl';
import { Badge } from '@gruenerator/ui';
import { useState } from 'react';
import { HiCheck, HiX, HiExternalLink, HiChevronLeft, HiChevronRight } from 'react-icons/hi';

import type { AdminVorlage } from '../hooks/useAdminVorlagen';

import { resolveApiAssetUrl } from '@/utils/platform';

const dateFormat: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };

interface VorlagenReviewCardProps {
  vorlage: AdminVorlage;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  isApproving: boolean;
  isRejecting: boolean;
}

const TEMPLATE_TYPE_LABELS: Record<string, string> = {
  sharepic: 'Sharepic',
  story: 'Story',
  template: 'Vorlage',
};

const VorlagenReviewCard = ({
  vorlage,
  onApprove,
  onReject,
  isApproving,
  isRejecting,
}: VorlagenReviewCardProps) => {
  const [imageError, setImageError] = useState(false);
  const [page, setPage] = useState(0);

  // Selbst hochgeladene Bilder stehen als `/share/<token>` in der Datenbank.
  // Das `startsWith('http')`-Gitter hat sie hier komplett verworfen — die
  // Freigabe-Warteschlange zeigte für sie nur das Platzhalter-Emoji (#2845).
  const sources = [
    ...(Array.isArray(vorlage.images) ? vorlage.images : [])
      .map((img) => img as { url?: string; display_order?: number })
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
      .map((img) => img.url),
  ].filter((url): url is string => !!url);
  // Mehrseitige Vorlagen führen jede Seite in `images`; ältere Einträge nur das Cover.
  if (sources.length === 0 && vorlage.thumbnail_url) sources.push(vorlage.thumbnail_url);
  const pageCount = sources.length;
  const current = Math.min(page, Math.max(pageCount - 1, 0));
  const thumbnailUrl = resolveApiAssetUrl(resolveStoredImageUrl(sources[current]) ?? undefined);

  const goTo = (next: number) => {
    setImageError(false);
    setPage((next + pageCount) % pageCount);
  };

  const typeLabel = TEMPLATE_TYPE_LABELS[vorlage.template_type] || vorlage.template_type;
  const rejectionReason = vorlage.metadata?.rejection_reason as string | undefined;

  return (
    <div className="flex flex-col bg-background border border-grey-200 dark:border-grey-700 rounded-md overflow-hidden">
      <div className="relative flex items-center justify-center bg-white dark:bg-grey-800 aspect-[4/3]">
        {thumbnailUrl && !imageError ? (
          // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- onError ist ein technischer Ladefehler-Fallback, keine Bedienung
          <img
            src={thumbnailUrl}
            alt={
              pageCount > 1
                ? `${vorlage.title}, Seite ${current + 1} von ${pageCount}`
                : vorlage.title
            }
            loading="lazy"
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <span className="text-4xl select-none">📋</span>
        )}
        {pageCount > 1 && (
          <>
            <button
              type="button"
              onClick={() => goTo(current - 1)}
              aria-label="Vorherige Seite"
              className="absolute left-xs top-1/2 -translate-y-1/2 flex items-center justify-center size-8 rounded-full bg-black/60 text-white border-none cursor-pointer hover:bg-black/80"
            >
              <HiChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => goTo(current + 1)}
              aria-label="Nächste Seite"
              className="absolute right-xs top-1/2 -translate-y-1/2 flex items-center justify-center size-8 rounded-full bg-black/60 text-white border-none cursor-pointer hover:bg-black/80"
            >
              <HiChevronRight size={18} />
            </button>
            <span className="absolute bottom-xs right-xs rounded-full bg-black/60 px-sm py-0.5 text-xs text-white">
              {current + 1} / {pageCount}
            </span>
          </>
        )}
      </div>

      <div className="border-t border-grey-100 dark:border-grey-700 p-md flex flex-col gap-sm">
        <div className="flex items-start justify-between gap-xs">
          <h3 className="text-sm font-semibold text-foreground-heading m-0 truncate flex-1">
            {vorlage.title}
          </h3>
          <Badge variant="secondary" className="text-xs shrink-0">
            {typeLabel}
          </Badge>
        </div>

        {vorlage.description && (
          <p className="text-xs text-grey-500 dark:text-grey-400 m-0 line-clamp-2">
            {vorlage.description}
          </p>
        )}

        <div className="flex items-center gap-xs text-xs text-grey-400">
          <span>{vorlage.creator_name || 'Unbekannt'}</span>
          <span>·</span>
          <span>{new Date(vorlage.created_at).toLocaleDateString('de-DE', dateFormat)}</span>
        </div>

        {vorlage.external_url && (
          <a
            href={vorlage.external_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-xs text-xs text-primary-600 hover:text-primary-500 no-underline"
            onClick={(e) => e.stopPropagation()}
          >
            <HiExternalLink size={12} />
            Vorlage öffnen
          </a>
        )}

        {rejectionReason && vorlage.status === 'rejected' && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded px-sm py-xs">
            <p className="text-xs text-red-700 dark:text-red-400 m-0">
              Ablehnungsgrund: {rejectionReason}
            </p>
          </div>
        )}

        {vorlage.status === 'pending_review' && (
          <div className="flex gap-sm mt-xs">
            <button
              type="button"
              onClick={() => onApprove(vorlage.id)}
              disabled={isApproving || isRejecting}
              className="flex-1 flex items-center justify-center gap-xs px-md py-xs rounded-md text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer border-none transition-colors"
            >
              <HiCheck size={14} />
              {isApproving ? 'Wird freigegeben...' : 'Freigeben'}
            </button>
            <button
              type="button"
              onClick={() => onReject(vorlage.id)}
              disabled={isApproving || isRejecting}
              className="flex-1 flex items-center justify-center gap-xs px-md py-xs rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer border-none transition-colors"
            >
              <HiX size={14} />
              {isRejecting ? 'Wird abgelehnt...' : 'Ablehnen'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default VorlagenReviewCard;
