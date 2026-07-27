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

/** A named avatar character — the "Grünerator Friends" cast. */
export interface GrueneratorFriend {
  /** Same id as the avatar_robot_id / image file name. */
  id: number;
  name: string;
  /** One-liner shown under the name in the picker. */
  tagline: string;
  /** Only unlockable friends set this; the UI decides how to gate them. */
  unlock?: 'wolke';
}

/**
 * The cast, in display order. Ids match `/images/profileimages/<id>.webp` and
 * cover exactly ROBOT_ID_MIN…ROBOT_ID_MAX — adding an avatar means adding an
 * entry here and bumping ROBOT_ID_MAX.
 */
export const GRUENERATOR_FRIENDS: readonly GrueneratorFriend[] = [
  { id: 1, name: 'Grüni', tagline: 'Der Klassiker — war von Anfang an dabei.' },
  { id: 2, name: 'Sprossi', tagline: 'Trägt den Trieb im Kopf und wächst mit dir.' },
  { id: 3, name: 'Mia', tagline: 'Grünis Zwilling, nur eine Spur ruhiger.' },
  { id: 4, name: 'Pulsi', tagline: 'Hat den Puls der Zeit direkt auf dem Bauch.' },
  { id: 5, name: 'Kleks', tagline: 'Frisch lackiert — die Farbe tropft noch.' },
  { id: 6, name: 'Kosmo', tagline: 'Grünerator im All: Helm auf, Winken an.' },
  { id: 7, name: 'Buddy', tagline: 'Kommt nie allein — Mensch und Bot im Team.' },
  { id: 8, name: 'Goldi', tagline: 'Retro-Charme in Gelbgrün.' },
  { id: 9, name: 'Winki', tagline: 'Winkt dir zu, bevor du etwas sagst.' },
  {
    id: 10,
    name: 'Wolki',
    tagline: 'Sonne über der Wolke — verbinde deine Wolke.',
    unlock: 'wolke',
  },
  { id: 11, name: 'Rio', tagline: 'Pride-Edition: Flagge zeigen.' },
  { id: 12, name: 'Juna', tagline: 'Pride-Edition: Regenbogen zum Anlehnen.' },
  { id: 13, name: 'Bunti', tagline: 'Pride-Edition: zieht den Regenbogen hinter sich her.' },
];
