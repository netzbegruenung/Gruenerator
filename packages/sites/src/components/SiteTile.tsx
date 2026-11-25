import {
  defaultSiteBlocks,
  readSiteVariant,
  type SiteSummary,
  type SupportedLocale,
} from '@gruenerator/contracts';
import { cn } from '@gruenerator/shared/utils';
import { variantPreview } from '@gruenerator/sites-design';
import {
  CardActionsMenu,
  DropdownMenuItem,
  InteractiveCard,
  interactiveCardControl,
} from '@gruenerator/ui';
import { type MouseEvent } from 'react';
import { FiCopy, FiExternalLink } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

import { useToast } from '../hooks/useToast';
import { FROM_OVERVIEW_STATE } from '../SitesContext';
import { formatAddress } from '../utils/siteAddress';

type Status = 'published' | 'draft' | 'hidden';

function statusOf(site: SiteSummary): Status {
  if (site.moderation !== 'ok') return 'hidden';
  return site.is_published ? 'published' : 'draft';
}

const STATUS: Record<Status, { label: string; className: string }> = {
  published: {
    label: 'Veröffentlicht',
    className: 'bg-primary-100 text-primary-800 dark:bg-primary-900/60 dark:text-primary-200',
  },
  draft: {
    label: 'Entwurf',
    className: 'bg-grey-100 text-grey-700 dark:bg-grey-700 dark:text-grey-200',
  },
  hidden: {
    label: 'Ausgeblendet',
    className: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  },
};

function editedLabel(updatedAt: string | null): string | null {
  if (!updatedAt) return null;
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return null;
  return `Bearbeitet am ${date.toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`;
}

// The list carries no block list, so the miniature shows the standard layout in the site's colours.
let previewIds = 0;
const PREVIEW_BLOCKS = defaultSiteBlocks(() => `preview-${previewIds++}`);

/** The page in miniature, header to footer, in the colours of its variant; the portrait on top. */
function SiteThumbnail({ site, locale }: { site: SiteSummary; locale: SupportedLocale }) {
  const hasPortrait = !!site.profile_image;
  const bands = variantPreview(PREVIEW_BLOCKS, hasPortrait, readSiteVariant(site.theme), locale);
  return (
    <span
      aria-hidden="true"
      className="relative flex aspect-[16/9] flex-col overflow-hidden rounded-xl border border-black/5 shadow-[0_1px_2px_rgba(0,0,0,.06)]"
    >
      {bands.map((band, i) => (
        <span
          key={band.key}
          className={cn(i === 1 ? 'flex-[3]' : 'flex-1')}
          style={{ backgroundColor: band.colour }}
        />
      ))}
      {hasPortrait && (
        <img
          src={site.profile_image ?? ''}
          alt=""
          className="absolute right-[10%] top-[16%] size-[34%] rounded-full border-2 border-white object-cover"
        />
      )}
    </span>
  );
}

/**
 * One site on `/sites`, shaped like the Projekte `TileCard`: one tab stop for the whole card
 * (opens the editor), the "…" menu stays its own control.
 */
export function SiteTile({
  site,
  href,
  publicOrigin,
  locale,
}: {
  site: SiteSummary;
  href: string;
  publicOrigin: string | null;
  locale: SupportedLocale;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const status = statusOf(site);
  const edited = editedLabel(site.updated_at);
  const liveUrl =
    status === 'published' && publicOrigin ? `${publicOrigin}/${site.subdomain}` : null;

  const activate = (e: MouseEvent<HTMLElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    void navigate(href, { state: FROM_OVERVIEW_STATE });
  };

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url).then(
      () => toast.success('Link kopiert'),
      () => toast.error('Link konnte nicht kopiert werden')
    );
  };

  return (
    <InteractiveCard
      href={href}
      label={`${site.site_title} bearbeiten`}
      onActivate={activate}
      className={cn(
        'flex flex-col gap-3 rounded-2xl bg-[#DCEAF2] p-2.5 pb-4 dark:bg-[#142430]',
        'transition-shadow duration-150 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]',
        'dark:hover:shadow-[0_4px_12px_rgba(0,0,0,0.30)]'
      )}
    >
      <SiteThumbnail site={site} locale={locale} />
      {liveUrl && (
        <CardActionsMenu className={cn('absolute right-4 top-4', interactiveCardControl)}>
          <DropdownMenuItem onSelect={() => window.open(liveUrl, '_blank', 'noopener')}>
            <FiExternalLink aria-hidden />
            Live ansehen
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => copyLink(liveUrl)}>
            <FiCopy aria-hidden />
            Link kopieren
          </DropdownMenuItem>
        </CardActionsMenu>
      )}
      <span className="flex min-w-0 flex-col gap-0.5 px-1.5">
        <span className="block text-[15px] font-bold leading-tight text-[#123F57] line-clamp-2 sm:text-[16px] dark:text-[#A8D2E8]">
          {site.site_title}
        </span>
        <span className="block truncate text-[13px] text-[#3C6479] dark:text-[#8FB6CB]">
          {formatAddress(publicOrigin, site.subdomain)}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-[#3C6479] dark:text-[#8FB6CB]">
          <span className={cn('rounded-full px-2 py-0.5 font-semibold', STATUS[status].className)}>
            {STATUS[status].label}
          </span>
          {edited}
        </span>
      </span>
    </InteractiveCard>
  );
}
