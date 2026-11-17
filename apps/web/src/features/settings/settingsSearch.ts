import { foldUmlauts } from '@gruenerator/shared/utils';

import { settingsForPlatform } from './settingsCatalog';
import { type SettingsTab } from './settingsDialogStore';
import { TAB_ALIASES } from './settingsTabAliases';

export interface SettingsSearchHit {
  /** Eindeutig über alle Treffer: Reiter oder Reiter + Zeile. */
  key: string;
  tab: SettingsTab;
  /** Titel der Zeile bzw. Name des Reiters. */
  title: string;
  /** Name des Reiters bei Zeilen-Treffern; Reiter-Treffer tragen ihn schon im Titel. */
  tabLabel: string | null;
  /** Katalog-Id der Zeile, zu der gescrollt wird. Null bei Reiter-Treffern. */
  rowId: string | null;
}

export const SETTINGS_SEARCH_LIMIT = 20;

// Zwei Schreibweisen: „Grünerator" wird zu „gruenerator" (foldUmlauts wie in
// der Funktionssuche) und zu „grunerator" (Akzente weg). Wer „grunerator" tippt,
// meint dasselbe wie „gruenerator"; ein Wort passt, wenn eine der beiden passt.
function normalize(value: string): string[] {
  const lower = value.toLowerCase();
  const plain = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return [foldUmlauts(lower), plain];
}

function includesWord(haystack: string[], word: string[]): boolean {
  return word.some((variant, i) => haystack[i].includes(variant));
}

/**
 * Sucht über die sichtbaren Reiter und die Zeilen des Katalogs. Jedes Wort der
 * Eingabe muss in Titel, Beschreibung oder Reiter-Name vorkommen. Reihenfolge:
 * Reiter zuerst, dann Titel-Treffer, dann Treffer nur in der Beschreibung.
 * Reiter, die die Seitenleiste gerade nicht führt, liefern keine Treffer.
 */
export function searchSettings(
  query: string,
  navEntries: readonly { value: SettingsTab; label: string }[]
): SettingsSearchHit[] {
  const words = query.trim().split(/\s+/).filter(Boolean).map(normalize);
  if (words.length === 0) return [];

  const hits: SettingsSearchHit[] = [];

  for (const entry of navEntries) {
    // Frühere Namen des Reiters zählen wie sein Label: wer „mcp" oder „barriere"
    // tippt, landet dort, wo das Gesuchte heute steht.
    const aliases = Object.entries(TAB_ALIASES)
      .filter(([, target]) => target === entry.value)
      .map(([name]) => name);
    const label = normalize(`${entry.label} ${aliases.join(' ')}`);
    if (words.every((w) => includesWord(label, w))) {
      hits.push({
        key: entry.value,
        tab: entry.value,
        title: entry.label,
        tabLabel: null,
        rowId: null,
      });
    }
  }

  const tabLabels = new Map(navEntries.map((e) => [e.value, e.label]));
  const inTitle: SettingsSearchHit[] = [];
  const inDescription: SettingsSearchHit[] = [];

  for (const row of settingsForPlatform('web')) {
    const tabLabel = tabLabels.get(row.tab);
    if (tabLabel === undefined) continue;
    const title = normalize(row.title);
    const full = normalize(`${row.title} ${row.description ?? ''} ${tabLabel}`);
    if (!words.every((w) => includesWord(full, w))) continue;
    const hit = { key: row.id, tab: row.tab, title: row.title, tabLabel, rowId: row.id };
    (words.every((w) => includesWord(title, w)) ? inTitle : inDescription).push(hit);
  }

  return [...hits, ...inTitle, ...inDescription].slice(0, SETTINGS_SEARCH_LIMIT);
}
