import React from 'react';

import manifestJson from '@site/src/generated/chat-capabilities.json';

import { EXAMPLES, GROUPS, INTERNAL_INTENTS, type CapabilityExample } from './examples';
import styles from './styles.module.css';

interface Mentionable {
  title: string;
  description?: string;
  mention?: string;
  audience?: string;
}
interface Manifest {
  intents: string[];
  mentionables: Record<string, Mentionable>;
  userTools: Record<string, { label: string; description: string }>;
  systemSources: Record<string, { name: string; capability: string; env?: string }>;
  systemIntentSources: Record<string, string[]>;
}

const manifest = manifestJson as Manifest;

const REGENERATE = 'pnpm --filter @gruenerator/documentation capabilities:generate';

/**
 * The drift trap. Runs at module load, i.e. during `docusaurus build`, so every
 * mismatch between the code's capability registries and this article is a red
 * build rather than a quietly outdated page:
 *
 *   - a NEW intent in the code has no example questions here → build fails, and
 *     whoever added the capability writes the two sentences users need,
 *   - a REMOVED or renamed intent still documented here → build fails,
 *   - a mentionable / tool key referenced by an example vanished → build fails.
 */
function assertInSync(): void {
  const documented = new Set([...EXAMPLES.map((e) => e.intent), ...Object.keys(INTERNAL_INTENTS)]);
  const known = new Set(manifest.intents);
  const problems: string[] = [];

  for (const intent of manifest.intents) {
    if (!documented.has(intent)) {
      problems.push(
        `Der Chat kennt den Intent "${intent}", der Artikel nicht. Trag ihn mit ` +
          `2–3 Musterfragen in src/components/ChatCapabilities/examples.ts ein ` +
          `(oder in INTERNAL_INTENTS, wenn er nichts ist, das man fragen kann).`
      );
    }
  }
  for (const intent of documented) {
    if (!known.has(intent)) {
      problems.push(
        `examples.ts dokumentiert "${intent}", den es im Code nicht mehr gibt. ` +
          `Eintrag entfernen — oder das Manifest ist veraltet: ${REGENERATE}`
      );
    }
  }
  const groupIds = new Set(GROUPS.map((g) => g.id));
  for (const example of EXAMPLES) {
    if (!groupIds.has(example.group)) {
      problems.push(`"${example.intent}" verweist auf die unbekannte Gruppe "${example.group}".`);
    }
    if (example.questions.length < 2) {
      problems.push(`"${example.intent}" braucht mindestens zwei Musterfragen.`);
    }
    if (example.mentionable && !manifest.mentionables[example.mentionable]) {
      problems.push(
        `"${example.intent}" verweist auf die Mention "${example.mentionable}", ` +
          `die im Manifest fehlt. Umbenannt oder entfernt? ${REGENERATE}`
      );
    }
    if (example.userTool && !manifest.userTools[example.userTool]) {
      problems.push(
        `"${example.intent}" verweist auf das Werkzeug "${example.userTool}", ` +
          `das im Manifest fehlt. Umbenannt oder entfernt? ${REGENERATE}`
      );
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `<ChatCapabilities> ist nicht mehr synchron mit dem Code:\n  - ${problems.join('\n  - ')}`
    );
  }
}

assertInSync();

function Badge({ kind, children }: { kind: string; children: React.ReactNode }): React.JSX.Element {
  return <span className={`${styles.badge} ${styles[kind] ?? ''}`}>{children}</span>;
}

function Capability({ example }: { example: CapabilityExample }): React.JSX.Element {
  const mentionable = example.mentionable ? manifest.mentionables[example.mentionable] : undefined;
  const userTool = example.userTool ? manifest.userTools[example.userTool] : undefined;
  const sourceKeys = manifest.systemIntentSources[example.intent] ?? [];
  const sourceNames = sourceKeys
    .map((key) => manifest.systemSources[key]?.name)
    .filter((name): name is string => Boolean(name));

  return (
    <div className={styles.capability}>
      <h4 className={styles.capabilityTitle}>{mentionable?.title ?? example.label}</h4>

      <div className={styles.badges}>
        {mentionable?.mention && <Badge kind="mention">{mentionable.mention}</Badge>}
        {userTool && <Badge kind="tool">Werkzeug: {userTool.label}</Badge>}
        {mentionable?.audience === 'de-DE' && <Badge kind="note">nur Deutschland</Badge>}
        {sourceNames.length > 0 && (
          <Badge kind="note">Quelle: {sourceNames.join(' + ')} (Freischaltung nötig)</Badge>
        )}
      </div>

      {mentionable?.description && <p className={styles.description}>{mentionable.description}</p>}
      {example.hint && <p className={styles.description}>{example.hint}</p>}

      <ul className={styles.questions}>
        {example.questions.map((question) => (
          <li key={question}>„{question}"</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The article body: every documented capability grouped by theme, with its name
 * and description pulled from the app's registries and its example questions
 * from examples.ts.
 */
export default function ChatCapabilities(): React.JSX.Element {
  return (
    <>
      {GROUPS.map((group) => {
        const items = EXAMPLES.filter((e) => e.group === group.id);
        if (items.length === 0) return null;
        return (
          <section key={group.id} className={styles.group}>
            <h3 id={group.id}>{group.title}</h3>
            <p>{group.intro}</p>
            <div className={styles.grid}>
              {items.map((example) => (
                <Capability key={example.intent} example={example} />
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

/** Small print for the article footer: how many capabilities this page covers. */
export function ChatCapabilitiesCount(): React.JSX.Element {
  return <>{EXAMPLES.length}</>;
}
