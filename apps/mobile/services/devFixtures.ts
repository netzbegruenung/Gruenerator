import { type BoardDocument, type CanvasListItem } from '@gruenerator/contracts';
import { type Project } from '@gruenerator/shared';
import { type Share } from '@gruenerator/shared/share';

import { DEV_AUTH_BYPASS, DEV_BYPASS_USER } from './devAuth';
import { type Document } from './docs/docsApi';

/**
 * Sample content for the DEV auth bypass.
 *
 * The bypass authenticates a synthetic user client-side without a backend, so every
 * list endpoint answers 401 and the screens that live off those lists (Arbeiten,
 * Studio, the start page's "Zuletzt") render an error or an empty plate — which
 * makes them useless for exactly the layout work the bypass exists for.
 *
 * So under the bypass — and only there, `DEV_AUTH_BYPASS` already carries the
 * `__DEV__` backstop — the list services short-circuit to the fixtures below
 * instead of calling the API. Writes are not faked: creating or deleting still
 * hits the backend and still fails.
 */
export const DEV_FIXTURES_ENABLED = DEV_AUTH_BYPASS;

const OWNER = DEV_BYPASS_USER.id;

/** Timestamps relative to app start, so the tiles show plausible "vor 2 Std" metadata. */
const HOUR = 60 * 60 * 1000;
const startedAt = Date.now();
const ago = (hours: number): string => new Date(startedAt - hours * HOUR).toISOString();

export const DEV_DOCUMENTS: Document[] = [
  {
    id: 'dev-doc-antrag',
    title: 'Antrag: Radwegenetz ausbauen',
    content:
      '<h1>Antrag: Radwegenetz ausbauen</h1><p>Der Gemeinderat möge beschließen, das Radwegenetz bis 2028 um 12 km zu erweitern.</p><h2>Begründung</h2><p>Der Anteil des Radverkehrs ist seit 2020 um 34 % gestiegen, das Netz aber unverändert geblieben.</p>',
    owner_id: OWNER,
    created_at: ago(52),
    updated_at: ago(2),
    document_subtype: 'antrag',
  },
  {
    id: 'dev-doc-pressemitteilung',
    title: 'Pressemitteilung: Neue Photovoltaik-Offensive',
    content:
      '<h1>Neue Photovoltaik-Offensive</h1><p>Ab dem kommenden Jahr fördert die Stadt Balkonkraftwerke mit bis zu 200 Euro.</p>',
    owner_id: OWNER,
    created_at: ago(30),
    updated_at: ago(6),
    document_subtype: 'pressemitteilung',
  },
  {
    id: 'dev-doc-protokoll',
    title: 'Protokoll Fraktionssitzung',
    content:
      '<h1>Protokoll Fraktionssitzung</h1><p>TOP 1 — Haushalt 2027</p><p>TOP 2 — Anträge zur Verkehrswende</p>',
    owner_id: OWNER,
    created_at: ago(80),
    updated_at: ago(26),
    document_subtype: 'protokoll',
  },
  {
    id: 'dev-sheet-mitgliederzahlen',
    title: 'Mitgliederzahlen 2026',
    owner_id: OWNER,
    created_at: ago(140),
    updated_at: ago(49),
    document_subtype: 'sheets',
  },
  {
    id: 'dev-presentation-wahlkampf',
    title: 'Wahlkampfauftakt — Kernbotschaften',
    owner_id: OWNER,
    created_at: ago(160),
    updated_at: ago(73),
    document_subtype: 'presentations',
  },
];

export const DEV_BOARDS: BoardDocument[] = [
  {
    id: 'dev-board-kampagne',
    title: 'Kampagnenplanung Frühjahr',
    created_by: OWNER,
    last_edited_by: OWNER,
    document_subtype: 'boards',
    permissions: null,
    is_public: false,
    is_deleted: false,
    created_at: ago(200),
    updated_at: ago(11),
  },
];

export const DEV_CANVASES: CanvasListItem[] = [
  {
    id: 'dev-canvas-zitat',
    title: 'Zitat-Sharepic Klimaschutz',
    created_by: OWNER,
    created_at: ago(96),
    updated_at: ago(19),
    permissions: null,
    is_public: false,
    template_type: 'Zitat',
    base_template_id: null,
    thumbnail_url: null,
    page_count: 1,
    format: 'square',
  },
];

