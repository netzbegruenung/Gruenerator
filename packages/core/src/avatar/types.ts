export interface AvatarDisplayProps {
  type: 'robot' | 'initials';
  robotId?: number;
  initials?: string;
  alt?: string;
}

export interface AvatarProfile {
  avatar_robot_id?: string | number;
  display_name?: string;
  email?: string;
}

export const ROBOT_ID_MIN = 1;
// Bumped 10 → 13 for the Pride-month avatars (11, 12, 13). This is the single
// source of truth: utils (getAllRobotIds/getRandomRobotId/validateRobotId),
// the contracts Zod bounds, and the backend validation all derive from it.
export const ROBOT_ID_MAX = 13;
export const DEFAULT_ROBOT_ID = 1;
