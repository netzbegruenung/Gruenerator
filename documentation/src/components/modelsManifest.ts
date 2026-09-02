import manifestJson from '@site/src/generated/models.json';

export type Role = 'primary' | 'fallback' | 'overflow';

export interface ModelEntry {
  /** The model id exactly as the code spells it. */
  model: string;
  /** The same id, trimmed for display. */
  code: string;
  label: string;
  provider: string;
  host: string;
  flag: string;
  role: Role;
}

export interface Row {
  id: string;
  task: string;
  models: ModelEntry[];
}

export interface Manifest {
  rows: Row[];
  hosts: string[];
}

/**
 * The routing manifest that `models:generate` writes from the routing code —
 * shared source for `<ModelTable />` and `<ProviderTasks />`, so both render
 * the same shape instead of re-declaring it.
 */
export const manifest = manifestJson as unknown as Manifest;

/**
 * Die Anbieter, die eine Seite mit `<ProviderTasks host="…" />` ansprechen darf.
 *
 * Die Namen sind Kopien aus `PROVIDER_HOSTS` in `scripts/generate-models.mjs` —
 * sie MÜSSEN es sein, weil ein JSON-Import in TypeScript zu `string` verbreitert
 * wird und aus `manifest.hosts` deshalb keine Literal-Union abzuleiten ist. Damit
 * die Kopie nicht still altert, prüft der Wächter darunter sie gegen die
 * generierte Datei: Ein neuer oder umbenannter Anbieter kostet eine Zeile hier,
 * und der Docs-Build sagt welche — dieselbe Abmachung, die der Generator für ein
 * neues Modell trifft.
 */
export const PROVIDER_HOSTS = [
  'Black Forest Labs',
  'Cortecs',
  'GreenPT',
  'Mistral AI',
  'Regolo',
  'Scaleway',
] as const;

export type ProviderHost = (typeof PROVIDER_HOSTS)[number];

/**
 * Wächter gegen die Umbenennung. Ohne ihn führt ein in `generate-models.mjs`
 * umbenannter Anbieter dazu, dass die Union den ALTEN Namen weiter akzeptiert:
 * Der Aufruf in der MDX-Datei typprüft sauber, findet keine Zeile mehr und die
 * Rolle verschwände lautlos von einer öffentlichen Seite — genau der Ausfall,
 * gegen den `<ProviderTasks />` gebaut wurde.
 */
const unknownHosts = [
  ...new Set(manifest.rows.flatMap((row) => row.models.map((entry) => entry.host))),
].filter((host) => !(PROVIDER_HOSTS as readonly string[]).includes(host));

if (unknownHosts.length > 0) {
  throw new Error(
    `models.json nennt Anbieter, die PROVIDER_HOSTS nicht kennt: ${unknownHosts.join(', ')}. ` +
      `Neuer oder umbenannter Anbieter in scripts/generate-models.mjs? Dann hier nachziehen — ` +
      `und die Abschnitte in documentation/docs/basics/nachhaltigkeit.md mitprüfen.`
  );
}
