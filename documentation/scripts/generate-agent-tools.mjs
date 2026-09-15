/**
 * Generate documentation/src/generated/agent-tools.json — the tools a user can
 * switch on for their own Grünerator, read from the catalog that defines them:
 * `USER_SELECTABLE_TOOLS` in packages/shared/src/agents/userTools.ts.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * The table in the "Eigene Grüneratoren erstellen" guide was hand-typed from
 * that catalog, and it had already drifted: eleven rows against twelve keys,
 * with `cloud_files` ("Wolke") missing. The catalog is the single source of
 * truth for the picker in the agent builder, for the agent-creator system
 * prompt and for server-side validation — a docs table that disagrees with it
 * describes a checkbox nobody can find, or hides one that is there.
 *
 * Nothing here is hand-written. Unlike OfficeOps or ToolOverview, this manifest
 * needs no German notes alongside it: `label` and `description` in the catalog
 * are already the strings the user reads in the picker, so there is no second
 * half that could go missing and therefore nothing to audit. `--check` is the
 * whole contract.
 *
 * `DEFAULT_USER_AGENT_TOOLS` comes along so the article can mark which boxes
 * are ticked on a fresh agent without asserting it from memory.
 *
 * Usage:
 *   node scripts/generate-agent-tools.mjs           # write the JSON
 *   node scripts/generate-agent-tools.mjs --check   # exit 1 if committed JSON is stale
 */
import { constStringArray, fail, findDeclaration, parse, stringProp, ts } from './lib/ast.mjs';
import { runGenerator } from './lib/audit.mjs';

const SRC = 'packages/shared/src/agents/userTools.ts';
const OUT_FILE = 'documentation/src/generated/agent-tools.json';

function generate() {
  const sf = parse(SRC);

  const catalog = findDeclaration(sf, 'USER_SELECTABLE_TOOLS');
  if (!catalog || !ts.isArrayLiteralExpression(catalog)) {
    fail(SRC, 'USER_SELECTABLE_TOOLS', 'an array literal of { key, label, description }');
  }

  const tools = catalog.elements.map((el) => {
    if (!ts.isObjectLiteralExpression(el)) {
      fail(SRC, 'a USER_SELECTABLE_TOOLS entry', 'an object literal');
    }
    const key = stringProp(el, 'key');
    const label = stringProp(el, 'label');
    const description = stringProp(el, 'description');
    if (!key || !label || !description) {
      fail(SRC, `the entry for "${key ?? '?'}"`, 'string key, label and description');
    }
    return { key, label, description };
  });

  // Every entry the picker shows is a row; the defaults only decide a marker.
  const defaults = constStringArray(sf, 'DEFAULT_USER_AGENT_TOOLS');
  if (defaults.length === 0) {
    fail(SRC, 'DEFAULT_USER_AGENT_TOOLS', 'a non-empty string array');
  }
  const known = new Set(tools.map((t) => t.key));
  const unknown = defaults.filter((k) => !known.has(k));
  if (unknown.length > 0) {
    fail(SRC, `DEFAULT_USER_AGENT_TOOLS (${unknown.join(', ')})`, 'only keys from the catalog');
  }

  return {
    json: JSON.stringify({ tools, defaults }, null, 2) + '\n',
    summary: `${tools.length} Werkzeuge, ${defaults.length} davon ab Werk aktiv`,
  };
}

runGenerator({
  outFile: OUT_FILE,
  generate,
  regenerateCmd: 'pnpm --filter @gruenerator/documentation agent-tools:generate',
});
