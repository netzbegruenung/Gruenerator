/**
 * Party-internal skill prompt bodies, loaded from disk at runtime.
 *
 * The public repo carries only the *frontmatter* of each recipe
 * (`packages/shared/src/agents/skills/*.md` → `index.generated.ts`): title,
 * icon, category, mention. That metadata is what the catalogue and the mention
 * autocomplete need, and it is harmless. The prompt body — measured corpus
 * figures, opponent framing, per-Landesverband speaker tactics — lives here
 * instead, in a directory that is neither committed nor bundled.
 *
 * Why runtime and not codegen: `index.generated.ts` is committed on purpose
 * (see skills/index.ts) and ships inside the web and mobile bundles. Anything
 * the codegen touches is therefore public by construction, no matter what
 * .gitignore says. The split has to happen *after* the shared package, which is
 * why the only consumer is the API.
 *
 * Layout — one file per mention, no frontmatter, body only:
 *   <SKILLS_INTERN_DIR>/presse-berlin.md
 *   <SKILLS_INTERN_DIR>/instagram.md
 *
 * A missing directory is a no-op, not a crash: recipes fall back to the agent's
 * base systemRole. That keeps forks and fresh clones runnable, so the warning
 * below is the only signal that a rollout did not land — read it as such.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { env } from '../../config/env.js';
import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('internalSkillPrompts');

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Gitignored sibling checkout used in development when the env var is unset. */
const DEV_FALLBACK_DIR = resolve(__dirname, '../../../../.external/gruenerator-intern/skills');

/** Strips an accidental YAML frontmatter block — the private files carry none. */
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;

let cache: Map<string, string> | null = null;

function load(): Map<string, string> {
  const dir = env.SKILLS_INTERN_DIR ?? DEV_FALLBACK_DIR;
  const prompts = new Map<string, string>();

  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  } catch (error) {
    log.warn(
      `No internal skill prompts at ${dir} — recipes fall back to the agent's base systemRole. ` +
        `Set SKILLS_INTERN_DIR or check the Salt rollout. (${toError(error).message})`
    );
    return prompts;
  }

  for (const file of files) {
    const mention = file.slice(0, -'.md'.length);
    try {
      const body = readFileSync(resolve(dir, file), 'utf8').replace(FRONTMATTER, '').trim();
      if (body) prompts.set(mention, body);
    } catch (error) {
      log.error(`Failed to read internal skill prompt ${file}: ${toError(error).message}`);
    }
  }

  log.info(`Loaded ${prompts.size} internal skill prompt(s) from ${dir}`);
  return prompts;
}

/**
 * The prompt body for a skill mention, or null when the recipe has no internal
 * body (or the directory was never rolled out).
 *
 * Cached after the first call — Salt writes the files before the service boots,
 * so a changed prompt needs a restart, same as the codegen-backed metadata.
 */
export function getInternalSkillPrompt(mention: string): string | null {
  cache ??= load();
  return cache.get(mention) ?? null;
}

/** How many bodies are loaded. Boot diagnostics and the prompt endpoint use it. */
export function getInternalSkillPromptCount(): number {
  cache ??= load();
  return cache.size;
}
