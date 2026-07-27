import { type Document } from '../../services/docs/docsApi';
import { docPreviewHtml } from '../../services/docs/documentShape';
import { kindFromSubtype, type OfficeItem } from '../office/officeItem';

/**
 * The Arbeiten list, assembled: documents from `/docs` merged with the boards and
 * canvases the screen fetches separately, newest first.
 *
 * Split out of `DocumentsView` because it is the part that can be wrong — which
 * preview field wins, and whether the merge survives a backend that does not
 * know `?preview=true` yet.
 */
export function toDocListItems(documents: Document[], extraItems?: OfficeItem[]): OfficeItem[] {
  const docItems = documents.map((doc): OfficeItem => {
    const preview = docPreviewHtml(doc);
    return {
      id: doc.id,
      title: doc.title,
      updatedAt: doc.updated_at,
      kind: kindFromSubtype(doc.document_subtype),
      // Omitted rather than set to undefined: `exactOptionalPropertyTypes` is on,
      // and a doc with no body at all should not claim an empty preview.
      ...(preview != null && { preview }),
    };
  });

  const merged = extraItems ? [...docItems, ...extraItems] : docItems;
  // String compare, not Date: these are ISO timestamps from Postgres, so
  // lexicographic order is chronological order without parsing anything.
  return merged.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
