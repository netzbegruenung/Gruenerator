/**
 * Party-internal prompt text, loaded from disk at runtime.
 *
 * The public repo carries only *frontmatter* — for recipes
 * (`packages/shared/src/agents/skills/*.md`) and for system agents
 * (`.../agents/definitions/*.md`) alike: title, icon, category, routing
 * metadata. That is what the catalogue and the mention autocomplete need, and
 * it is harmless. The prompt text — measured corpus figures, opponent framing,
 * per-Landesverband speaker tactics, agent personas — lives here instead, in a
 * directory that is neither committed nor bundled.
 *
 * Why runtime and not codegen: both generated registries are committed on
 * purpose and ship inside the web and mobile bundles. Anything the codegen
 * touches is therefore public by construction, no matter what .gitignore says.
 * The split has to happen *after* the shared package, which is why the only
 * consumer is the API.
 *
 * Layout — one file per id, no frontmatter, body only:
 *   <INTERN_CONTENT_DIR>/skills/presse-berlin.md      (keyed by skill mention)
 *   <INTERN_CONTENT_DIR>/agents/gruenerator-antrag.md (keyed by agent identifier)
 *   <INTERN_CONTENT_DIR>/rollen/mdb-buero.md          (keyed by role baustein key)
 *
 * A missing directory is a no-op, not a crash — see the two callers for what
 * each degrades to. That keeps forks and fresh clones runnable, so the warning
 * below is the only signal that a rollout did not land. Read it as such.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { env } from '../../config/env.js';
import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('internalPrompts');

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Gitignored sibling checkout used in development when the env var is unset. */
const DEV_FALLBACK_DIR = resolve(__dirname, '../../../../.external/gruenerator-intern');

/** Strips an accidental YAML frontmatter block — the private files carry none. */
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;

type Kind = 'skills' | 'agents' | 'rollen';

const caches = new Map<Kind, Map<string, string>>();

function load(kind: Kind): Map<string, string> {
  const root = env.INTERN_CONTENT_DIR ?? DEV_FALLBACK_DIR;
  const dir = resolve(root, kind);
  const prompts = new Map<string, string>();

  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  } catch (error) {
    log.warn(
      `No internal ${kind} prompts at ${dir} — set INTERN_CONTENT_DIR or check the ` +
        `Salt rollout. (${toError(error).message})`
    );
    return prompts;
  }

  for (const file of files) {
    const id = file.slice(0, -'.md'.length);
    try {
      const body = readFileSync(resolve(dir, file), 'utf8').replace(FRONTMATTER, '').trim();
      if (body) prompts.set(id, body);
    } catch (error) {
      log.error(`Failed to read internal ${kind} prompt ${file}: ${toError(error).message}`);
    }
  }

  log.info(`Loaded ${prompts.size} internal ${kind} prompt(s) from ${dir}`);
  return prompts;
}

function get(kind: Kind, id: string): string | null {
  let cache = caches.get(kind);
  if (!cache) {
    cache = load(kind);
    caches.set(kind, cache);
  }
  return cache.get(id) ?? null;
}

/**
 * The prompt body for a skill mention, or null when the recipe has no internal
 * body (or the directory was never rolled out). Null degrades to the agent's
 * base systemRole — the turn still answers, just without the recipe's craft
 * rules.
 *
 * Cached after the first call: Salt writes the files before the service boots,
 * so a changed prompt needs a restart, same as the codegen-backed metadata.
 */
export function getInternalSkillPrompt(mention: string): string | null {
  return get('skills', mention);
}

/**
 * The `systemRole` of a system agent, or null when it was never rolled out.
 *
 * Unlike a recipe, an agent has nothing to fall back *to* — its systemRole is
 * the persona. The caller (routes/chat/agents/agentLoader.ts) substitutes a
 * generic role and logs loudly rather than handing an empty system prompt to
 * the model, which `promptAssemblyGraph.buildSystemText` would reject outright.
 */
export function getInternalAgentPrompt(identifier: string): string | null {
  return get('agents', identifier);
}

/**
 * Der Auftrag zu einem Rollen-Baustein (`roleBausteinKey` aus
 * `@gruenerator/shared/roles`), oder null, wenn er nie ausgerollt wurde.
 *
 * Null degradiert wie ein Rezept: der Rollen-Chat fällt auf den Basis-Agenten
 * zurück und antwortet ohne Rollenzuschnitt. Der Aufrufer
 * (`services/roles/roleSystemPrompt.ts`) loggt das — anders als bei einem
 * Rezept ist es hier die einzige Wirkung, die die Rolle überhaupt hat.
 */
export function getInternalRolePrompt(key: string): string | null {
  return get('rollen', key);
}

/** How many bodies are loaded. Boot diagnostics and the prompt endpoint use it. */
export function getInternalPromptCount(kind: Kind): number {
  let cache = caches.get(kind);
  if (!cache) {
    cache = load(kind);
    caches.set(kind, cache);
  }
  return cache.size;
}
