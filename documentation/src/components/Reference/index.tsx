import React from 'react';

import manifestJson from '@site/src/generated/reference.json';

import styles from './styles.module.css';

interface Collection {
  id: string;
  name: string;
  description?: string;
  codes?: string[];
}
interface Connector {
  title: string;
  auth: string;
  description: string;
}
/** A first-party connector. No auth column — nobody connects these. */
interface ManagedConnector {
  title: string;
  description: string;
  category: string;
}
interface Manifest {
  uploads: {
    groups: Array<{ id: string; title: string; labels: string[] }>;
    codeExtensions: string[];
    videoFormats: string[];
    limits: {
      maxFileSizeMB: number;
      maxTotalSizeMB: number;
      maxFiles: number;
      maxVideoFileSizeMB: number;
    };
  };
  collections: {
    nationwide: Collection[];
    landesverbaende: Collection[];
    examples: Collection[];
  };
  connectors: Record<string, Connector[]>;
  managedConnectors: ManagedConnector[];
}

const manifest = manifestJson as Manifest;

/**
 * Plain reference data, rendered straight from the code that owns it.
 *
 * Unlike ToolOverview or OfficeOps there is no hand-written half here and
 * therefore no audit: a file format, a byte cap or a connector's auth method is
 * a fact, not a phrasing. `reference:check` keeps the manifest fresh and that is
 * the whole contract.
 */
export function UploadFormats(): React.JSX.Element {
  const { groups, codeExtensions, videoFormats } = manifest.uploads;
  return (
    <div className={styles.grid}>
      {groups.map((group) => (
        <div key={group.id} className={styles.card}>
          <h4 className={styles.cardTitle}>{group.title}</h4>
          <p className={styles.body}>{group.labels.join(', ')}</p>
        </div>
      ))}
      <div className={styles.card}>
        <h4 className={styles.cardTitle}>Video</h4>
        <p className={styles.body}>{videoFormats.join(', ').toUpperCase()}</p>
      </div>
      <div className={styles.card}>
        <h4 className={styles.cardTitle}>Quellcode</h4>
        <p className={styles.body}>
          <code>{codeExtensions.join(' ')}</code>
        </p>
      </div>
    </div>
  );
}

/** The MCP-exposed collections, as a table. */
export function CollectionTable({
  kind,
}: {
  kind: 'nationwide' | 'landesverbaende';
}): React.JSX.Element {
  const rows = manifest.collections[kind];
  return (
    <table>
      <thead>
        <tr>
          <th>Sammlung</th>
          <th>Inhalt</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>
              <strong>{row.name}</strong>
            </td>
            <td>{row.description ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The connector directory, grouped the way the app groups it. */
export function ConnectorTable(): React.JSX.Element {
  return (
    <>
      {Object.entries(manifest.connectors).map(([category, entries]) => (
        <section key={category} className={styles.group}>
          <h3>{category}</h3>
          <table>
            <thead>
              <tr>
                <th>Dienst</th>
                <th>Wofür</th>
                <th>Anmeldung</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.title}>
                  <td>
                    <strong>{entry.title}</strong>
                  </td>
                  <td>{entry.description}</td>
                  <td>{entry.auth}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </>
  );
}

/**
 * The connectors the Grünerator operates itself. Renders nothing when there are
 * none — a deployment may have all of them switched off, and an empty table
 * under a heading would read as a bug.
 */
export function ManagedConnectorTable(): React.JSX.Element | null {
  const entries = manifest.managedConnectors;
  if (entries.length === 0) return null;
  return (
    <table>
      <thead>
        <tr>
          <th>Dienst</th>
          <th>Wofür</th>
          <th>Bereich</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.title}>
            <td>
              <strong>{entry.title}</strong>
            </td>
            <td>{entry.description}</td>
            <td>{entry.category}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Inline facts, so prose never repeats a number the code owns. */
export function Fact({
  name,
}: {
  name:
    | 'maxFileSize'
    | 'maxTotalSize'
    | 'maxFiles'
    | 'maxVideoSize'
    | 'nationwideCount'
    | 'lvCount'
    | 'connectorCount';
}): React.JSX.Element {
  const { limits } = manifest.uploads;
  switch (name) {
    case 'maxFileSize':
      return <>{limits.maxFileSizeMB} MB</>;
    case 'maxTotalSize':
      return <>{limits.maxTotalSizeMB} MB</>;
    case 'maxFiles':
      return <>{limits.maxFiles}</>;
    case 'maxVideoSize':
      return <>{limits.maxVideoFileSizeMB} MB</>;
    case 'nationwideCount':
      return <>{manifest.collections.nationwide.length}</>;
    case 'lvCount':
      return <>{manifest.collections.landesverbaende.length}</>;
    case 'connectorCount':
      return <>{Object.values(manifest.connectors).reduce((n, l) => n + l.length, 0)}</>;
    default:
      return <>{name}</>;
  }
}
