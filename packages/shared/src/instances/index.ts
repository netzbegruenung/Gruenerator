/**
 * Single source of truth for the **instances** the Grünerator is deployed as.
 *
 * An instance is one deployment: its own domain, its own Postgres, and its own
 * selection of the shared content registries (notebooks, agents, tools, routes).
 * `beta.gruenerator.eu` and a Bundesgeschäftsstelle instance are the first two
 * beside the general `gruenerator.eu`.
 *
 * Two axes, deliberately kept apart:
 *
 *   - **`channel`** sits on the CONTENT and states its maturity (`stable` /
 *     `preview` / `internal`). Each instance declares which channels it serves.
 *     This replaces the old binary `devOnly` + `import.meta.env.DEV` gate, which
 *     could only ever distinguish "dev" from "everything else".
 *   - **`hide` / `block`** sit on the INSTANCE and curate the shared registries.
 *     Content never names instances — otherwise every new instance would mean
 *     touching every piece of content. Curation goes through dimensions the
 *     content already has (a notebook's `category`), so a new Landesverband
 *     notebook inherits the rule for free.
 *
 * **Pure data and pure functions — no `import.meta.env`, no framework imports.**
 * This module is consumed by the web bundle, the React Native binary and the
 * Node backend alike, and only the first of those has `import.meta.env`. Each
 * app resolves its own instance once (from an explicit env var or the host) and
 * passes the id in, exactly like `userLocale` is passed to `audience.ts`.
 *
 * `InstanceId` is **F1 — intern eingefroren** (CLAUDE.md): ids are not renamed,
 * a comment is cheaper than a migration. Should an id ever cross the wire or
 * land in persisted state, it becomes F0 and may only be extended additively.
 */
import type { NotebookCategory, NotebookId } from '../notebooks/index.js';

/**
 * Maturity of a piece of content. Content without an explicit channel is
 * `stable` — the default keeps every existing registry entry visible.
 *
 * - `stable` — generally available.
 * - `preview` — ready to be tried on the test instance, not on production.
 * - `internal` — unfinished; only visible while developing. Successor of the
 *   old `devOnly` flag.
 */
export type InstanceChannel = 'stable' | 'preview' | 'internal';

/**
 * Which shared content an instance does not carry.
 *
 * Prefer `notebookCategories` over `notebookIds`: the category rule keeps
 * working when a new notebook of that category is added, the id list does not.
 * `notebookIds` exists for the cases a category cannot express.
 */
export interface InstanceContentPolicy {
  notebookCategories?: readonly NotebookCategory[];
  notebookIds?: readonly NotebookId[];
  /**
   * Tool ids to hide from tiles/search/menus. `apps/web/src/config/toolRegistry.ts`
   * is the canonical id space, but its two literal mirrors (workplaceToolsConfig's
   * `OFFICE_SUITE_TOOLS`, toolCatalog's search entries) sometimes use a different
   * id for the same tool (e.g. `canvas-vorlagen` vs. `vorlagen` vs. `tool-vorlagen`)
   * — list every alias that should disappear, not just the canonical one.
   */
  toolIds?: readonly string[];
}

/**
 * The part of an instance that decides what content it carries.
 *
 * Split out from {@link InstanceDefinition} so the policy can be evaluated
 * without a deployment behind it: the registry holds no instance that hides
 * anything yet, so `hidden` and `blocked` would otherwise be untestable until
 * the day someone fills a policy in — which is exactly the day a regression
 * would ship unnoticed. Tests build a view; production passes `getInstance(id)`,
 * which satisfies this shape structurally.
 */
export type InstancePolicyView = Pick<InstanceDefinition, 'channels' | 'hide' | 'block'>;

export interface InstanceDefinition {
  id: string;
  /** Hostnames served by this instance, lowercase and without port. */
  hosts: readonly string[];
  channels: readonly InstanceChannel[];
  /**
   * Not offered: gone from galleries, mention pickers, agent inventories and
   * from *implicit* chat search — but a direct link still resolves, so a link
   * shared from another instance never 404s (URL-Sonderrecht, CLAUDE.md).
   */
  hide?: InstanceContentPolicy;
  /**
   * Not reachable at all — a direct link 404s too. For real restrictions, not
   * for curation.
   */
  block?: InstanceContentPolicy;
  /**
   * Pins the user locale for this instance. The locale stays a per-user value
   * everywhere else; the instance only supplies it and hides the settings
   * toggle. See `agents/audience.ts` for what the locale actually drives.
   */
  defaultLocale?: 'de-DE' | 'de-AT';
  lockedLocale?: boolean;
  /**
   * Suggested "Deine Rollen" entry for a user who hasn't set any role yet.
   * `ebeneId`/`rolle` must match an existing `DE_EBENEN`/`DE_ROLLEN` pair
   * (`packages/shared/src/roles/rolesConfig.ts`) — this only pre-selects the
   * wizard, it does not introduce a new role string. The user can still pick
   * a different role; nothing is persisted until they do.
   */
  defaultRole?: { ebeneId: string; rolle: string };
  /**
   * Fixed hero greeting overriding the DE/AT rotation in
   * `utils/greeting.ts`. Same `@Vorname` token as the rotation templates.
   */
  heroGreeting?: string;
}

