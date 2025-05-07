/**
 * Utility functions for the profile feature.
 */

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