import {
  type NotebookDocumentRecord,
  type TransformedCollection,
  type WolkeFolderRef,
  type WordpressSiteRef,
} from '@gruenerator/contracts';

export const HUB_TABS = ['upload', 'wolke', 'docs', 'wordpress'] as const;
export type HubTab = (typeof HUB_TABS)[number];

export function isHubTab(value: string | null): value is HubTab {
  return (HUB_TABS as readonly string[]).includes(value ?? '');
}

export type SourceStatus = 'ready' | 'indexing' | 'failed';

const IN_FLIGHT = new Set(['uploaded', 'processing', 'pending']);

/** Dieselbe Einteilung wie `deriveIndexingState`, nur je Dokument. */
export function sourceStatus(doc: Pick<NotebookDocumentRecord, 'status'>): SourceStatus {
  const status = doc.status ?? 'completed';
  if (IN_FLIGHT.has(status)) return 'indexing';
  if (status === 'failed') return 'failed';
  return 'ready';
}

export const SOURCE_STATUS_LABELS: Record<SourceStatus, string> = {
  ready: 'Bereit',
  indexing: 'Wird indexiert',
  failed: 'Nicht durchsuchbar',
};

export interface WolkeGroup {
  /** `null` für Dateien, deren Ordner-Verbindung nicht mehr im Notebook steht. */
  folder: WolkeFolderRef | null;
  documents: NotebookDocumentRecord[];
}

export interface WordpressGroup {
  site: WordpressSiteRef;
  documents: NotebookDocumentRecord[];
}

export interface HubSources {
  upload: NotebookDocumentRecord[];
  docs: NotebookDocumentRecord[];
  wolke: WolkeGroup[];
  wordpress: WordpressGroup[];
  /** Alle Quellen des Notebooks. WordPress-Dokumente ohne Website-Eintrag stehen unter Upload. */
  total: number;
}

type HubCollection = Pick<
  TransformedCollection,
  'documents' | 'wolke_folders' | 'linked_docs' | 'wordpress_sites'
>;

/**
 * Welche Quelle in welchem Reiter steht. Die Herkunft ist ein Merkmal des
 * Dokuments (`source_type`, `wolke_share_link_id`) bzw. der Einträge in den
 * Notebook-Einstellungen (`linked_docs`, `wordpress_sites`) — nichts davon
 * wird im Client nachgeführt, jede Ansicht leitet es aus derselben Antwort ab.
 *
 * Wolke-Dateien hängen über den Freigabelink an ihrem Ordner. Stehen zwei
 * Ordner desselben Links im Notebook, landen die Dateien beim ersten: das
 * Dokument trägt keinen Ordnerpfad, an dem man sie trennen könnte.
 */
export function partitionSources(collection: HubCollection): HubSources {
  const documents = collection.documents ?? [];
  const folders = collection.wolke_folders ?? [];
  const sites = collection.wordpress_sites ?? [];
  const linkedIds = new Set(
    (collection.linked_docs ?? []).flatMap((d) => (d.documentId ? [d.documentId] : []))
  );
  const wpOwner = new Map<string, WordpressSiteRef>();
  for (const site of sites) for (const id of site.documentIds) wpOwner.set(id, site);

  const upload: NotebookDocumentRecord[] = [];
  const docs: NotebookDocumentRecord[] = [];
  const wolkeByLink = new Map<string, NotebookDocumentRecord[]>();
  const wolkeOrphans: NotebookDocumentRecord[] = [];
  const wpBySite = new Map<string, NotebookDocumentRecord[]>();
  const firstFolderByLink = new Map<string, WolkeFolderRef>();
  for (const f of folders)
    if (!firstFolderByLink.has(f.shareLinkId)) firstFolderByLink.set(f.shareLinkId, f);

  for (const doc of documents) {
    if (linkedIds.has(doc.id)) {
      docs.push(doc);
    } else if (doc.source_type === 'wolke') {
      const link = doc.wolke_share_link_id ?? '';
      if (firstFolderByLink.has(link)) {
        wolkeByLink.set(link, [...(wolkeByLink.get(link) ?? []), doc]);
      } else {
        wolkeOrphans.push(doc);
      }
    } else if (wpOwner.has(doc.id)) {
      const siteId = wpOwner.get(doc.id)!.websiteId;
      wpBySite.set(siteId, [...(wpBySite.get(siteId) ?? []), doc]);
    } else {
      upload.push(doc);
    }
  }

  const wolke: WolkeGroup[] = folders.map((folder) => ({
    folder,
    documents:
      firstFolderByLink.get(folder.shareLinkId) === folder
        ? (wolkeByLink.get(folder.shareLinkId) ?? [])
        : [],
  }));
  if (wolkeOrphans.length > 0) wolke.push({ folder: null, documents: wolkeOrphans });

  return {
    upload,
    docs,
    wolke,
    wordpress: sites.map((site) => ({ site, documents: wpBySite.get(site.websiteId) ?? [] })),
    total: documents.length,
  };
}

export function tabCount(sources: HubSources, tab: HubTab): number {
  switch (tab) {
    case 'upload':
      return sources.upload.length;
    case 'docs':
      return sources.docs.length;
    case 'wolke':
      return sources.wolke.filter((g) => g.folder).length;
    case 'wordpress':
      return sources.wordpress.length;
  }
}

/** Kürzel für die Typ-Kachel einer Zeile: Dateiendung, sonst die Quelle. */
export function kindLabel(doc: Pick<NotebookDocumentRecord, 'title' | 'source_type'>): string {
  const ext = /\.([a-z0-9]{1,4})$/i.exec(doc.title)?.[1];
  if (ext) return ext.toUpperCase();
  if (doc.source_type === 'wordpress') return 'WP';
  if (doc.source_type === 'url') return 'WEB';
  return 'DOC';
}

export function pagesLabel(doc: Pick<NotebookDocumentRecord, 'page_count'>): string {
  const n = doc.page_count ?? 0;
  if (n <= 0) return '—';
  return n === 1 ? '1 Seite' : `${n} Seiten`;
}
