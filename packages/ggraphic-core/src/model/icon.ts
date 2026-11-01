// SPDX-License-Identifier: MPL-2.0
/**
 * Zustand eines Icons auf der Seite, je Instanz in `iconStates`.
 */

export interface IconState {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  color?: string;
  opacity?: number;
  /**
   * Katalog-ID des gezeigten Icons. Fehlt sie, IST der Schlüssel in
   * `iconStates` die Katalog-ID — so liegen alle Dokumente von vor #3404 vor,
   * und so legt die Seitenleiste das erste Exemplar bis heute ab. Erst eine
   * Kopie braucht das Feld, weil sie eine frische Instanz-ID trägt. Aufgelöst
   * wird immer über `catalogIconId` in `utils/iconInstances.ts`.
   */
  iconId?: string;
  /** Mirrored about the centre (negative node scale); omit for upright. */
  flipX?: boolean;
  flipY?: boolean;
}
