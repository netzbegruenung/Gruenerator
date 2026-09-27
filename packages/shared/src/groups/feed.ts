/**
 * Gruppen-Feed: `GET /groups/:id/content` liefert Buckets je Quelltabelle;
 * Feed und „Alle" brauchen eine flache, typisierte Liste. Web und App
 * leiten beide daraus ab — wohin ein Eintrag navigiert, bleibt Sache der
 * Plattform (`kind` + `id` + `slug`).
 */
import {
  groupShareMetaSchema,
  type GroupContentResponse,
  type GroupContentType,
  type GroupShareMeta,
} from '@gruenerator/contracts';

import { SYSTEM_AGENTS } from '../agents/index.js';

/** Reihenfolge = Reihenfolge der Abschnitte in „Alle". */
export const GROUP_FEED_KINDS = [
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

export interface GroupFeedItem {
  /** Stabil je Freigabe: `${contentType}:${id}`. */
  key: string;
  id: string;
  contentType: GroupContentType;
  kind: GroupFeedKind;
  title: string;
  excerpt: string | null;
  thumbnailUrl: string | null;
  /** Generator-Slug, Notebook-Slug-Suffix bzw. Agent-Identifier. */
  slug: string | null;
  sharedByName: string | null;
  sharedAt: string | null;
  share: GroupShareMeta | null;
}

type Row = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

function base(row: Row, contentType: GroupContentType, kind: GroupFeedKind, title: string) {
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
      slug: str(r.identifier),
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

/** Suche über Titel, Notiz und Kurzbeschreibung. */
export function filterGroupFeed(items: GroupFeedItem[], query: string): GroupFeedItem[] {
  const q = query.trim().toLocaleLowerCase('de');
  if (!q) return items;
  return items.filter((i) =>
    [i.title, i.share?.note, i.excerpt].some((t) => t?.toLocaleLowerCase('de').includes(q))
  );
}
