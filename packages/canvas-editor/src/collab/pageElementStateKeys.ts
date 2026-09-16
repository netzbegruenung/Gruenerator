import { CARRIED_INSTANCE_KEYS } from '../configs/factory/carryInstanceState';

/**
 * Die Zustandsschlüssel, die eine Seite selbst nach außen tragen muss.
 *
 * Textfelder einer Vorlage erreichen `pages[i].state` über ihr `on<Key>Change`
 * beim Host (siehe `wrapCallbacksWithPageSync`). Freie Elemente tun das nicht:
 * `createActions` ändert sie ausschließlich über `setState` im
 * Komponentenzustand, kein Host erklärt je einen Callback dafür. Bis #3416 gab
 * es deshalb keinen einzigen Pfad aus dem Editor in das Dokument — die Elemente
 * standen auf der Fläche und waren nach dem Neuladen weg.
 *
 * Die Liste ist bewusst `CARRIED_INSTANCE_KEYS` plus `layerOrder`, nicht eine
 * zweite handgepflegte Aufzählung: `carryInstanceState` ist die Stelle, die
 * beim Wiederaufbau (`createInitialState`) genau diese Sammlungen zurückliest.
 * Was hier steht und dort fehlt, wäre ein toter Schreibvorgang; umgekehrt ein
 * stiller Datenverlust.
 *
 * `layerOrder` hält die z-Reihenfolge eben dieser Elemente und steht deshalb
 * dabei — aber nur `dreizeilen` und `freeform` lesen es in `createInitialState`
 * zurück (gemessen 09/2026; die Fabriken `createColorTwoTextCanvas`,
 * `createImageTwoTextCanvas`, `slider` und `veranstaltung` nehmen es nicht aus
 * den Props). Für die übrigen Vorlagen ist der Schreibvorgang bis dahin ohne
 * Wirkung — nicht falsch, nur noch nicht abgeholt.
 */
export const PAGE_ELEMENT_STATE_KEYS = [...CARRIED_INSTANCE_KEYS, 'layerOrder'] as const;
