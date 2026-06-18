/**
 * Zentrale Texte für KI-Transparenzhinweise (EU AI Act / KI-VO Art. 50).
 *
 * Ansatz (risikobasiert):
 * - Bilder/Deepfakes: sichtbar als „KI-Generiert" gekennzeichnet. Wird die
 *   Kennzeichnung entfernt, liegt die Offenlegungspflicht bei der Nutzer:in.
 * - Texte zu Themen öffentlichen Interesses: Offenlegung nur ohne menschliche
 *   Prüfung. Da Nutzer:innen Texte prüfen und unter eigener redaktioneller
 *   Verantwortung veröffentlichen, genügt ein dezenter Hinweis am Eingabefeld.
 */

export const KI_TRANSPARENZ_PATH = '/ki-transparenz';

export const AI_TRANSPARENCY = {
  /** Dezenter Hinweis unter den Prompt-Eingaben der Text-Generatoren. */
  inputHint:
    'Mit KI erstellt – bitte vor Veröffentlichung prüfen. Die redaktionelle Verantwortung liegt bei Dir.',
  /** Linktext zur KI-Transparenz-Seite. */
  inputHintLink: 'Mehr zur KI-Transparenz',
  /** Warnung, wenn die sichtbare KI-Kennzeichnung bei Bildern auf „keine" steht. */
  imageNoneWarning:
    'Ohne Kennzeichnung bist Du selbst verpflichtet, das Bild als KI-generiert zu kennzeichnen (Art. 50 KI-VO).',
} as const;
