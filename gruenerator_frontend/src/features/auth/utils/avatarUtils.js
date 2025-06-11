// Utility functions for robot avatar management

/**
 * Get the image path for a robot avatar
 * @param {number} robotId - The robot ID (1-9)
 * @returns {string} The path to the robot SVG
 */
export const getRobotAvatarPath = (robotId) => {
  const id = Math.max(1, Math.min(9, robotId || 1));
  return `/images/profileimages/${id}.svg`;
};

/**
 * Get a fallback robot ID if the provided ID is invalid
 * @param {number} robotId - The robot ID to validate
 * @returns {number} Valid robot ID (1-9)
 */
export const validateRobotId = (robotId) => {
  const id = parseInt(robotId);
  return (id >= 1 && id <= 9) ? id : 1;
};

/**
 * Generate alt text for a robot avatar
 * @param {number} robotId - The robot ID
 * @returns {string} Alt text for the avatar
 */
export const getRobotAvatarAlt = (robotId) => {
  return `Roboter Avatar ${validateRobotId(robotId)}`;
};

/**
 * Get all available robot IDs
 * @returns {number[]} Array of robot IDs
 */
export const getAllRobotIds = () => {
  return [1, 2, 3, 4, 5, 6, 7, 8, 9];
};

/**
 * Get a random robot ID (useful for new users)
 * @returns {number} Random robot ID between 1-9
 */
export const getRandomRobotId = () => {
  return Math.floor(Math.random() * 9) + 1;
}; 