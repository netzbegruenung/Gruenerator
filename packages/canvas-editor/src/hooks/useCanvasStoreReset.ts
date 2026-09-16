/**
 * useCanvasStoreReset - setzt den Store einer Flaeche zurueck, wenn sie
 * verschwindet oder ihre Vorlage wechselt.
 *
 * Hiess `useCanvasStoreSetup` und meldete daneben den Stage-Ref bei
 * `canvasRefRegistry` an. Diese Registrierung ist mit #3406 gefallen: die
 * Registry war nach `config.id` verschluesselt, also nach Vorlagen-TYP statt
 * nach Flaeche. Zwei Flaechen derselben Vorlage (zwei Seiten eines Decks, oder
 * Studio plus Chat-Vorschau) ueberschrieben einander, und das Aushaengen der
 * zweiten loeschte den gemeinsamen Schluessel — die erste war danach gar nicht
 * mehr eingetragen. Gelesen hat den Eintrag niemand: Export, Vorschau und
 * Aufnahme laufen ueber den imperativen Ref (`GenericCanvasRef.captureCanvas`
 * bzw. `CanvasStageRef.toDataURL`).
 *
 * Das Zuruecksetzen blieb, samt seines Schluessels: `resetKey` ist die
 * `config.id` der Flaeche (oder `null` fuer Vorschauen, die keinen Wechsel
 * kennen). Wechselt er, laeuft dasselbe Aufraeumen wie beim Aushaengen — das
 * ist genau das Verhalten von vorher, nur ohne die Registry daneben.
 */

import { useEffect } from 'react';

import { useCanvasStore } from '../stores/CanvasStoreProvider';

export function useCanvasStoreReset(resetKey: string | null): void {
  const store = useCanvasStore();

  useEffect(() => {
    return () => {
      store.getState().resetStore();
    };
  }, [resetKey, store]);
}
