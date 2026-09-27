/**
 * Dateiablagen, anbieterneutral.
 *
 * Das Interface trägt heute genau einen Anbieter (öffentliche Nextcloud-Shares,
 * „die Wolke") und ist so geschnitten, dass ein zweiter — IceWarp spricht WebDAV
 * unter `/webdav/<user>@<domain>/Files/` — eine Ergänzung bleibt und keine
 * Neuschreibung.
 *
 * **Es gibt keine Schreibmethoden, und das ist die Zusicherung.** Der Zugriff
 * auf fremde Ablagen ist lesend; das steht so in der Datenschutz-Auskunft und in
 * `documentation/docs/guides/fortgeschrittene/gruene-wolke-einbinden.md`. Eine
 * Schreibmethode hier einzuziehen ist deshalb keine Erweiterung, sondern eine
 * Produktentscheidung — der Guard-Test in `nextcloudApiClient.vitest.ts` ist die
 * zweite Schranke, das Fehlen von `write`/`delete`/`mkdir` in diesem Typ die erste.
 *
 * `CloudRoot` ist bewusst VERBINDUNGS- und nicht token-förmig: heute steckt in
 * `connectionId` eine Share-Link-Id, morgen kann derselbe Träger ein
 * verschlüsseltes Konto-Credential auflösen, ohne dass ein Aufrufer sich ändert.
 */

/**
 * Registry-Union (CLAUDE.md, *Naming, IDs & Renames*): Konsumenten leiten davon
 * ab, niemand deklariert die Menge neu. Ein zweiter Anbieter, der hier fehlt,
 * bricht `CLOUD_FILE_PROVIDERS` und damit den Build.
 */
export type CloudProviderId = 'nextcloud-share';

/** Woher die Wurzel kommt — eigene Verbindung oder über eine Gruppe geteilt. */
export type CloudRootOrigin = 'own' | 'group';

export interface CloudRoot {
  /** Stabile Kennung der Verbindung. Heute: die Share-Link-Id aus dem Profil. */
  connectionId: string;
  providerId: CloudProviderId;
  /** Anzeigename; leer, wenn die Person keinen vergeben hat. */
  label: string;
  /** Der Host, damit die Antwort sagen kann, WELCHE Wolke gemeint ist. */
  host: string;
  origin: CloudRootOrigin;
  isActive: boolean;
  /** Bei `origin: 'group'`: über welche Gruppe, und von wem. */
  sharedVia?: { groupName: string; sharedByName: string | null };
  /**
   * Anbieterspezifisches Geheimnis/Handle, das der Provider zum Verbinden
   * braucht. Für Aufrufer undurchsichtig — es darf NIE in eine Modellantwort
   * oder ein SSE-Ereignis wandern.
   */
  readonly secret: string;
}

export interface CloudEntry {
  /** Pfad relativ zur Wurzel, dekodiert, ohne führenden Schrägstrich. */
  path: string;
  name: string;
  isDirectory: boolean;
  size: number | null;
  mimeType: string | null;
  lastModified: Date | null;
  etag: string | null;
  /** Kann die Text-/OCR-Kette daraus Text machen? Ordner: immer false. */
  isSupported: boolean;
}

export interface CloudListing {
  entries: CloudEntry[];
  /** Unterordner, die der Lauf gesehen hat (nur bei `recursive`). */
  folderCount: number;
  /** Der Tiefendeckel hat Unterordner ungesehen gelassen. */
  depthLimited: boolean;
  /** Der Mengendeckel hat die Liste abgeschnitten. */
  truncated: boolean;
}

export interface CloudDownload {
  buffer: Buffer;
  mimeType: string | null;
  size: number;
}

export type CloudConnectionErrorCode =
  'invalid_link' | 'not_found' | 'forbidden' | 'file_drop' | 'unknown';

export interface CloudConnectionTest {
  ok: boolean;
  /** Maschinenlesbarer Grund; dieselben Codes wie die Einstellungsseite. */
  errorCode?: CloudConnectionErrorCode;
  /** Einträge in der Wurzel — der Beweis, dass wirklich etwas dahinter liegt. */
  entryCount?: number;
}

export interface CloudListOptions {
  recursive?: boolean;
  maxDepth?: number;
  maxFiles?: number;
}

export interface CloudFindQuery {
  /** Teilstring im Dateinamen, ohne Rücksicht auf Groß-/Kleinschreibung. */
  name?: string;
  /** Endungen inklusive Punkt, z. B. `['.pdf']`. */
  extensions?: string[];
  maxDepth?: number;
  maxFiles?: number;
}

/** Lesender Zugriff auf eine Dateiablage. Absichtlich ohne Schreibpfade. */
export interface CloudFileProvider {
  readonly id: CloudProviderId;
  /** Alle Wurzeln, die diese Person erreichen darf. */
  listRoots(userId: string): Promise<CloudRoot[]>;
  list(root: CloudRoot, path: string, options?: CloudListOptions): Promise<CloudListing>;
  find(root: CloudRoot, query: CloudFindQuery): Promise<CloudListing>;
  read(root: CloudRoot, path: string): Promise<CloudDownload>;
  /**
   * Erreichbarkeit prüfen. Nimmt eine bestehende Wurzel ODER einen rohen Link,
   * damit die Einrichtung testen kann, was noch nicht gespeichert ist.
   */
  test(target: CloudRoot | { link: string }): Promise<CloudConnectionTest>;
}
