import { getGroupInitials, buildGroupPath, type GroupSummary } from '@gruenerator/shared/groups';
import { HiUser, HiUserGroup } from 'react-icons/hi';
import { Link } from 'react-router-dom';

import { getToolTheme } from '../../../config/toolTheme';

// Square spaces-blue tile mirroring the OfficeTile idiom (aspect-square,
// rounded-2xl, icon pinned top / label pinned bottom) so the "Deine Spaces"
// grid reads as one family with the create tiles above it.
const TILE_BASE =
  'group relative flex aspect-square flex-col justify-between gap-2 rounded-2xl p-4 no-underline ' +
  'transition-shadow duration-150 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] ' +
  'dark:hover:shadow-[0_4px_12px_rgba(0,0,0,0.30)]';

function spaceMeta(space: GroupSummary): string {
  if (space.group_type === 'personal') return 'Nur für dich';
  if (space.member_count != null) {
    return `${space.member_count} Mitglied${space.member_count === 1 ? '' : 'er'}`;
  }
  return space.isAdmin ? 'Admin' : 'Mitglied';
}

export function SpaceTile({ space }: { space: GroupSummary }) {
  const theme = getToolTheme('spaces');
  const TypeIcon = space.group_type === 'personal' ? HiUser : HiUserGroup;
  return (
    <Link
      to={buildGroupPath(space)}
      className={`${TILE_BASE} ${theme?.tile ?? 'bg-grey-50 dark:bg-grey-800/40'}`}
    >
      <span className="flex items-start justify-between">
        <span className="flex size-10 items-center justify-center overflow-hidden rounded-full bg-white/70 dark:bg-white/10">
          {space.avatar_url ? (
            <img src={space.avatar_url} alt="" className="size-full object-cover" />
          ) : (
            <span className={`text-sm font-bold ${theme?.icon ?? 'text-secondary-600'}`}>
              {getGroupInitials(space.name)}
            </span>
          )}
        </span>
        <TypeIcon aria-hidden className={`text-[18px] ${theme?.desc ?? 'text-muted-foreground'}`} />
      </span>
      <span className="min-w-0">
        <span
          className={`block text-[15px] font-bold leading-tight line-clamp-2 sm:text-[16px] ${theme?.title ?? 'text-foreground-heading'}`}
        >
          {space.name}
        </span>
        <span
          className={`mt-0.5 block truncate text-[12px] leading-snug sm:text-[13px] ${theme?.desc ?? 'text-muted-foreground'}`}
        >
          {spaceMeta(space)}
        </span>
      </span>
    </Link>
  );
}
