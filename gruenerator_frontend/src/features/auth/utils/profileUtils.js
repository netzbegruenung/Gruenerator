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
      
      // Versuche zuerst, das existierende Profil zu laden
      const { data, error } = await templatesSupabase
        .from('profiles')
        .select('display_name, first_name, last_name, avatar_robot_id')
        .eq('id', userId)
        .maybeSingle(); // maybeSingle() gibt null zurück wenn kein Eintrag existiert
      
      if (error) {
        console.error('[ProfileData] Fehler beim Laden:', error);
        throw new Error(error.message || 'Fehler beim Laden der Profildaten.');
      }
      
      // Wenn Profil existiert, gib es zurück
      if (data) {
        return data;
      }
      
      // Wenn kein Profil existiert, erstelle automatisch eines
      console.log('[ProfileData] Kein Profil gefunden für User ID:', userId, '- Erstelle neues Profil');
      
      try {
        const { data: newProfile, error: createError } = await templatesSupabase
          .from('profiles')
          .insert({
            id: userId,
            avatar_robot_id: 1, // Standard-Avatar
            updated_at: new Date().toISOString()
          })
          .select('display_name, first_name, last_name, avatar_robot_id')
          .single();
        
        if (createError) {
          // Falls Profil bereits von Trigger erstellt wurde (Race Condition)
          if (createError.code === '23505') { // Unique constraint violation
            console.log('[ProfileData] Profil wurde bereits erstellt, lade es erneut');
            const { data: existingProfile, error: refetchError } = await templatesSupabase
              .from('profiles')
              .select('display_name, first_name, last_name, avatar_robot_id')
              .eq('id', userId)
              .single();
            
            if (refetchError) {
              throw new Error('Profil konnte nicht geladen werden nach Erstellung.');
            }
            return existingProfile;
          }
          
          console.error('[ProfileData] Fehler beim Erstellen des Profils:', createError);
          throw new Error(createError.message || 'Fehler beim Erstellen des Profils.');
        }
        
        console.log('[ProfileData] Neues Profil erfolgreich erstellt:', newProfile);
        return newProfile;
        
      } catch (insertError) {
        console.error('[ProfileData] Unerwarteter Fehler beim Profil-Setup:', insertError);
        
        // Als letzter Fallback: Ein virtuelles Profil zurückgeben
        console.log('[ProfileData] Fallback: Erstelle virtuelles Profil');
        return {
          display_name: null,
          first_name: null,
          last_name: null,
          avatar_robot_id: 1
        };
      }
    },
    enabled: !!userId && !!templatesSupabase,
    staleTime: 5 * 60 * 1000,
    cacheTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: (failureCount, error) => {
      // Versuche bis zu 2x erneut, aber nicht bei Profil-Erstellungsfehlern
      if (error?.message?.includes('Erstellen') || failureCount >= 2) {
        return false;
      }
      return failureCount < 2;
    }
  });
}; 