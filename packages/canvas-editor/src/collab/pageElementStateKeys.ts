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
 * Die Liste ist bewusst `CARRIED_INSTANCE_KEYS` selbst, nicht eine zweite
 * handgepflegte Aufzählung: `carryInstanceState` ist die Stelle, die beim
 * Wiederaufbau (`createInitialState`) genau diese Sammlungen zurückliest. Was
 * hier stünde und dort fehlte, wäre ein toter Schreibvorgang; umgekehrt ein
 * stiller Datenverlust. Genau so war es bis #3420 für `layerOrder`, das hier
 * von Hand angehängt war und das nur zwei Vorlagen zurücklasen.
 */
export const PAGE_ELEMENT_STATE_KEYS = CARRIED_INSTANCE_KEYS;
