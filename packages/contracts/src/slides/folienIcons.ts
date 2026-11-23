/**
 * Die Piktogramme der Folie „Symbole“ (`symbole`): eine geschlossene Liste
 * politischer Themen, die das Modell per Schlüssel wählt. Gezeichnet werden sie
 * als Tabler-Icons (MIT, im Editor gebündelt, `@iconify-json/tabler`), also im
 * Canvas tauschbar und für alle Stile in jeder Farbe. Dass jede Id im Paket
 * existiert, prüft `canvas-editor/src/slides/folienIcons.vitest.ts`.
 *
 * Schlüssel sind F0 (stehen in gespeicherten Folien nicht, aber im Modell-Vertrag):
 * nur ergänzen, nie umbenennen. Ein unbekannter Schlüssel fällt auf `stern` zurück.
 */

export const FOLIEN_ICONS = {
  // Mobilität
  bahn: 'tabler:train',
  bus: 'tabler:bus',
  fahrrad: 'tabler:bike',
  fussweg: 'tabler:walk',
  auto: 'tabler:car',
  flugzeug: 'tabler:plane',
  // Wohnen, Stadt, Land
  haus: 'tabler:home',
  stadt: 'tabler:buildings',
  land: 'tabler:wheat',
  ort: 'tabler:map-pin',
  // Bildung, Familie, Gesundheit
  schule: 'tabler:school',
  kita: 'tabler:baby-carriage',
  familie: 'tabler:users-group',
  gesundheit: 'tabler:stethoscope',
  pflege: 'tabler:heart-handshake',
  menschen: 'tabler:users',
  person: 'tabler:user',
  // Klima, Energie, Natur
  klima: 'tabler:leaf',
  sonne: 'tabler:sun',
  wind: 'tabler:wind',
  strom: 'tabler:bolt',
  heizen: 'tabler:flame',
  wasser: 'tabler:droplet',
  wald: 'tabler:trees',
  pflanze: 'tabler:plant-2',
  tiere: 'tabler:paw',
  recycling: 'tabler:recycle',
  muell: 'tabler:trash',
  // Wirtschaft, Arbeit, Geld
  geld: 'tabler:currency-euro',
  arbeit: 'tabler:briefcase',
  fabrik: 'tabler:building-factory-2',
  einkauf: 'tabler:shopping-bag',
  essen: 'tabler:tools-kitchen-2',
  // Gesellschaft, Staat, Kultur
  demokratie: 'tabler:building-bank',
  gerechtigkeit: 'tabler:scale',
  europa: 'tabler:world',
  sicherheit: 'tabler:shield-check',
  kultur: 'tabler:masks-theater',
  sport: 'tabler:ball-football',
  herz: 'tabler:heart',
  megafon: 'tabler:speakerphone',
  // Digital, Zeit
  digital: 'tabler:device-mobile',
  daten: 'tabler:database',
  uhr: 'tabler:clock',
  kalender: 'tabler:calendar',
  haken: 'tabler:check',
  stern: 'tabler:star',
} as const;

export type FolienIconKey = keyof typeof FOLIEN_ICONS;

export const FOLIEN_ICON_KEYS = Object.keys(FOLIEN_ICONS) as [FolienIconKey, ...FolienIconKey[]];

/** Das neutrale Symbol für alles, was keinem Schlüssel gleicht. */
export const FOLIEN_ICON_FALLBACK: FolienIconKey = 'stern';

const FOLD: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

/** Ein Editor-Icon als Id (`prefix:name`), wie es ein Tausch im Canvas hinterlässt. */
const RAW_ICON_ID = /^[a-z][a-z0-9-]*:[a-z0-9-]+$/;

/**
 * Die Icon-Id zu einem Schlüssel des Modells. Groß-/Kleinschreibung und Umlaute
 * zählen nicht („Fußweg“ → `fussweg`); eine fertige Icon-Id (aus `readFolie`)
 * bleibt, was sie ist; alles andere ergibt das neutrale Symbol.
 */
export function folienIconId(key: string): string {
  const raw = key.trim().toLowerCase();
  if (RAW_ICON_ID.test(raw)) return raw;
  const folded = raw.replace(/[äöüß]/g, (c) => FOLD[c]!);
  return (FOLIEN_ICONS as Record<string, string>)[folded] ?? FOLIEN_ICONS[FOLIEN_ICON_FALLBACK];
}

/** Der Schlüssel zu einer Icon-Id; eine fremde Id (im Editor getauscht) bleibt als Id stehen. */
export function folienIconKeyOf(iconId: string): string {
  const hit = (Object.entries(FOLIEN_ICONS) as [FolienIconKey, string][]).find(
    ([, id]) => id === iconId
  );
  return hit ? hit[0] : iconId;
}
