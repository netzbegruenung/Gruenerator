/**
 * The report kinds whose row carries a `moderation` column, one entry each:
 * what a reporter may report, how a report hides it, how an admin restores or
 * removes it, and what the admin queue shows of it.
 *
 * Moderation applies to trashed rows too — the owner trashing a reported item
 * must not dodge its removal — so the admin reads deliberately skip the trash
 * filter (allowlisted in `trashReaders.vitest.ts`).
 */
import {
  type AdminReportPreview,
  type AdminReportStudioAssetTarget,
  GRUENERATOR_TEMPLATE_TYPE,
  type ContentReportKind,
  type EntityCommentType,
  type ModeratableReportKind,
  moderatableReportKindSchema,
  type ModerationState,
} from '@gruenerator/contracts';
import { getSystemAgent } from '@gruenerator/shared/agents';
import { and, eq, inArray, type SQL } from 'drizzle-orm';

import { profiles } from '../../database/schema/core.js';
import { entityComments } from '../../database/schema/entityComments.js';
import { sharedMedia } from '../../database/schema/media.js';
import { studioAssets } from '../../database/schema/studioAssets.js';
import { userTemplates } from '../../database/schema/templates.js';
import { userTextForms } from '../../database/schema/textForms.js';
import { userAgents } from '../../database/schema/userAgents.js';
import { type DrizzleDB, getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { notTrashed } from '../../database/trash.js';
import { buildThumbnailTileUrl, versionFromShareRow } from '../media/thumbnailUrl.js';
import { isRowId } from '../trash/ownedRowTrash.js';

type Tx = Parameters<Parameters<DrizzleDB['transaction']>[0]>[0];
export type ModerationDb = DrizzleDB | Tx;

export interface ModerationTarget {
  /**
   * The owner of a live, publicly reachable target in moderation 'ok'; null
   * otherwise. A comment's owner is its author — null once the person is gone.
   */
  loadReportable(id: string): Promise<{ ownerId: string | null } | null>;
  /** 'ok' → 'hidden' in one statement, only while the target is reportable and `when` holds. */
  hideIf(db: ModerationDb, id: string, when: SQL): Promise<boolean>;
  /** Trashed rows included; `onlyFrom` limits the write to that current state. Returns the state after. */
  setModeration(
    db: ModerationDb,
    id: string,
    state: ModerationState,
    onlyFrom?: ModerationState
  ): Promise<ModerationState | null>;
  previews(ids: string[]): Promise<Map<string, AdminReportPreview>>;
}

const trimmedName = (name: string | null): string | null => name?.trim() || null;

// ── Sticker & Hintergründe ──────────────────────────────────────────────────

const studioAssetReportable = and(
  eq(studioAssets.visibility, 'public'),
  eq(studioAssets.moderation, 'ok'),
  notTrashed(studioAssets)
);

/** The legacy `target` of the admin queue (F0), trashed assets included. */
export async function loadStudioAssetTargets(
  ids: string[]
): Promise<Map<string, AdminReportStudioAssetTarget>> {
  if (ids.length === 0) return new Map();
  const rows = await getDrizzleInstance()
    .select({
      id: studioAssets.id,
      title: studioAssets.title,
      src: studioAssets.src,
      kind: studioAssets.kind,
      moderation: studioAssets.moderation,
      ownerId: studioAssets.user_id,
      ownerName: profiles.display_name,
      deletedAt: studioAssets.deleted_at,
      shareToken: sharedMedia.share_token,
      mediaCreatedAt: sharedMedia.created_at,
      mediaMetadata: sharedMedia.image_metadata,
    })
    .from(studioAssets)
    .leftJoin(sharedMedia, and(eq(sharedMedia.id, studioAssets.media_id), notTrashed(sharedMedia)))
    .leftJoin(profiles, eq(profiles.id, studioAssets.user_id))
    .where(inArray(studioAssets.id, ids));

  return new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        title: r.title,
        src: r.src,
        thumbUrl: r.shareToken
          ? buildThumbnailTileUrl(
              'media',
              r.shareToken,
              versionFromShareRow({ created_at: r.mediaCreatedAt, image_metadata: r.mediaMetadata })
            )
          : null,
        kind: r.kind,
        moderation: r.moderation,
        ownerId: r.ownerId,
        ownerName: trimmedName(r.ownerName),
        trashed: r.deletedAt !== null,
      },
    ])
  );
}

