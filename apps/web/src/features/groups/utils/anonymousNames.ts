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

function simpleHash(str: string): number {
  let hash = 0;
  if (!str || str.length === 0) return hash;

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

interface Member {
  user_id?: string;
  first_name?: string;
  display_name?: string;
}

export function generateAnonymousName(userId: string | null | undefined): string {
  if (!userId) return 'Anonymer Benutzer';

  const hash = simpleHash(userId);
  const animalIndex = hash % animals.length;
  const adjectiveIndex = Math.floor(hash / animals.length) % adjectives.length;

  return `Anonymer ${adjectives[adjectiveIndex]} ${animals[animalIndex]}`;
}

export function getMemberDisplayName(member: Member | null | undefined): string {
  if (!member) return 'Unbekannter Benutzer';

  if (member.first_name?.trim()) return member.first_name.trim();
  if (member.display_name?.trim()) return member.display_name.trim();

  return generateAnonymousName(member.user_id);
}

export function sortMembersByName<T extends Member>(members: T[]): T[] {
  if (!Array.isArray(members)) return [];

  return [...members].sort((a, b) => {
    const nameA = getMemberDisplayName(a);
    const nameB = getMemberDisplayName(b);

    const aIsAnonymous = nameA.startsWith('Anonymer');
    const bIsAnonymous = nameB.startsWith('Anonymer');

    if (aIsAnonymous && !bIsAnonymous) return 1;
    if (!aIsAnonymous && bIsAnonymous) return -1;

    return nameA.localeCompare(nameB, 'de');
  });
}
