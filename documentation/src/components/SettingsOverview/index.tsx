import React from 'react';

import manifestJson from '@site/src/generated/settings.json';

import { TAB_NOTES, type TabNote } from './tabNotes';
import styles from './styles.module.css';

interface Choice {
  value: string;
  label: string;
}
interface Manifest {
  tabs: { value: string; label: string }[];
  rows: Record<string, { tab: string; title: string; description?: string }>;
  choices: { theme: Choice[]; locale: Choice[]; startPage: Choice[] };
  textFormPresets: { textType: string; label: string; hint?: string }[];
  notifications: {
    groups: { key: string; label: string }[];
    types: { key: string; label: string; description: string; group: string }[];
    levels: { value: string; label: string; description: string }[];
  };
}

const manifest = manifestJson as Manifest;

/**
 * Drift between the settings dialog and this article is reported, not thrown:
 * a tab without a note still renders (with its generated rows), and
 * `settings:audit` files a GitHub issue naming it. A settings change should
 * never break someone else's docs build.
 */
function warnOnDrift(): void {
  if (process.env.NODE_ENV === 'production') return;
  const described = new Set(TAB_NOTES.map((n) => n.tab));
  const missing = manifest.tabs.filter((t) => !described.has(t.value)).map((t) => t.value);
  if (missing.length > 0) {
    console.warn(
      `[SettingsOverview] Ohne Beschreibung: ${missing.join(', ')}. ` +
        `Ergänze sie in src/components/SettingsOverview/tabNotes.ts.`
    );
  }
}

warnOnDrift();

/** Inline markdown-ish bold, so notes can emphasise a control's label. */
function renderBold(text: string): React.ReactNode {
  return text
    .split(/\*\*(.+?)\*\*/g)
    .map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}

function Choices({ title, items }: { title: string; items: Choice[] }): React.JSX.Element {
  return (
    <p className={styles.choices}>
      {title}: {items.map((c) => c.label).join(' · ')}
    </p>
  );
}

function Rows({ tab }: { tab: string }): React.JSX.Element | null {
  const rows = Object.entries(manifest.rows).filter(([, row]) => row.tab === tab);
  if (rows.length === 0) return null;
  return (
    <dl className={styles.rows}>
      {rows.map(([id, row]) => (
        <React.Fragment key={id}>
          <dt>{row.title}</dt>
          <dd>{row.description ?? '—'}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

function NotificationDetails(): React.JSX.Element {
  const { groups, types, levels } = manifest.notifications;
  return (
    <>
      <dl className={styles.rows}>
        {levels.map((level) => (
          <React.Fragment key={level.value}>
            <dt>{level.label}</dt>
            <dd>{level.description}</dd>
          </React.Fragment>
        ))}
      </dl>
      <p className={styles.choices}>
        In den erweiterten Einstellungen lässt sich jede der {types.length} Meldungsarten einzeln
        schalten — pro Kanal:
      </p>
      {groups.map((group) => {
        const inGroup = types.filter((t) => t.group === group.key);
        if (inGroup.length === 0) return null;
        return (
          <details key={group.key} className={styles.details}>
            <summary>
              {group.label} ({inGroup.length})
            </summary>
            <dl className={styles.rows}>
              {inGroup.map((type) => (
                <React.Fragment key={type.key}>
                  <dt>{type.label}</dt>
                  <dd>{type.description}</dd>
                </React.Fragment>
              ))}
            </dl>
          </details>
        );
      })}
    </>
  );
}

function TabSection({ tab, label }: { tab: string; label: string }): React.JSX.Element {
  const note: TabNote | undefined = TAB_NOTES.find((n) => n.tab === tab);
  return (
    <section className={styles.tab}>
      <h3 id={tab}>{label}</h3>
      {note && <p>{note.intro}</p>}
      <Rows tab={tab} />

      {tab === 'allgemein' && (
        <>
          <Choices title="Aussehen" items={manifest.choices.theme} />
          <Choices title="Sprache & Region" items={manifest.choices.locale} />
          <Choices title="Startseite" items={manifest.choices.startPage} />
        </>
      )}
      {tab === 'texte-anlernen' && (
        <p className={styles.choices}>
          Vorlagen: {manifest.textFormPresets.map((p) => p.label).join(' · ')}
        </p>
      )}
      {tab === 'benachrichtigungen' && <NotificationDetails />}

      {note?.extras && note.extras.length > 0 && (
        <ul>
          {note.extras.map((extra) => (
            <li key={extra}>{renderBold(extra)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The article body: every area of the settings dialog, in the dialog's order. */
export default function SettingsOverview(): React.JSX.Element {
  return (
    <>
      {manifest.tabs.map((tab) => (
        <TabSection key={tab.value} tab={tab.value} label={tab.label} />
      ))}
    </>
  );
}
