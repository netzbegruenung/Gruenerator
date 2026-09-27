/**
 * Transparenz-Texte für KI-Bilder (Art. 50 KI-VO), an einer Stelle für Web und
 * Mobile — dieselbe Auswahl („KI-Kennzeichnung") gibt es auf beiden Plattformen,
 * und sie darf nicht in zwei Formulierungen auseinanderlaufen.
 *
 * Der Wortlaut folgt dem öffentlichen KI-Hinweis (Stand 09.07.2026); die Seite
 * dazu liegt unter /ki-transparenz.
 */

export const AI_IMAGE_TRANSPARENCY = {
  /**
   * Steht die sichtbare Kennzeichnung auf „keine". Zwei Aussagen, beide
   * tragend: die Offenlegungspflicht wandert zur Nutzer*in (Art. 50 Abs. 4),
   * und die maschinenlesbare Kennzeichnung bleibt trotzdem in der Datei
   * (Art. 50 Abs. 2) — sonst liest sich „Keine Kennzeichnung" als „gar keine".
   */
  labelRemovedWarning:
    'Ohne sichtbare Kennzeichnung bist Du selbst verpflichtet, den KI-Ursprung offenzulegen, wenn Du ein realistisches Bild („Deepfake") veröffentlichst (Art. 50 Abs. 4 KI-VO). Eine maschinenlesbare KI-Kennzeichnung bleibt in den Metadaten des Bildes erhalten.',

  /** Kurzform für enge Flächen (Mobile-Bögen, Tooltips). */
  labelRemovedWarningShort:
    'Ohne sichtbare Kennzeichnung musst Du Deepfakes selbst als KI-Bild kennzeichnen (Art. 50 Abs. 4 KI-VO). Die Metadaten bleiben gekennzeichnet.',
} as const;
