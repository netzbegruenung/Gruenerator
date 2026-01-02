import {
  ROBOT_ID_MIN,
  ROBOT_ID_MAX,
  DEFAULT_ROBOT_ID,
  type AvatarDisplayProps,
  type AvatarProfile,
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

export const getRobotAvatarAlt = (robotId: number): string => {
  return `Roboter Avatar ${validateRobotId(robotId)}`;
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
      return (nameParts[0].charAt(0) + nameParts[nameParts.length - 1].charAt(0)).toUpperCase();
    }
    return displayName.substring(0, 2).toUpperCase();
  }
  if (email) {
    return email.substring(0, 2).toUpperCase();
  }
  return 'U';
};

export const getRobotAvatarPath = (robotId: number): string => {
  const id = validateRobotId(robotId);
  return `/images/profileimages/${id}.svg`;
};

export const getRobotAvatarUrl = (robotId: number, baseUrl?: string): string => {
  const base = baseUrl || DEFAULT_BASE_URL;
  return `${base}${getRobotAvatarPath(robotId)}`;
};

export const getAvatarDisplayProps = (profile: AvatarProfile | null | undefined): AvatarDisplayProps => {
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
