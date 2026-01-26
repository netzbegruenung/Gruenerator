/**
 * Anonymous Name Generation Utility
 * Generates consistent animal-based names for users without first names
 * Used for privacy in group member lists
 */

// German animal names for anonymization
const animals = [
  'Fuchs',
  'Igel',
  'Eule',
  'Dachs',
  'Hase',
  'Reh',
  'Eichhörnchen',
  'Bär',
  'Wolf',
  'Hirsch',
  'Fischotter',
  'Marder',
  'Biber',
  'Luchs',
  'Wildkatze',
  'Feldhamster',
  'Spitzmaus',
  'Fledermaus',
  'Maulwurf',
  'Wiesel',
];

// German adjectives for anonymization
const adjectives = [
  'Grüner',
  'Flinker',
  'Weiser',
  'Mutiger',
  'Freundlicher',
  'Stiller',
  'Bunter',
  'Neugieriger',
  'Tapferer',
  'Kluger',
  'Sanfter',
  'Lebhafter',
  'Aufmerksamer',
  'Beherzter',
  'Geschickter',
  'Ruhiger',
  'Wilder',
  'Zarter',
];

/**
 * Simple hash function for consistent name generation
 * @param {string} str - String to hash
 * @returns {number} Hash value
 */
function simpleHash(str) {
  let hash = 0;
  if (!str || str.length === 0) return hash;

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Generates a consistent anonymous name for a user
 * Uses user ID to ensure the same user always gets the same anonymous name
 * @param {string} userId - User's unique identifier
 * @returns {string} Anonymous name like "Anonymer Grüner Fuchs"
 */
export function generateAnonymousName(userId) {
  if (!userId) {
    return 'Anonymer Benutzer';
  }

  const hash = simpleHash(userId);

  // Use hash to consistently select adjective and animal
  const animalIndex = hash % animals.length;
  const adjectiveIndex = Math.floor(hash / animals.length) % adjectives.length;

  const animal = animals[animalIndex];
  const adjective = adjectives[adjectiveIndex];

  return `Anonymer ${adjective} ${animal}`;
}

/**
 * Gets display name for a group member
 * Returns real first name if available, otherwise generates anonymous name
 * @param {Object} member - Member object with user_id and first_name
 * @returns {string} Display name for the member
 */
export function getMemberDisplayName(member) {
  if (!member) {
    return 'Unbekannter Benutzer';
  }

  // Use first_name if available and not empty
  if (member.first_name && member.first_name.trim()) {
    return member.first_name.trim();
  }

  // Use display_name as fallback if available
  if (member.display_name && member.display_name.trim()) {
    return member.display_name.trim();
  }

  // Generate anonymous name based on user_id
  return generateAnonymousName(member.user_id);
}

/**
 * Gets member initials for avatars
 * Returns real name initials if available, otherwise animal initials
 * @param {Object} member - Member object with user_id and first_name
 * @returns {string} 1-2 character initials
 */
export function getMemberInitials(member) {
  if (!member) {
    return '?';
  }

  // Use first_name if available
  if (member.first_name && member.first_name.trim()) {
    return member.first_name.trim().charAt(0).toUpperCase();
  }

  // Use display_name as fallback
  if (member.display_name && member.display_name.trim()) {
    return member.display_name.trim().charAt(0).toUpperCase();
  }

  // For anonymous names, use the first letter of the animal
  const anonymousName = generateAnonymousName(member.user_id);
  // Extract the animal (last word) and get its first letter
  const words = anonymousName.split(' ');
  const animal = words[words.length - 1];
  return animal.charAt(0).toUpperCase();
}

/**
 * Sorts members by display name (real names first, then anonymous names)
 * @param {Array} members - Array of member objects
 * @returns {Array} Sorted members array
 */
export function sortMembersByName(members) {
  if (!Array.isArray(members)) {
    return [];
  }

  return members.sort((a, b) => {
    const nameA = getMemberDisplayName(a);
    const nameB = getMemberDisplayName(b);

    // Real names come before anonymous names
    const aIsAnonymous = nameA.startsWith('Anonymer');
    const bIsAnonymous = nameB.startsWith('Anonymer');

    if (aIsAnonymous && !bIsAnonymous) return 1;
    if (!aIsAnonymous && bIsAnonymous) return -1;

    // Within each category, sort alphabetically
    return nameA.localeCompare(nameB, 'de');
  });
}

export default {
  generateAnonymousName,
  getMemberDisplayName,
  getMemberInitials,
  sortMembersByName,
};
