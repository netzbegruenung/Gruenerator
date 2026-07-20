import { type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { type useRouter } from 'expo-router';

type AppRouter = ReturnType<typeof useRouter>;

/**
 * Unified item model for the Office tab, which merges three list sources:
 * `/docs` (docs + sheets + presentations, distinguished by document_subtype),
 * `/api/boards`, and `/api/canvas`. Each item routes to the right full-screen
 * viewer; only `doc` opens the existing editor, the rest are read-only viewers.
 */
export type OfficeKind = 'doc' | 'sheet' | 'presentation' | 'board' | 'canvas';

export interface OfficeItem {
  id: string;
  title: string;
  updatedAt: string;
  kind: OfficeKind;
  /** BlockNote content for the doc grid preview (docs only). */
  content?: string;
  /** Server-rendered image for the canvas grid preview (canvas only). */
  thumbnailUrl?: string;
}

/** Doc-family kinds live in `/docs` and support the share/delete actions menu. */
export function isDocFamily(kind: OfficeKind): boolean {
  return kind === 'doc' || kind === 'sheet' || kind === 'presentation';
}

export function kindFromSubtype(subtype?: string): OfficeKind {
  if (subtype === 'sheets') return 'sheet';
  if (subtype === 'presentations') return 'presentation';
  return 'doc';
}

export function officeIconFor(kind: OfficeKind): IoniconsIconName {
  switch (kind) {
    case 'sheet':
      return 'grid';
    case 'presentation':
      return 'easel';
    case 'board':
      return 'albums';
    case 'canvas':
      return 'image';
    default:
      return 'document-text';
  }
}

export function pushOfficeItem(router: AppRouter, item: OfficeItem): void {
  // doc-editor only reads `id`; the viewers also show the title while loading.
  // Literal pathnames (not a variable) so expo-router's typed routes accept them.
  const params = { id: item.id, title: item.title || 'Unbenannt' };
  switch (item.kind) {
    case 'sheet':
      router.push({ pathname: '/(fullscreen)/sheet-viewer', params });
      break;
    case 'presentation':
      router.push({ pathname: '/(fullscreen)/slide-viewer', params });
      break;
    case 'board':
      router.push({ pathname: '/(fullscreen)/board-viewer', params });
      break;
    case 'canvas':
      router.push({ pathname: '/(fullscreen)/canvas-viewer', params });
      break;
    default:
      router.push({ pathname: '/(fullscreen)/doc-editor', params });
  }
}

const WEB_BASE = 'https://gruenerator.eu';

/** Full web-editor URL for "Im Browser öffnen" — mirrors apps/web routes.ts. */
export function officeWebUrl(kind: OfficeKind, id: string): string {
  if (kind === 'board') return `${WEB_BASE}/boards/${id}`;
  if (kind === 'canvas') return `${WEB_BASE}/studio/canvas/${id}`;
  // docs, sheets, presentations all dispatch through /office/:id (CollabDocRoute).
  return `${WEB_BASE}/office/${id}`;
}
