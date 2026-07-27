export type DocumentSourceType = 'notebook' | 'document' | 'text';

export interface DocumentMention {
  documentId: string;
  documentTitle: string;
  collectionId: string;
  collectionName: string;
  slug: string;
  sourceType: DocumentSourceType;
}

export interface UserDocumentItem {
  id: string;
  title: string;
  filename?: string;
  sourceType?: string;
  createdAt: string;
  contentPreview?: string;
}

export interface UserTextItem {
  id: string;
  title: string;
  documentType: string;
  wordCount: number;
  createdAt: string;
}

export interface NotebookCollectionItem {
  id: string;
  name: string;
  description: string | null;
  documentCount: number;
  documents: NotebookDocumentItem[];
}

export interface NotebookDocumentItem {
  id: string;
  title: string;
  pageCount?: number;
  sourceType?: string;
}

export interface DocumentSearchResult {
  documentId: string;
  title: string;
  excerpt: string;
  score: number;
}

export interface CollabDocSelection {
  id: string;
  slug: string;
  title: string;
}

/**
 * A composer attachment that REFERENCES a stored document instead of carrying
 * bytes. Built here rather than at each call site because the shape is
 * load-bearing: `GrueneratorModelAdapter` recognises these by
 * `contentType.startsWith('application/x-gruenerator-')` plus a content part
 * named `gruenerator-mention`, and only then routes `data.kind` into
 * `documentIds` / `textIds` / `docMentionIds`. Miss either marker and the
 * attachment is dropped without an error.
 *
 * Referencing by attachment rather than by an `@datei:<slug>` token in the text
 * is also what makes the reference exact: the real id travels with it, instead
 * of a 40-character slug looked up in `slugToDocumentMap` — which collides on a
 * shared prefix and is empty after a reload.
 *
 * Deliberately structural (no `@assistant-ui/react` import): the same builder
 * serves the web composer and the native one, whose runtimes come from
 * different packages. Both accept this object as a `CreateAttachment`.
 */
export interface MentionAttachment {
  id: string;
  type: 'document';
  name: string;
  contentType: string;
  content: [{ type: 'data'; name: 'gruenerator-mention'; data: Record<string, unknown> }];
}

/** A stored document, notebook source or saved text picked from the browser. */
export function buildDocumentMentionAttachment(doc: DocumentMention): MentionAttachment {
  return {
    id: `gruenerator-datei-${doc.documentId}`,
    type: 'document',
    name: doc.documentTitle,
    contentType: `application/x-gruenerator-datei-${doc.sourceType}`,
    content: [
      {
        type: 'data',
        name: 'gruenerator-mention',
        data: {
          kind: 'document',
          documentId: doc.documentId,
          documentTitle: doc.documentTitle,
          collectionId: doc.collectionId,
          collectionName: doc.collectionName,
          slug: doc.slug,
          sourceType: doc.sourceType,
        },
      },
    ],
  };
}

/** A collaborative document (`@doc`), routed into `docMentionIds`. */
export function buildCollabDocAttachment(doc: CollabDocSelection): MentionAttachment {
  return {
    id: `gruenerator-collab-${doc.id}`,
    type: 'document',
    name: doc.title,
    contentType: 'application/x-gruenerator-collab-doc',
    content: [
      {
        type: 'data',
        name: 'gruenerator-mention',
        data: { kind: 'collab', id: doc.id, slug: doc.slug, title: doc.title },
      },
    ],
  };
}

const slugToDocumentMap = new Map<string, DocumentMention>();

export function documentToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[äÄ]/g, 'ae')
    .replace(/[öÖ]/g, 'oe')
    .replace(/[üÜ]/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

export function registerDocumentSlug(slug: string, doc: DocumentMention): void {
  slugToDocumentMap.set(slug, doc);
}

export function resolveDocumentSlug(slug: string): DocumentMention | null {
  return slugToDocumentMap.get(slug) ?? null;
}

export function clearDocumentSlugs(): void {
  slugToDocumentMap.clear();
}
