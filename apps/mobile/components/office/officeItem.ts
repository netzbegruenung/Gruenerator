import { type BoardPreview } from '@gruenerator/contracts';
import { type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { type useRouter } from 'expo-router';

type AppRouter = ReturnType<typeof useRouter>;

/**
 * Unified item model for the Office tab, which merges three list sources:
 * `/docs` (docs + sheets + presentations, distinguished by document_subtype),
 * `/api/boards`, and `/api/canvas`. Every kind opens the embedded web editor
 * through `web-viewer`, which is why their screens are one-line redirects.
 * (`doc` and `presentation` ran natively before, see `doc-editor.tsx` and
 * `slide-viewer.tsx`.)
 */
export type OfficeKind = 'doc' | 'sheet' | 'presentation' | 'board' | 'canvas';

export interface OfficeItem {
  id: string;
  title: string;
  updatedAt: string;
  kind: OfficeKind;
  /**
   * Truncated document HTML for the grid preview (docs only) — the list
   * endpoint's `content_excerpt`, never the full body. Enough for the two lines
   * a card shows; anything that needs the real document fetches it by id.
   */
  preview?: string;
  /** Server-rendered image for the canvas grid preview (canvas only). */
  thumbnailUrl?: string;
  /** Boards only, from the board's content metadata. */
  boardType?: 'kanban' | 'whiteboard';
  boardPreview?: BoardPreview;
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
  // The viewers show the title while the editor loads.
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
