/**
 * Gruppen-Feed: `GET /groups/:id/content` liefert Buckets je Quelltabelle;
 * Feed und „Alle" brauchen eine flache, typisierte Liste. Web und App
 * leiten beide daraus ab — wohin ein Eintrag navigiert, bleibt Sache der
 * Plattform (`kind` + `id` + `slug`).
 */
import {
  groupPostItemSchema,
  groupShareMetaSchema,
  type GroupContentResponse,
  type GroupContentType,
  type GroupShareMeta,
} from '@gruenerator/contracts';

import { SYSTEM_AGENTS } from '../agents/index.js';

/** Reihenfolge = Reihenfolge der Abschnitte in „Alle". */
export const GROUP_FEED_KINDS = [
  { id: 'post', label: 'Beitrag', plural: 'Beiträge' },
  { id: 'sharepic-template', label: 'Sharepic-Vorlage', plural: 'Sharepic-Vorlagen' },
  { id: 'sharepic', label: 'Sharepic', plural: 'Sharepics' },
  { id: 'doc', label: 'Doc', plural: 'Docs' },
  { id: 'board', label: 'Board', plural: 'Boards' },
  { id: 'generator', label: 'Grünerator', plural: 'Grüneratoren' },
  { id: 'agent', label: 'Grünerator-Agent', plural: 'Grünerator-Agenten' },
  { id: 'notebook', label: 'Notebook', plural: 'Notebooks' },
  { id: 'text', label: 'Text', plural: 'Texte' },
  { id: 'template', label: 'Vorlage', plural: 'Vorlagen' },
  { id: 'document', label: 'Dokument', plural: 'Dokumente' },
] as const;

export type GroupFeedKind = (typeof GROUP_FEED_KINDS)[number]['id'];

export function groupFeedKindMeta(kind: GroupFeedKind) {
  return GROUP_FEED_KINDS.find((k) => k.id === kind) ?? GROUP_FEED_KINDS[0];
}

/**
 * Wie der Eintrag in `group_content_shares` steht. `group_post` ist kein
 * `GroupContentType`: ein Beitrag wird nicht geteilt, sondern geschrieben, und
 * über `deleteGroupPost` gelöscht — nie über die Content-Routen.
 */
export type GroupFeedContentType = GroupContentType | 'group_post';

export interface GroupPostFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  isImage: boolean;
}

/** Nur bei `kind === 'post'`: Text und Dateien eines eigenen Beitrags. */
export interface GroupPostContent {
  body: string;
  authorId: string | null;
  editedAt: string | null;
  files: GroupPostFile[];
}

export interface GroupFeedItem {
  /** Stabil je Freigabe: `${contentType}:${id}`. */
  key: string;
  id: string;
  contentType: GroupFeedContentType;
  kind: GroupFeedKind;
  title: string;
  excerpt: string | null;
  thumbnailUrl: string | null;
  /** Generator-Slug, Notebook-Slug-Suffix bzw. Agent-Identifier. */
  slug: string | null;
  sharedByName: string | null;
  sharedAt: string | null;
  share: GroupShareMeta | null;
  post: GroupPostContent | null;
}

/** API-Pfad einer Beitragsdatei; nur für Mitglieder lesbar (Cookie bzw. Bearer). */
export function groupPostFilePath(groupId: string, postId: string, fileId: string): string {
  return `/api/auth/groups/${groupId}/posts/${postId}/files/${fileId}`;
}

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

/** Titel für „Alle" und Suche: erste Zeile des Texts, sonst der erste Dateiname. */
function postTitle(body: string, files: GroupPostFile[]): string {
  const line = body.trim().split('\n')[0]?.trim() ?? '';
  if (line) return line.length > 80 ? `${line.slice(0, 79)}…` : line;
  return files[0]?.name ?? 'Beitrag';
}

type Row = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

function base(row: Row, contentType: GroupFeedContentType, kind: GroupFeedKind, title: string) {
  const id = String(row.id);
  const parsed = groupShareMetaSchema.safeParse(row.share);
  return {
    key: `${contentType}:${id}`,
    id,
    contentType,
    kind,
    title,
    excerpt: null,
    thumbnailUrl: str(row.thumbnail_url),
    slug: null,
    sharedByName: str(row.shared_by_name),
    sharedAt: str(row.shared_at),
    share: parsed.success ? parsed.data : null,
    post: null,
  } satisfies GroupFeedItem;
}

function collabKind(subtype: unknown): GroupFeedKind {
  if (subtype === 'boards') return 'board';
  if (subtype === 'canvas') return 'sharepic';
  return 'doc';
}

export interface ToGroupFeedItemsOptions {
  /** System-Notebooks tragen nur ihre ID; der Titel steht in der Plattform-Registry. */
  systemNotebookTitle?: (id: string) => string | null;
}

