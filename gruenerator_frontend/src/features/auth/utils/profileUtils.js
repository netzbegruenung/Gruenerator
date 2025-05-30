/**
 * Utility functions for the profile feature.
 */

import { getRobotAvatarPath, validateRobotId, getRobotAvatarAlt } from './avatarUtils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSupabaseAuth } from '../../../context/SupabaseAuthContext';

/**
 * Generates initials from first name, last name, or email.
 * @param {string} fname - First name.
 * @param {string} lname - Last name.
 * @param {string} mail - Email address.
 * @returns {string} The generated initials (e.g., "FL", "F", "L", "E", or "?").
 */
export const getInitials = (fname, lname, mail) => {
    const firstInitial = fname ? fname.charAt(0).toUpperCase() : '';
    const lastInitial = lname ? lname.charAt(0).toUpperCase() : '';
    if (firstInitial && lastInitial) {
      return `${firstInitial}${lastInitial}`;
    } else if (firstInitial || lastInitial) {
        return firstInitial || lastInitial;
    } else if (mail) {
        return mail.charAt(0).toUpperCase();
    }
    return '?'; // Fallback if no name or email is provided
};

/**
 * Determines whether to show a robot avatar or initials
 * @param {number} avatarRobotId - The robot avatar ID
 * @returns {boolean} True if robot avatar should be shown
 */
export const shouldShowRobotAvatar = (avatarRobotId) => {
  return avatarRobotId && avatarRobotId >= 1 && avatarRobotId <= 9;
};

/**
 * Gets the avatar display properties (robot or initials)
 * @param {object} profile - User profile object
 * @returns {object} Avatar display properties
 */
export const getAvatarDisplayProps = (profile) => {
  const { avatar_robot_id, first_name, last_name, email } = profile || {};
  
  if (shouldShowRobotAvatar(avatar_robot_id)) {
    return {
      type: 'robot',
      src: getRobotAvatarPath(avatar_robot_id),
      alt: getRobotAvatarAlt(avatar_robot_id),
      robotId: validateRobotId(avatar_robot_id)
    };
  }
  
  return {
    type: 'initials',
    initials: getInitials(first_name, last_name, email)
  };
};

export const useProfileData = (userId, templatesSupabase) => {
  return useQuery({
    queryKey: ['profileData', userId],
    queryFn: async () => {
      if (!userId || !templatesSupabase) throw new Error('Kein User oder Supabase Client');
      const { data, error } = await templatesSupabase
        .from('profiles')
        .select('display_name, first_name, last_name, avatar_robot_id, email')
        .eq('id', userId)
        .single();
      if (error) throw new Error(error.message || 'Fehler beim Laden der Profildaten.');
      return data;
    },
    enabled: !!userId && !!templatesSupabase,
    staleTime: 5 * 60 * 1000,
    cacheTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
}; 