export const INSTANCES = [
  {
    id: 'production',
    hosts: ['gruenerator.eu', 'www.gruenerator.eu'],
    channels: ['stable'],
    block: {
      notebookIds: ['gruene-notebook'],
    },
  },
  {
    id: 'beta',
    hosts: ['beta.gruenerator.eu'],
    channels: ['stable', 'preview'],
    block: {
      notebookIds: ['gruene-notebook'],
    },
  },
  {
    id: 'bgst',
    hosts: ['bgst.gruenerator.eu'],
    channels: ['stable'],
    hide: {
      toolIds: ['canvas-vorlagen', 'reels-untertitel', 'vorlagen', 'tool-vorlagen', 'tool-reel'],
    },
    defaultRole: { ebeneId: 'bund', rolle: 'Mitarbeiter*in Bundesgeschäftsstelle' },
    heroGreeting: 'Willkommen zur Bgst-KI, @Vorname',
  },
  {
    id: 'local',
    hosts: ['localhost', '127.0.0.1', '[::1]'],
    channels: ['stable', 'preview', 'internal'],
    block: {
      notebookIds: ['gruene-notebook'],
    },
  },
] as const satisfies readonly InstanceDefinition[];

export type InstanceId = (typeof INSTANCES)[number]['id'];

/**
 * The instance an unknown host resolves to. Production serves only `stable`
 * content, so an unrecognised deployment shows the conservative selection
 * rather than accidentally exposing unfinished work.
 */
export const DEFAULT_INSTANCE_ID = 'production' satisfies InstanceId;

const INSTANCE_BY_ID = new Map<string, InstanceDefinition>(INSTANCES.map((i) => [i.id, i]));

const INSTANCE_BY_HOST = new Map<string, InstanceId>(
  INSTANCES.flatMap((i) => i.hosts.map((h) => [h, i.id] as const))
);

export function isInstanceId(value: unknown): value is InstanceId {
  return typeof value === 'string' && INSTANCE_BY_ID.has(value);
}

export function getInstance(id: InstanceId): InstanceDefinition {
  // Non-null by construction: `InstanceId` is derived from the same array.
  return INSTANCE_BY_ID.get(id) as InstanceDefinition;
}

/**
 * Normalize a `window.location.hostname` / `Host` header to a registry key:
 * lowercase, port stripped, trailing dot removed. IPv6 literals keep their
 * brackets, which is how `location.hostname` reports them.
 */
function normalizeHost(hostname: string): string {
  const trimmed = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (trimmed.startsWith('[')) {
    const close = trimmed.indexOf(']');
    return close === -1 ? trimmed : trimmed.slice(0, close + 1);
  }
  const colon = trimmed.indexOf(':');
  return colon === -1 ? trimmed : trimmed.slice(0, colon);
}

/**
 * The single place an instance is determined. Every app feeds it what it has:
 * the web build an explicit `VITE_INSTANCE_ID` and `window.location.hostname`,
 * the backend its `INSTANCE_ID` env var, mobile/desktop the origin of the API
 * they are configured against (they ship as one binary and have no build-time
 * instance of their own).
 *
 * An explicit id always wins over the host, so a preview deployment can be
 * pointed at another instance's selection without moving domains. Anything
 * unrecognised falls back to {@link DEFAULT_INSTANCE_ID}, which is what makes
 * introducing this module a no-op for existing deployments.
 */
export function resolveInstance(source: {
  explicitId?: string | null;
  hostname?: string | null;
}): InstanceId {
  if (isInstanceId(source.explicitId)) return source.explicitId;
  if (source.hostname) {
    const matched = INSTANCE_BY_HOST.get(normalizeHost(source.hostname));
    if (matched) return matched;
  }
  return DEFAULT_INSTANCE_ID;
}

/**
 * Does this instance serve content of the given maturity? Content without a
 * channel counts as `stable`, so every registry entry that predates this module
 * stays visible everywhere.
 */
export function isChannelVisibleIn(
  channel: InstanceChannel | null | undefined,
  instanceId: InstanceId
): boolean {
  return isChannelServedBy(channel, getInstance(instanceId));
}

/** {@link isChannelVisibleIn} against a policy view rather than a registered id. */
export function isChannelServedBy(
  channel: InstanceChannel | null | undefined,
  view: InstancePolicyView
): boolean {
  const effective: InstanceChannel = channel ?? 'stable';
  return view.channels.includes(effective);
}

/** Does `policy` cover this notebook? Shared by the hide and block tiers. */
export function policyCoversNotebook(
  policy: InstanceContentPolicy | null | undefined,
  notebook: { id: string; category: NotebookCategory }
): boolean {
  if (!policy) return false;
  if (policy.notebookIds?.some((id) => id === notebook.id)) return true;
  return policy.notebookCategories?.includes(notebook.category) ?? false;
}

/** Does `policy` cover this tool id? Shared by the hide and block tiers. */
export function policyCoversTool(
  policy: InstanceContentPolicy | null | undefined,
  toolId: string
): boolean {
  return policy?.toolIds?.includes(toolId) ?? false;
}

/**
 * The locale this instance pins, or null when users choose their own.
 * Callers resolve the user's stored locale when this returns null.
 */
export function getPinnedLocale(instanceId: InstanceId): 'de-DE' | 'de-AT' | null {
  const instance = getInstance(instanceId);
  return instance.lockedLocale === true && instance.defaultLocale ? instance.defaultLocale : null;
}