export function toGroupFeedItems(
  content: Partial<GroupContentResponse['content']> | null,
  options: ToGroupFeedItemsOptions = {}
): GroupFeedItem[] {
  if (!content) return [];
  const rows = (bucket: keyof GroupContentResponse['content']) => (content[bucket] ?? []) as Row[];
  const items: GroupFeedItem[] = [];

  for (const r of rows('group_posts')) {
    const parsed = groupPostItemSchema.safeParse(r);
    if (!parsed.success) continue;
    const p = parsed.data;
    const files = p.files.map((f) => ({
      id: f.id,
      name: f.file_name,
      mimeType: f.mime_type,
      sizeBytes: f.size_bytes,
      isImage: IMAGE_TYPES.has(f.mime_type),
    }));
    items.push({
      ...base(r, 'group_post', 'post', postTitle(p.body, files)),
      post: { body: p.body, authorId: p.author_id, editedAt: p.edited_at, files },
    });
  }
  for (const r of rows('collaborative_documents')) {
    const kind = collabKind(r.document_subtype);
    items.push(base(r, 'collaborative_documents', kind, str(r.title) ?? 'Ohne Titel'));
  }
  for (const r of rows('canvas_templates')) {
    items.push(base(r, 'canvas_template', 'sharepic-template', str(r.title) ?? 'Sharepic-Vorlage'));
  }
  for (const r of rows('generators')) {
    items.push({
      ...base(r, 'custom_generators', 'generator', str(r.title) ?? str(r.name) ?? 'Grünerator'),
      excerpt: str(r.description),
      slug: str(r.slug),
    });
  }
  for (const r of rows('notebooks')) {
    items.push({
      ...base(r, 'notebook_collections', 'notebook', str(r.name) ?? 'Notebook'),
      excerpt: str(r.description),
      slug: str(r.slug_suffix),
    });
  }
  for (const r of rows('system_notebooks')) {
    const id = String(r.id);
    items.push({
      ...base(r, 'system_notebooks', 'notebook', options.systemNotebookTitle?.(id) ?? id),
      slug: id,
    });
  }
  for (const r of rows('user_agents')) {
    items.push({
      ...base(r, 'user_agents', 'agent', str(r.title) ?? 'Grünerator-Agent'),
      excerpt: str(r.description),
      // The row uuid, not the identifier: that is unique only per owner, and a
      // colleague's agent may share it with the viewer's own.
      slug: String(r.id),
    });
  }
  for (const r of rows('system_agents')) {
    const id = String(r.id);
    const sys = SYSTEM_AGENTS.find((a) => a.identifier === id);
    items.push({ ...base(r, 'system_agents', 'agent', sys?.title ?? id), slug: id });
  }
  for (const r of rows('texts')) {
    items.push({
      ...base(r, 'user_documents', 'text', str(r.title) ?? 'Text'),
      excerpt: typeof r.word_count === 'number' ? `${r.word_count} Wörter` : null,
    });
  }
  for (const r of rows('templates')) {
    items.push({
      ...base(r, 'database', 'template', str(r.title) ?? 'Vorlage'),
      excerpt: str(r.description),
    });
  }
  for (const r of rows('documents')) {
    items.push(base(r, 'documents', 'document', str(r.title) ?? str(r.filename) ?? 'Dokument'));
  }

  return sortGroupFeed(items);
}

/** Angeheftetes zuerst (zuletzt angeheftet oben), dann neueste Freigabe zuerst. */
export function sortGroupFeed(items: GroupFeedItem[]): GroupFeedItem[] {
  const time = (s: string | null | undefined) => (s ? Date.parse(s) || 0 : 0);
  return [...items].sort((a, b) => {
    const pa = time(a.share?.pinnedAt);
    const pb = time(b.share?.pinnedAt);
    if (pa || pb) return pb - pa;
    return time(b.sharedAt) - time(a.sharedAt);
  });
}

export function isPinned(item: GroupFeedItem): boolean {
  return !!item.share?.pinnedAt;
}

/** „Alle": je Art ein Abschnitt, leere weggelassen, Reihenfolge wie `GROUP_FEED_KINDS`. */
export function groupFeedByKind(items: GroupFeedItem[]) {
  return GROUP_FEED_KINDS.map((k) => ({
    ...k,
    items: items.filter((i) => i.kind === k.id),
  })).filter((section) => section.items.length > 0);
}

/** Suche über Titel, Notiz, Kurzbeschreibung sowie Text und Dateinamen eines Beitrags. */
export function filterGroupFeed(items: GroupFeedItem[], query: string): GroupFeedItem[] {
  const q = query.trim().toLocaleLowerCase('de');
  if (!q) return items;
  return items.filter((i) =>
    [
      i.title,
      i.share?.note,
      i.excerpt,
      i.post?.body,
      ...(i.post?.files.map((f) => f.name) ?? []),
    ].some((t) => t?.toLocaleLowerCase('de').includes(q))
  );
}

/** „412 KB" bzw. „1,4 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

/** Kurzes Endungs-Badge: „PDF", „DOCX"; „DATEI" ohne Endung. */
export function fileExtensionLabel(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1, dot + 5).toUpperCase() : 'DATEI';
}

/** „Samstag, 27. September" bzw. „27. Sept." — leer, wenn kein gültiges Datum. */
export function formatFeedDate(iso: string | null, style: 'long' | 'short' = 'long'): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(
    'de-DE',
    style === 'long'
      ? { weekday: 'long', day: 'numeric', month: 'long' }
      : { day: 'numeric', month: 'short' }
  );
}

/** Initialen für Avatare ohne Bild: erster und letzter Namensteil. */
export function personInitials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}
