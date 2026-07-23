import React from 'react';

import labelsJson from '@site/src/generated/ui-labels.json';

interface LabelEntry {
  title: string;
  subtitle?: string;
  path?: string;
}

const labels = labelsJson as Record<string, LabelEntry>;

const APP_URL = 'https://gruenerator.eu';

interface UiLabelProps {
  /** Namespaced key into ui-labels.json, e.g. "catalog.tool-scanner". */
  id: string;
  /** Render as a link to the tool's route (only when the entry has a `path`). */
  link?: boolean;
}

/**
 * Renders a UI catalog label pulled from the app's source configs (generated
 * into ui-labels.json by scripts/generate-ui-labels.mjs). An unknown id throws
 * at build time, so a removed or renamed catalog entry fails `docusaurus build`
 * instead of silently rotting the docs. Wrap in **…** in MDX for bold.
 */
export default function UiLabel({ id, link = false }: UiLabelProps): React.JSX.Element {
  const entry = labels[id];
  if (!entry) {
    throw new Error(
      `<UiLabel id="${id}"> — unknown label id. Regenerate with ` +
        `\`pnpm --filter @gruenerator/documentation labels:generate\` ` +
        `and confirm the id exists in src/generated/ui-labels.json.`
    );
  }
  if (link && entry.path) {
    return <a href={`${APP_URL}${entry.path}`}>{entry.title}</a>;
  }
  return <>{entry.title}</>;
}
