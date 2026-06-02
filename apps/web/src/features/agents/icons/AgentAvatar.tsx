import { PhosphorIcon } from './PhosphorIcon';

import { cn } from '@/utils/cn';

const SIZES = {
  sm: { box: 'h-7 w-7 text-sm', icon: 16 },
  md: { box: 'h-10 w-10 text-base', icon: 20 },
  lg: { box: 'h-14 w-14 text-2xl', icon: 28 },
} as const;

interface AgentAvatarProps {
  iconKey?: string;
  /** Legacy emoji fallback for rows without an iconKey. */
  avatar?: string;
  backgroundColor?: string;
  size?: keyof typeof SIZES;
  className?: string;
}

/**
 * Canonical user-agent avatar: a react-icons Phosphor icon (by `iconKey`) on a
 * colored circle, falling back to the legacy emoji `avatar` when no icon is set.
 */
export function AgentAvatar({
  iconKey,
  avatar,
  backgroundColor = '#316049',
  size = 'md',
  className,
}: AgentAvatarProps) {
  const { box, icon } = SIZES[size];
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full text-white',
        box,
        className
      )}
      style={{ backgroundColor }}
    >
      {iconKey ? <PhosphorIcon name={iconKey} size={icon} aria-hidden /> : <span>{avatar}</span>}
    </span>
  );
}