const studioAssetTarget: ModerationTarget = {
  async loadReportable(id) {
    const [row] = await getDrizzleInstance()
      .select({ ownerId: studioAssets.user_id })
      .from(studioAssets)
      .where(and(eq(studioAssets.id, id), studioAssetReportable, notTrashed(studioAssets)))
      .limit(1);
    return row ?? null;
  },
  async hideIf(db, id, when) {
    const rows = await db
      .update(studioAssets)
      .set({ moderation: 'hidden', updated_at: new Date() })
      .where(and(eq(studioAssets.id, id), studioAssetReportable, when))
      .returning({ id: studioAssets.id });
    return rows.length > 0;
  },
  async setModeration(db, id, state, onlyFrom) {
    await db
      .update(studioAssets)
      .set({ moderation: state, updated_at: new Date() })
      .where(
        and(eq(studioAssets.id, id), onlyFrom ? eq(studioAssets.moderation, onlyFrom) : undefined)
      );
    const [row] = await db
      .select({ moderation: studioAssets.moderation })
      .from(studioAssets)
      .where(eq(studioAssets.id, id))
      .limit(1);
    return row?.moderation ?? null;
  },
  async previews(ids) {
    const targets = await loadStudioAssetTargets(ids);
    return new Map(
      [...targets].map(([id, t]) => [
        id,
        {
          title: t.title,
          // The signed thumbnail stays blocked once removed; the session-bound file still serves admins.
          thumbUrl: t.moderation === 'removed' ? t.src : (t.thumbUrl ?? t.src),
          href: null,
          ownerId: t.ownerId,
          ownerName: t.ownerName,
          moderation: t.moderation,
          trashed: t.trashed,
        },
      ])
    );
  },
};

// ── Agents ──────────────────────────────────────────────────────────────────

/** Reachable by every signed-in user; listing (`is_public`) is not required to report. */
const userAgentReportable = and(
  eq(userAgents.share_mode, 'authenticated'),
  eq(userAgents.moderation, 'ok'),
  notTrashed(userAgents)
);

const userAgentTarget: ModerationTarget = {
  async loadReportable(id) {
    const [row] = await getDrizzleInstance()
      .select({ ownerId: userAgents.user_id })
      .from(userAgents)
      .where(and(eq(userAgents.id, id), userAgentReportable, notTrashed(userAgents)))
      .limit(1);
    return row ?? null;
  },
  async hideIf(db, id, when) {
    const rows = await db
      .update(userAgents)
      .set({ moderation: 'hidden', updated_at: new Date() })
      .where(and(eq(userAgents.id, id), userAgentReportable, when))
      .returning({ id: userAgents.id });
    return rows.length > 0;
  },
  async setModeration(db, id, state, onlyFrom) {
    await db
      .update(userAgents)
      .set({ moderation: state, updated_at: new Date() })
      .where(
        and(eq(userAgents.id, id), onlyFrom ? eq(userAgents.moderation, onlyFrom) : undefined)
      );
    const [row] = await db
      .select({ moderation: userAgents.moderation })
      .from(userAgents)
      .where(eq(userAgents.id, id))
      .limit(1);
    return row?.moderation ?? null;
  },
  async previews(ids) {
    if (ids.length === 0) return new Map();
    const rows = await getDrizzleInstance()
      .select({
        id: userAgents.id,
        title: userAgents.title,
        identifier: userAgents.identifier,
        moderation: userAgents.moderation,
        ownerId: userAgents.user_id,
        ownerName: profiles.display_name,
        deletedAt: userAgents.deleted_at,
      })
      .from(userAgents)
      .leftJoin(profiles, eq(profiles.id, userAgents.user_id))
      .where(inArray(userAgents.id, ids));
    return new Map(
      rows.map((r) => [
        r.id,
        {
          title: r.title,
          thumbUrl: null,
          href: `/agentura/agent/${encodeURIComponent(r.identifier)}`,
          ownerId: r.ownerId,
          ownerName: trimmedName(r.ownerName),
          moderation: r.moderation,
          trashed: r.deletedAt !== null,
        },
      ])
    );
  },
};

// ── Rezepte ─────────────────────────────────────────────────────────────────

/** `PUBLIC_VISIBLE` in textFormRepository.ts, in Drizzle. */
const userTextFormReportable = and(
  eq(userTextForms.is_public, true),
  eq(userTextForms.share_mode, 'authenticated'),
  eq(userTextForms.kind, 'custom'),
  eq(userTextForms.moderation, 'ok'),
  notTrashed(userTextForms)
);

