import React from 'react';

import manifestJson from '@site/src/generated/tools.json';

import { TOOL_NOTES, type Platform } from './toolNotes';
import styles from './styles.module.css';

interface Tool {
  id: string;
  title: string;
  description?: string;
  path?: string;
  external?: boolean;
  create?: string;
}
interface Group {
  id: string;
  title: string;
  tools: Tool[];
}
interface Manifest {
  groups: Group[];
  catalog: Record<string, { title: string; path: string; subtitle?: string }>;
  publicRoutes: string[];
}

const manifest = manifestJson as Manifest;

const PLATFORM_LABEL: Record<Platform, string> = {
  web: 'Web',
  desktop: 'Desktop-App',
  mobile: 'Handy-App',
};

/**
 * A tool in the code without a note here degrades to its generated title and
 * description — never to a broken page. `tools:audit` reports the gap as a
 * GitHub issue instead, the same philosophy as ChatCapabilities: adding a tool
 * must not break someone else's docs build.
 *
 * Locally a warning still points at the drift while you work.
 */
function warnOnDrift(): void {
  if (process.env.NODE_ENV === 'production') return;
  const missing = manifest.groups
    .flatMap((g) => g.tools)
    .filter((t) => !TOOL_NOTES[t.id])
    .map((t) => t.id);
  if (missing.length > 0) {
    console.warn(
      `[ToolOverview] Ohne Beschreibung und daher nur mit Kurztext: ${missing.join(', ')}. ` +
        `Ergänze sie in src/components/ToolOverview/toolNotes.ts.`
    );
  }
}

warnOnDrift();

function ToolCard({ tool }: { tool: Tool }): React.JSX.Element {
  const note = TOOL_NOTES[tool.id];
  const isPublic = tool.path ? manifest.publicRoutes.includes(tool.path) : false;

  return (
    <div className={styles.tool}>
      <h4 className={styles.toolTitle}>{tool.title}</h4>

      <div className={styles.badges}>
        {tool.path && <span className={`${styles.badge} ${styles.path}`}>{tool.path}</span>}
        {tool.create && <span className={styles.badge}>legt direkt an</span>}
        {tool.external && <span className={styles.badge}>externe Seite</span>}
        {isPublic && <span className={styles.badge}>ohne Anmeldung</span>}
        {note?.platform.map((p) => (
          <span key={p} className={styles.badge}>
            {PLATFORM_LABEL[p]}
          </span>
        ))}
      </div>

      {tool.description && <p className={styles.description}>{tool.description}</p>}
      {note && <p className={styles.note}>{note.note}</p>}
      {note?.readMore && (
        <p className={styles.readMore}>
          <a href={note.readMore.href}>{note.readMore.label} →</a>
        </p>
      )}
    </div>
  );
}

export default function ToolOverview(): React.JSX.Element {
  return (
    <>
      {manifest.groups.map((group) => (
        <section key={group.id} className={styles.group}>
          <h3 id={group.id}>{group.title}</h3>
          <div className={styles.grid}>
            {group.tools.map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

/** Small print for the article footer: how many tools this page covers. */
export function ToolOverviewCount(): React.JSX.Element {
  return <>{manifest.groups.reduce((n, g) => n + g.tools.length, 0)}</>;
}
