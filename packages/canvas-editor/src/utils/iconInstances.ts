/**
 * Icons als Instanzen.
 *
 * Ein Icon lag lange nur unter seiner KATALOG-ID auf der Fläche: `selectedIcons`
 * führte die Katalog-ID, `iconStates` war damit verschlüsselt, und
 * `CanvasRenderLayer` schlug genau darüber im Katalog nach. Dasselbe Icon konnte
 * es pro Fläche deshalb nur einmal geben — eine Kopie mit frischer ID fand keine
 * Definition und zeichnete nichts: kein Fehler, nur ein unsichtbares Element,
 * das trotzdem eine Auswahl-ID belegt (#3404).
 *
 * Seither ist die ID in `selectedIcons` eine INSTANZ-ID, und `IconState.iconId`
 * sagt, welches Katalog-Icon sie zeigt. Alte Dokumente tragen kein `iconId`;
 * für sie IST die Instanz-ID die Katalog-ID. Daher überall `iconId ?? id` und
 * keine Migration — `selectedIcons` bestehender Dokumente umzuschreiben würde
 * aus einer freien Änderung eine Datenwanderung machen.
 *
 * Reine Zustandsfunktionen, absichtlich ohne Import aus `canvasIcons`: der
 * Katalog zieht `@iconify` nach und hat in der Node-Lane nichts zu suchen.
 */

import type { IconDef } from './canvasIcons';
import type { IconState } from '../configs/factory/baseTypes';

/**
 * Zum Auflösen zählt nur dieses eine Feld. Der Renderer hält seinen eigenen,
 * lockereren Zustandstyp (alles optional) — der passt hier herein, ohne dass
 * die Auflösung zweimal geschrieben werden muss.
 */
type IconIdCarrier = { iconId?: string };

/** Welches Katalog-Icon zeigt diese Instanz? */
export function catalogIconId(
  instanceId: string,
  iconStates: Record<string, IconIdCarrier> | undefined
): string {
  return iconStates?.[instanceId]?.iconId ?? instanceId;
}

/**
 * Die Katalog-IDs, die gerade auf der Fläche liegen — je einmal, in der
 * Reihenfolge ihres ersten Auftretens. Das ist, was die Seitenleiste als
 * „ausgewählt" anzeigt: sie zeigt den Katalog, nicht die Fläche, und drei
 * Kopien desselben Icons sind dort ein Eintrag.
 */
export function selectedCatalogIconIds(
  selectedIcons: string[] | undefined,
  iconStates: Record<string, IconIdCarrier> | undefined
): string[] {
  const seen = new Set<string>();
  for (const id of selectedIcons ?? []) {
    seen.add(catalogIconId(id, iconStates));
  }
  return [...seen];
}

/**
 * Welche Instanzen trifft ein Abwählen von `targetId`?
 *
 * Aus der Seitenleiste kommt eine Katalog-ID: gemeint sind alle Kopien, denn
 * dort steht nur ein Eintrag zum Anklicken. Aus dem Entf-Zweig kommt eine
 * Instanz-ID: gemeint ist genau diese eine. Beides erledigt dieselbe Regel,
 * weil die Instanz-ID einer Kopie niemals die Katalog-ID einer anderen ist.
 */
export function iconInstanceIdsFor(
  targetId: string,
  selectedIcons: string[] | undefined,
  iconStates: Record<string, IconIdCarrier> | undefined
): string[] {
  return (selectedIcons ?? []).filter(
    (id) => id === targetId || catalogIconId(id, iconStates) === targetId
  );
}

/**
 * Färbt jede Instanz eines Katalog-Icons um und gibt `iconStates` neu zurück.
 *
 * Der Slider backt die Pfeilfarbe seines Farbschemas in `iconStates` ein. Ein
 * Zugriff über die Katalog-ID allein erreicht dabei nur das erste Exemplar —
 * eine Kopie trägt eine andere Instanz-ID und bliebe in der alten Farbe stehen,
 * sichtbar nebeneinander auf derselben Fläche.
 */
export function recolorIconInstances(
  iconStates: Record<string, IconState>,
  catalogId: string,
  color: string
): Record<string, IconState> {
  const next = { ...iconStates };
  for (const id of Object.keys(next)) {
    if (catalogIconId(id, next) === catalogId) {
      next[id] = { ...next[id], color };
    }
  }
  return next;
}

/**
 * Die Katalog-Definition, die eine Instanz zeichnet — oder `null`.
 *
 * Genau hier lag #3404: `CanvasRenderLayer` schlug mit der INSTANZ-ID im Katalog
 * nach, `getIconMapSync()?.[item.id]`. Für das erste Exemplar ging das gut, weil
 * dessen Instanz-ID die Katalog-ID IST; eine Kopie mit frischer ID fand nichts
 * und der Zweig gab `null` zurück — kein Fehler, nur ein unsichtbares Element.
 * Der Katalog kommt als Parameter herein, damit diese Auflösung ohne `@iconify`
 * prüfbar bleibt.
 */
export function resolveIconDef(
  instanceId: string,
  iconStates: Record<string, IconIdCarrier> | undefined,
  iconMap: Record<string, IconDef> | null | undefined
): IconDef | null {
  return iconMap?.[catalogIconId(instanceId, iconStates)] ?? null;
}
