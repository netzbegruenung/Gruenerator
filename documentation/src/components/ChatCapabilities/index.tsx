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

/**
 * Drift between the code's capability registries and this article — a new intent
 * without example questions, a documented intent that no longer exists, a dead
 * mentionable reference — is deliberately NOT fatal here. The page degrades to
 * what it can show (unknown references simply fall back to the local label), and
 * `capabilities:audit` reports the gap as a GitHub issue instead. A backend
 * change should never break someone else's docs build.
 *
 * Locally, a warning still points at the drift while you work.
 */
function warnOnDrift(): void {
  if (process.env.NODE_ENV === 'production') return;
  const documented = new Set([...EXAMPLES.map((e) => e.intent), ...Object.keys(INTERNAL_INTENTS)]);
  const missing = manifest.intents.filter((intent) => !documented.has(intent));
  if (missing.length > 0) {
    console.warn(
      `[ChatCapabilities] Ohne Musterfragen und daher nicht im Artikel: ${missing.join(', ')}. ` +
        `Ergänze sie in src/components/ChatCapabilities/examples.ts.`
    );
  }
}

warnOnDrift();

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
          <Badge kind="note">Zusatzquelle: {sourceNames.join(' + ')}</Badge>
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
        // Only capabilities the code still has — a removed intent drops off the
        // page by itself; the audit asks someone to delete its entry.
        const known = new Set(manifest.intents);
        const items = EXAMPLES.filter((e) => e.group === group.id && known.has(e.intent));
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