const userTextFormTarget: ModerationTarget = {
  async loadReportable(id) {
    const [row] = await getDrizzleInstance()
      .select({ ownerId: userTextForms.user_id })
      .from(userTextForms)
      .where(and(eq(userTextForms.id, id), userTextFormReportable, notTrashed(userTextForms)))
      .limit(1);
    return row ?? null;
  },
  async hideIf(db, id, when) {
    const rows = await db
      .update(userTextForms)
      .set({ moderation: 'hidden', updated_at: new Date() })
      .where(and(eq(userTextForms.id, id), userTextFormReportable, when))
      .returning({ id: userTextForms.id });
    return rows.length > 0;
  },
  async setModeration(db, id, state, onlyFrom) {
    await db
      .update(userTextForms)
      .set({ moderation: state, updated_at: new Date() })
      .where(
        and(eq(userTextForms.id, id), onlyFrom ? eq(userTextForms.moderation, onlyFrom) : undefined)
      );
    const [row] = await db
      .select({ moderation: userTextForms.moderation })
      .from(userTextForms)
      .where(eq(userTextForms.id, id))
      .limit(1);
    return row?.moderation ?? null;
  },
  async previews(ids) {
    if (ids.length === 0) return new Map();
    const rows = await getDrizzleInstance()
      .select({
        id: userTextForms.id,
        title: userTextForms.title,
        mention: userTextForms.mention,
        moderation: userTextForms.moderation,
        ownerId: userTextForms.user_id,
        ownerName: profiles.display_name,
        deletedAt: userTextForms.deleted_at,
      })
      .from(userTextForms)
      .leftJoin(profiles, eq(profiles.id, userTextForms.user_id))
      .where(inArray(userTextForms.id, ids));
    return new Map(
      rows.map((r) => [
        r.id,
        {
          title: r.title,
          thumbUrl: null,
          href: `/agentura/rezept/${encodeURIComponent(r.mention)}`,
          ownerId: r.ownerId,
          ownerName: trimmedName(r.ownerName),
          moderation: r.moderation,
          trashed: r.deletedAt !== null,
        },
      ])
    );
  },
};

// ── Vorlagen ────────────────────────────────────────────────────────────────

const userTemplateReportable = and(
  eq(userTemplates.is_private, false),
  eq(userTemplates.status, 'published'),
  eq(userTemplates.moderation, 'ok'),
  notTrashed(userTemplates)
);

const userTemplateTarget: ModerationTarget = {
  async loadReportable(id) {
    const [row] = await getDrizzleInstance()
      .select({ ownerId: userTemplates.user_id })
      .from(userTemplates)
      .where(and(eq(userTemplates.id, id), userTemplateReportable, notTrashed(userTemplates)))
      .limit(1);
    return row?.ownerId ? { ownerId: row.ownerId } : null;
  },
  async hideIf(db, id, when) {
    const rows = await db
      .update(userTemplates)
      .set({ moderation: 'hidden', updated_at: new Date() })
      .where(and(eq(userTemplates.id, id), userTemplateReportable, when))
      .returning({ id: userTemplates.id });
    return rows.length > 0;
  },
  async setModeration(db, id, state, onlyFrom) {
    await db
      .update(userTemplates)
      .set({ moderation: state, updated_at: new Date() })
      .where(
        and(eq(userTemplates.id, id), onlyFrom ? eq(userTemplates.moderation, onlyFrom) : undefined)
      );
    const [row] = await db
      .select({ moderation: userTemplates.moderation })
      .from(userTemplates)
      .where(eq(userTemplates.id, id))
      .limit(1);
    return row?.moderation ?? null;
  },
  async previews(ids) {
    if (ids.length === 0) return new Map();
    const rows = await getDrizzleInstance()
      .select({
        id: userTemplates.id,
        title: userTemplates.title,
        templateType: userTemplates.template_type,
        externalUrl: userTemplates.external_url,
        thumbnailUrl: userTemplates.thumbnail_url,
        moderation: userTemplates.moderation,
        ownerId: userTemplates.user_id,
        ownerName: profiles.display_name,
        deletedAt: userTemplates.deleted_at,
      })
      .from(userTemplates)
      .leftJoin(profiles, eq(profiles.id, userTemplates.user_id))
      .where(inArray(userTemplates.id, ids));
    const out = new Map<string, AdminReportPreview>();
    for (const r of rows) {
      if (!r.ownerId) continue;
      out.set(r.id, {
        title: r.title,
        thumbUrl: r.thumbnailUrl,
        href: r.templateType === GRUENERATOR_TEMPLATE_TYPE ? `/vorlagen/v/${r.id}` : r.externalUrl,
        ownerId: r.ownerId,
        ownerName: trimmedName(r.ownerName),
        moderation: r.moderation,
        trashed: r.deletedAt !== null,
      });
    }
    return out;
  },
};

// ── Kommentare an Marktplatz-Beiträgen ──────────────────────────────────────

