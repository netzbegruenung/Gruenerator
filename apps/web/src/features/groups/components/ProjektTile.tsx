import { getGroupInitials, buildGroupPath, type GroupSummary } from '@gruenerator/shared/groups';
import { HiUser, HiUserGroup } from 'react-icons/hi';
import { Link } from 'react-router-dom';

import { getToolTheme } from '../../../config/toolTheme';

// Square projekte-blue tile mirroring the OfficeTile idiom (aspect-square,
// rounded-2xl, icon pinned top / label pinned bottom) so the "Deine Projekte"
// grid reads as one family with the create tiles above it.
const TILE_BASE =
  'group relative flex aspect-square flex-col justify-between gap-2 rounded-2xl p-4 no-underline ' +
  'transition-shadow duration-150 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] ' +
  'dark:hover:shadow-[0_4px_12px_rgba(0,0,0,0.30)]';

function projektMeta(projekt: GroupSummary): string {
  if (projekt.group_type === 'personal') return 'Nur für dich';
  if (projekt.member_count != null) {
    return `${projekt.member_count} Mitglied${projekt.member_count === 1 ? '' : 'er'}`;
  }
  return projekt.isAdmin ? 'Admin' : 'Mitglied';
}

export function ProjektTile({ projekt }: { projekt: GroupSummary }) {
  const theme = getToolTheme('projekte');
  const TypeIcon = projekt.group_type === 'personal' ? HiUser : HiUserGroup;
  return (
    <Link
      to={buildGroupPath(projekt)}
      className={`${TILE_BASE} ${theme?.tile ?? 'bg-grey-50 dark:bg-grey-800/40'}`}
    >
      <span className="flex items-start justify-between">
        <span className="flex size-10 items-center justify-center overflow-hidden rounded-full bg-white/70 dark:bg-white/10">
          {projekt.avatar_url ? (
            <img src={projekt.avatar_url} alt="" className="size-full object-cover" />
          ) : (
            <span className={`text-sm font-bold ${theme?.icon ?? 'text-secondary-600'}`}>
              {getGroupInitials(projekt.name)}
            </span>
          )}
        </span>
        <TypeIcon aria-hidden className={`text-[18px] ${theme?.desc ?? 'text-muted-foreground'}`} />
      </span>
      <span className="min-w-0">
        <span
          className={`block text-[15px] font-bold leading-tight line-clamp-2 sm:text-[16px] ${theme?.title ?? 'text-foreground-heading'}`}
        >
          {projekt.name}
        </span>
        <span
          className={`mt-0.5 block truncate text-[12px] leading-snug sm:text-[13px] ${theme?.desc ?? 'text-muted-foreground'}`}
        >
          {projektMeta(projekt)}
        </span>
      </span>
    </Link>
  );
}
