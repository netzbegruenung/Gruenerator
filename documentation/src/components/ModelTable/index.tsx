import React from 'react';

import { manifest, type ModelEntry, type Role } from '@site/src/components/modelsManifest';

/** German wording for the two non-primary roles. */
const ROLE_LABEL: Record<Exclude<Role, 'primary'>, string> = {
  fallback: 'Ausweichweg',
  overflow: 'Überlauf',
};

function uniqueLabels(entries: ModelEntry[]): ModelEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = `${entry.label}|${entry.code}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Which model serves which task, and where it runs — rendered straight from
 * `src/generated/models.json`, which `models:generate` reads out of the
 * routing code itself. A lane that moves host shows up here on the next
 * generate; `models:check` fails the build if someone forgets.
 */
export function ModelTable(): React.JSX.Element {
  return (
    <table>
      <thead>
        <tr>
          <th>Aufgabe</th>
          <th>Modell</th>
          <th>Läuft bei</th>
        </tr>
      </thead>
      <tbody>
        {manifest.rows.map((row) => {
          const primary = row.models.filter((m) => m.role === 'primary');
          const others = row.models.filter((m) => m.role !== 'primary');
          return (
            <tr key={row.id}>
              <td>{row.task}</td>
              <td>
                {uniqueLabels(primary).map((entry, i) => (
                  <React.Fragment key={entry.model}>
                    {i > 0 && ', '}
                    {entry.label} (<code>{entry.code}</code>)
                  </React.Fragment>
                ))}
              </td>
              <td>
                {[...new Set(primary.map((m) => `${m.host} ${m.flag}`))].join(' / ')}
                {others.map((entry) => (
                  <React.Fragment key={`${entry.provider}-${entry.model}`}>
                    {' '}
                    ({ROLE_LABEL[entry.role as Exclude<Role, 'primary'>]} {entry.host} {entry.flag})
                  </React.Fragment>
                ))}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** The hosts named in the table above, as a sentence-ready list. */
export function ModelHosts(): React.JSX.Element {
  return <>{manifest.hosts.join(', ')}</>;
}