const ITEM_TARGET = {
  agent: userAgentTarget,
  recipe: userTextFormTarget,
  template: userTemplateTarget,
  studio_asset: studioAssetTarget,
} as const satisfies Record<EntityCommentType, ModerationTarget>;

const ITEM_LABEL = {
  agent: 'Agent',
  recipe: 'Rezept',
  template: 'Vorlage',
  studio_asset: 'Sticker/Hintergrund',
} as const satisfies Record<EntityCommentType, string>;

const EXCERPT_MAX = 140;

const excerptOf = (body: string): string => {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > EXCERPT_MAX ? `${flat.slice(0, EXCERPT_MAX - 1)}…` : flat;
};

/** The item a comment sits on, as the queue names it: its title when one is cheap to get. */
async function itemPreviews(
  rows: { entityType: EntityCommentType; entityId: string }[]
): Promise<Map<string, { title: string | null; href: string | null }>> {
  const out = new Map<string, { title: string | null; href: string | null }>();
  for (const type of Object.keys(ITEM_TARGET) as EntityCommentType[]) {
    const ids = [...new Set(rows.filter((r) => r.entityType === type).map((r) => r.entityId))];
    const rowIds = ids.filter(isRowId);
    const previews = await ITEM_TARGET[type].previews(rowIds);
    for (const id of ids) {
      const p = previews.get(id);
      const official = type === 'agent' && !isRowId(id) ? getSystemAgent(id) : undefined;
      out.set(`${type}:${id}`, {
        title: p?.title ?? official?.title ?? null,
        href: p?.href ?? null,
      });
    }
  }
  return out;
}

const commentReportable = eq(entityComments.moderation, 'ok');

const entityCommentTarget: ModerationTarget = {
  async loadReportable(id) {
    const [row] = await getDrizzleInstance()
      .select({ ownerId: entityComments.user_id })
      .from(entityComments)
      .where(and(eq(entityComments.id, id), commentReportable))
      .limit(1);
    return row ?? null;
  },
  async hideIf(db, id, when) {
    const rows = await db
      .update(entityComments)
      .set({ moderation: 'hidden' })
      .where(and(eq(entityComments.id, id), commentReportable, when))
      .returning({ id: entityComments.id });
    return rows.length > 0;
  },
  async setModeration(db, id, state, onlyFrom) {
    await db
      .update(entityComments)
      .set({ moderation: state })
      .where(
        and(
          eq(entityComments.id, id),
          onlyFrom ? eq(entityComments.moderation, onlyFrom) : undefined
        )
      );
    const [row] = await db
      .select({ moderation: entityComments.moderation })
      .from(entityComments)
      .where(eq(entityComments.id, id))
      .limit(1);
    return row?.moderation ?? null;
  },
  async previews(ids) {
    if (ids.length === 0) return new Map();
    const rows = await getDrizzleInstance()
      .select({
        id: entityComments.id,
        entityType: entityComments.entity_type,
        entityId: entityComments.entity_id,
        body: entityComments.body,
        moderation: entityComments.moderation,
        ownerId: entityComments.user_id,
        ownerName: profiles.display_name,
      })
      .from(entityComments)
      .leftJoin(profiles, eq(profiles.id, entityComments.user_id))
      .where(inArray(entityComments.id, ids));
    const items = await itemPreviews(rows);
    const out = new Map<string, AdminReportPreview>();
    for (const r of rows) {
      // The queue names an owner; a comment of a deleted person has none to name.
      if (!r.ownerId) continue;
      const item = items.get(`${r.entityType}:${r.entityId}`);
      out.set(r.id, {
        title: `„${excerptOf(r.body)}“ · ${ITEM_LABEL[r.entityType]} ${item?.title ?? r.entityId}`,
        thumbUrl: null,
        href: item?.href ?? null,
        ownerId: r.ownerId,
        ownerName: trimmedName(r.ownerName),
        moderation: r.moderation,
        trashed: false,
      });
    }
    return out;
  },
};

export const MODERATION_TARGETS = {
  studio_asset: studioAssetTarget,
  user_agent: userAgentTarget,
  user_text_form: userTextFormTarget,
  user_template: userTemplateTarget,
  entity_comment: entityCommentTarget,
} as const satisfies Record<ModeratableReportKind, ModerationTarget>;

/** The registry entry for a report kind and a well-formed row id, or null. */
export function moderationTargetFor(kind: ContentReportKind, id: string): ModerationTarget | null {
  const parsed = moderatableReportKindSchema.safeParse(kind);
  return parsed.success && isRowId(id) ? MODERATION_TARGETS[parsed.data] : null;
}
