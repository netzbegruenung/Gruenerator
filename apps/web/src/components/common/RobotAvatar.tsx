import {
  getInitials,
  getRobotAvatarAlt,
  getRobotAvatarPath,
  shouldShowRobotAvatar,
  validateRobotId,
} from '@gruenerator/shared/avatar';
import { Avatar, AvatarImage, AvatarFallback } from '@gruenerator/ui';
import { type ReactElement } from 'react';

import { cn } from '@/utils/cn';

interface RobotAvatarProps {
  /** Selected robot avatar id (1–13); accepts the string form from the API. Null/invalid falls back to initials. */
  robotId?: number | string | null;
  /** Used to compute the initials fallback (shown while loading or on error). */
  displayName?: string | null;
  email?: string | null;
  /**
   * Intrinsic pixel size — emitted as the `width`/`height` HTML attributes so the
   * browser reserves layout space before the image arrives (prevents CLS).
   * Match it to the rendered size (e.g. 64 for `size-16`, 28 for `w-7`).
   */
  sizePx: number;
  /** Sizing/extra classes for the avatar root (e.g. `size-16`, `w-7 h-7`). */
  className?: string;
  /** Extra classes for the initials fallback (e.g. background/text color). */
  fallbackClassName?: string;
  /**
   * Above-the-fold avatars (the profile header) load eagerly with high priority;
   * everything else stays lazy so off-screen avatars never block the page.
   */
  priority?: boolean;
  /**
   * Override the alt text. Pass `""` for decorative avatars that sit directly next
   * to a visible name label (avoids the screen reader announcing it twice).
   */
  alt?: string;
}

/**
 * Shared robot-avatar renderer built on the Radix Avatar primitive — the single
 * way to render a user/member robot avatar across profile, boards and groups.
 *
 * Radix shows the initials fallback until the image successfully loads and keeps
 * it shown if the image errors — so a slow or failed avatar degrades to initials
 * instead of an empty circle. The `<img>` carries `width`/`height` (no layout
 * shift), `loading`/`fetchPriority` (lazy off-screen, eager above-the-fold) and
 * `decoding="async"`. Source assets are ~10 KB WebP (see `getRobotAvatarPath`).
 */
export function RobotAvatar({
  robotId,
  displayName,
  email,
  sizePx,
  className,
  fallbackClassName,
  priority = false,
  alt,
}: RobotAvatarProps): ReactElement {
  const isRobot = shouldShowRobotAvatar(robotId);
  const id = validateRobotId(robotId);
  const initials = getInitials(displayName ?? undefined, email ?? undefined);

  return (
    <Avatar className={cn('rounded-full', className)}>
      {isRobot && (
        <AvatarImage
          src={getRobotAvatarPath(id)}
          alt={alt ?? getRobotAvatarAlt(id)}
          width={sizePx}
          height={sizePx}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          className="object-cover"
        />
      )}
      <AvatarFallback
        // Only delay the fallback when there's an image to wait for — avoids an
        // initials flash on fast loads while still surfacing it if the avatar is
        // slow/broken. For initials-only users we want it shown immediately.
        {...(isRobot ? { delayMs: 300 } : {})}
        className={cn('bg-primary-500 font-bold text-white', fallbackClassName)}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}

export default RobotAvatar;