/**
 * Image shares and reel projects as their own endpoints return them.
 *
 * The Studio tab reads `/share/my` and `/subtitler/projects` directly rather than
 * the merged `/recent-activity` feed, so it needs fixtures in those two shapes —
 * `DEV_RECENT_ACTIVITY` below still covers the start page's "Zuletzt" strip.
 * `imageType` is what splits Sharepics from KI-Bilder, so both kinds appear here.
 */
export const DEV_SHARES: Share[] = [
  {
    shareToken: 'dev-image-sonnenblumenfeld',
    mediaType: 'image',
    title: 'Sonnenblumenfeld bei Sonnenaufgang',
    status: 'ready',
    createdAt: ago(5),
    imageType: 'pure-create',
  },
  {
    shareToken: 'dev-image-lastenrad',
    mediaType: 'image',
    title: 'Lastenrad in der Innenstadt',
    status: 'ready',
    createdAt: ago(21),
    imageType: 'universal-edit',
  },
  {
    shareToken: 'dev-image-windpark',
    mediaType: 'image',
    title: 'Windpark im Abendlicht',
    status: 'ready',
    createdAt: ago(70),
    imageType: 'dreizeilen',
  },
  {
    shareToken: 'dev-image-portrait',
    mediaType: 'image',
    title: 'Porträt für Kandidat:innenseite',
    status: 'ready',
    createdAt: ago(94),
    imageType: 'profilbild',
  },
];

export const DEV_REEL_PROJECTS: Project[] = [
  {
    id: 'dev-reel-buergerdialog',
    user_id: OWNER,
    title: 'Bürgerdialog — Kurzfassung',
    upload_id: null,
    thumbnail_path: null,
    video_path: null,
    video_metadata: null,
    video_size: 0,
    video_filename: null,
    style_preference: 'default',
    height_preference: 'default',
    mode_preference: null,
    subtitles: null,
    export_count: 1,
    last_edited_at: ago(3),
    created_at: ago(30),
  },
  {
    id: 'dev-reel-rede-haushalt',
    user_id: OWNER,
    title: 'Rede zum Haushalt (Untertitel)',
    upload_id: null,
    thumbnail_path: null,
    video_path: null,
    video_metadata: null,
    video_size: 0,
    video_filename: null,
    style_preference: 'default',
    height_preference: 'default',
    mode_preference: null,
    subtitles: null,
    export_count: 2,
    last_edited_at: ago(28),
    created_at: ago(60),
  },
];

/** Shape of `/recent-activity` items — mirrors `hooks/useRecentActivity`. */
interface DevRecentItem {
  id: string;
  title: string;
  date: string;
  type: 'doc' | 'board' | 'image' | 'video' | 'presentation' | 'canvas';
  href: string;
  content?: string;
  documentType?: string;
}

export const DEV_RECENT_ACTIVITY: DevRecentItem[] = [
  ...DEV_DOCUMENTS.slice(0, 3).map((doc) => ({
    id: doc.id,
    title: doc.title,
    date: doc.updated_at,
    type: 'doc' as const,
    href: `/office/${doc.id}`,
    content: doc.content,
    documentType: doc.document_subtype,
  })),
  {
    id: 'dev-reel-buergerdialog',
    title: 'Bürgerdialog — Kurzfassung',
    date: ago(3),
    type: 'video',
    href: '/studio/video?project=dev-reel-buergerdialog',
  },
  {
    id: 'dev-reel-rede-haushalt',
    title: 'Rede zum Haushalt (Untertitel)',
    date: ago(28),
    type: 'video',
    href: '/studio/video?project=dev-reel-rede-haushalt',
  },
  {
    id: 'dev-reel-wahlkampfauftakt',
    title: 'Wahlkampfauftakt Reel',
    date: ago(120),
    type: 'video',
    href: '/studio/video?project=dev-reel-wahlkampfauftakt',
  },
  {
    id: 'dev-image-sonnenblumenfeld',
    title: 'Sonnenblumenfeld bei Sonnenaufgang',
    date: ago(5),
    type: 'image',
    href: '/share/dev-image-sonnenblumenfeld',
  },
  {
    id: 'dev-image-lastenrad',
    title: 'Lastenrad in der Innenstadt',
    date: ago(21),
    type: 'image',
    href: '/share/dev-image-lastenrad',
  },
  {
    id: 'dev-image-windpark',
    title: 'Windpark im Abendlicht',
    date: ago(70),
    type: 'image',
    href: '/share/dev-image-windpark',
  },
  {
    id: 'dev-image-portrait',
    title: 'Porträt für Kandidat:innenseite',
    date: ago(94),
    type: 'image',
    href: '/share/dev-image-portrait',
  },
];
