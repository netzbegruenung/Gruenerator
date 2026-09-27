import {
  ROBOT_ID_MIN,
  ROBOT_ID_MAX,
  DEFAULT_ROBOT_ID,
  GRUENERATOR_FRIENDS,
  type AvatarDisplayProps,
  type AvatarProfile,
  type GrueneratorFriend,
} from './types.js';

const DEFAULT_BASE_URL = 'https://gruenerator.eu';

export const validateRobotId = (robotId: unknown): number => {
  const id = typeof robotId === 'string' ? parseInt(robotId, 10) : Number(robotId);
  return id >= ROBOT_ID_MIN && id <= ROBOT_ID_MAX ? id : DEFAULT_ROBOT_ID;
};

export const getAllRobotIds = (): number[] => {
  return Array.from({ length: ROBOT_ID_MAX }, (_, i) => i + 1);
};

export const getRandomRobotId = (): number => {
  return Math.floor(Math.random() * ROBOT_ID_MAX) + 1;
};

export const getFriend = (robotId: unknown): GrueneratorFriend => {
  const id = validateRobotId(robotId);
  return (
    GRUENERATOR_FRIENDS.find((friend) => friend.id === id) ??
    // Unreachable while GRUENERATOR_FRIENDS covers ROBOT_ID_MIN…MAX, but keeps
    // the return type non-nullable for every caller.
    (GRUENERATOR_FRIENDS[0] as GrueneratorFriend)
  );
};

export const getFriendName = (robotId: unknown): string => getFriend(robotId).name;

export const getRobotAvatarAlt = (robotId: number): string => {
  return getFriendName(robotId);
};

export const shouldShowRobotAvatar = (avatarRobotId: unknown): boolean => {
  const id =
    typeof avatarRobotId === 'string' ? parseInt(avatarRobotId, 10) : Number(avatarRobotId);
  return id >= ROBOT_ID_MIN && id <= ROBOT_ID_MAX;
};

export const getInitials = (displayName?: string, email?: string): string => {
  if (displayName && displayName.trim()) {
    const nameParts = displayName.trim().split(/\s+/);
    if (nameParts.length >= 2) {
      const first = nameParts[0] ?? '';
      const last = nameParts[nameParts.length - 1] ?? '';
      return (first.charAt(0) + last.charAt(0)).toUpperCase();
    }
    return displayName.substring(0, 2).toUpperCase();
  }
  if (email) {
    return email.substring(0, 2).toUpperCase();
  }
  return 'U';
};

/**
 * Hochzählen, sobald sich der *Inhalt* einer profileimage-Datei ändert, ohne
 * dass ihr Name sich ändert. Nginx liefert `/images/**` mit
 * `cache-control: public, immutable, max-age=31536000` aus — ein neu
 * gezeichnetes `1.webp` bliebe sonst ein Jahr lang als altes Bild im Browser
 * jeder Person, die es vorher schon einmal gesehen hat. Genau das ist mit
 * Feuri (32590f7c5) und Junas Badge (b11374637) passiert: die Bytes auf
 * gruenerator.eu waren korrekt, die Caches gaben sie nur nicht mehr her.
 */
export const AVATAR_ASSET_VERSION = 2;

export const getRobotAvatarPath = (robotId: number): string => {
  const id = validateRobotId(robotId);
  // WebP (256px) — the source SVGs were 1–4 MB each (embedded full-res PNGs);
  // re-encoded to ~10 KB WebP. Supported by all current browsers and expo-image.
  return `/images/profileimages/${id}.webp?v=${AVATAR_ASSET_VERSION}`;
};

export const getRobotAvatarUrl = (robotId: number, baseUrl?: string): string => {
  const base = baseUrl || DEFAULT_BASE_URL;
  return `${base}${getRobotAvatarPath(robotId)}`;
};

export const getAvatarDisplayProps = (
  profile: AvatarProfile | null | undefined
): AvatarDisplayProps => {
  const { avatar_robot_id, display_name, email } = profile || {};

  if (shouldShowRobotAvatar(avatar_robot_id)) {
    const robotId = validateRobotId(avatar_robot_id);
    return {
      type: 'robot',
      robotId,
      alt: getRobotAvatarAlt(robotId),
    };
  }

  return {
    type: 'initials',
    initials: getInitials(display_name, email),
  };
};
