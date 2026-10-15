import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { profilbildReopenPath } from '../profilbildHandoff';

import { TOOL_HINT } from './ToolUi';

import { cn } from '@/utils/cn';

export const RECENT_PROFILBILDER_KEY = ['profilbild-recent'] as const;

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

const dayMonth = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' });

async function loadRecent() {
  const res = await getContractsClient().sharesRead.recentShares({
    query: { editor: 'profilbild', limit: '3' },
  });
  if (res.status !== 200) throw new Error('Profilbilder konnten nicht geladen werden');
  return res.body.shares;
}

/** Die letzten drei gespeicherten Profilbilder; ohne welche steht nichts da. */
export function RecentProfilbilder() {
  const { data } = useQuery({ queryKey: RECENT_PROFILBILDER_KEY, queryFn: loadRecent });
  if (!data?.length) return null;

  return (
    <nav aria-label="Deine Profilbilder" className="flex items-center gap-sm">
      <span className={cn(TOOL_HINT, 'text-xs')}>Weitermachen</span>
      {data.map((share) => {
        const label = `Profilbild vom ${dayMonth.format(new Date(share.createdAt))} öffnen`;
        return (
          <Link
            key={share.shareToken}
            to={profilbildReopenPath(share.shareToken)}
            aria-label={label}
            title={label}
            className="size-9 shrink-0 overflow-hidden rounded-full border border-grey-200 bg-grey-100 transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:border-grey-700 dark:bg-grey-800"
          >
            <img
              src={share.thumbnailUrl ?? `${API_BASE_URL}/share/${share.shareToken}/preview?w=200`}
              alt=""
              className="size-full object-cover"
            />
          </Link>
        );
      })}
    </nav>
  );
}
