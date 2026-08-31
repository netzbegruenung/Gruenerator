import React from 'react';

import manifestJson from '@site/src/generated/agent-tools.json';

interface Tool {
  key: string;
  label: string;
  description: string;
}
interface Manifest {
  tools: Tool[];
  defaults: string[];
}

const manifest = manifestJson as Manifest;

/**
 * The tool checkboxes in the agent builder, straight from the app's catalog
 * (`USER_SELECTABLE_TOOLS`) via scripts/generate-agent-tools.mjs. The table
 * this replaced was hand-kept and had already lost a row, which is the whole
 * reason it is generated now.
 */
export default function AgentTools(): React.JSX.Element {
  const defaults = new Set(manifest.defaults);
  return (
    <table>
      <thead>
        <tr>
          <th>Werkzeug</th>
          <th>Funktion</th>
        </tr>
      </thead>
      <tbody>
        {manifest.tools.map((tool) => (
          <tr key={tool.key}>
            <td>
              <strong>{tool.label}</strong>
              {defaults.has(tool.key) ? ' *' : ''}
            </td>
            <td>{tool.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The names of the tools a fresh agent starts with, for use in a sentence. */
export function AgentToolDefaults(): React.JSX.Element {
  const names = manifest.tools
    .filter((tool) => manifest.defaults.includes(tool.key))
    .map((tool) => tool.label);
  return (
    <>
      {names.map((name, i) => (
        <React.Fragment key={name}>
          {i > 0 ? (i === names.length - 1 ? ' und ' : ', ') : ''}
          <strong>{name}</strong>
        </React.Fragment>
      ))}
    </>
  );
}
