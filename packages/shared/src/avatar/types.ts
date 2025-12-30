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
export const ROBOT_ID_MAX = 9;
export const DEFAULT_ROBOT_ID = 1;
