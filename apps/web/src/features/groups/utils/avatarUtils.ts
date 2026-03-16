export const getRobotAvatarPath = (robotId: number | null | undefined): string => {
  const id = Math.max(1, Math.min(9, robotId || 1));
  return `/images/profileimages/${id}.svg`;
};

export const validateRobotId = (robotId: number | string | null | undefined): number => {
  const id = parseInt(String(robotId));
  return id >= 1 && id <= 9 ? id : 1;
};

export const getRobotAvatarAlt = (robotId: number): string => {
  return `Roboter Avatar ${validateRobotId(robotId)}`;
};
