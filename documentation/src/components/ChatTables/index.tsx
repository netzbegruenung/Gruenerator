import React from 'react';

import manifestJson from '@site/src/generated/chat-capabilities.json';

interface Skill {
  command: string;
  title: string;
  description: string;
  avatar: string;
  category: string;
  audience?: string;
}
interface NotebookSource {
  id: string;
  mention: string;
  title: string;
  description: string;
  avatar: string;
  category: string;
  audience?: string;
}
interface SharepicVariant {
  type: string;
  keywords: string[];
  standard: boolean;
}
interface Mentionable {
  title: string;
  description?: string;
  mention?: string;
  audience?: string;
}
interface Manifest {
  mentionables: Record<string, Mentionable>;
  skills: Skill[];
  skillCategoryLabels: Record<string, string>;
  notebookSources: NotebookSource[];
  sharepicVariants: SharepicVariant[];
}

const manifest = manifestJson as unknown as Manifest;

function AudienceNote({ audience }: { audience?: string }): React.JSX.Element | null {
  if (audience === 'de-DE') return <> (nur Deutschland)</>;
  if (audience === 'de-AT') return <> (nur Österreich)</>;
  return null;
}

/**
 * The Rezepte, grouped by their UI category. Rendered straight
 * from the generated manifest, so a new recipe in
 * `packages/shared/src/agents/skills/` appears here after
 * `capabilities:generate` — and a removed one disappears.
 */
export function RecipeTables(): React.JSX.Element {
  const categories = Object.entries(manifest.skillCategoryLabels).filter(([id]) =>
    manifest.skills.some((skill) => skill.category === id)
  );
  return (
    <>
      {categories.map(([id, label]) => (
        <React.Fragment key={id}>
          <h4>{label}</h4>
          <table>
            <thead>
              <tr>
                <th>Befehl</th>
                <th>Rezept</th>
                <th>Beschreibung</th>
              </tr>
            </thead>
            <tbody>
              {manifest.skills
                .filter((skill) => skill.category === id)
                .map((skill) => (
                  <tr key={skill.command}>
                    <td>
                      <code>{skill.command}</code>
                    </td>
                    <td>
                      {skill.avatar} {skill.title}
                    </td>
                    <td>
                      {skill.description}
                      <AudienceNote audience={skill.audience} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </React.Fragment>
      ))}
    </>
  );
}

/** The `@`-sources (system notebooks) in gallery order. */
export function SourceTable(): React.JSX.Element {
  return (
    <table>
      <thead>
        <tr>
          <th>Kürzel</th>
          <th>Quelle</th>
          <th>Inhalt</th>
        </tr>
      </thead>
      <tbody>
        {manifest.notebookSources.map((source) => (
          <tr key={source.id}>
            <td>
              <code>{source.mention}</code>
            </td>
            <td>
              {source.avatar} {source.title}
            </td>
            <td>
              {source.description}
              <AudienceNote audience={source.audience} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Every `@`-mentionable werkzeug — the intent-backed tools, the artefact
 * creators and the picker triggers — sorted by mention.
 */
export function ToolMentionTable(): React.JSX.Element {
  const tools = Object.entries(manifest.mentionables)
    .filter(([, m]) => Boolean(m.mention))
    .sort(([, a], [, b]) => (a.mention as string).localeCompare(b.mention as string, 'de'));
  return (
    <table>
      <thead>
        <tr>
          <th>Kürzel</th>
          <th>Werkzeug</th>
          <th>Beschreibung</th>
        </tr>
      </thead>
      <tbody>
        {tools.map(([key, tool]) => (
          <tr key={key}>
            <td>
              <code>{tool.mention}</code>
            </td>
            <td>{tool.title}</td>
            <td>
              {tool.description ?? ''}
              <AudienceNote audience={tool.audience} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Display names for the sharepic variant types. The type ids are frozen
 * registry ids (F1); the labels here are presentation copy for the docs.
 */
const VARIANT_LABELS: Record<string, string> = {
  dreizeilen: 'Dreizeiler',
  zitat: 'Zitat',
  info: 'Info',
  slider: 'Slider / Karussell',
};

/** The keywords that pin a sharepic request to a specific variant. */
export function SharepicVariantTable(): React.JSX.Element {
  return (
    <table>
      <thead>
        <tr>
          <th>Variante</th>
          <th>Stichwörter</th>
        </tr>
      </thead>
      <tbody>
        {manifest.sharepicVariants.map((variant) => (
          <tr key={variant.type}>
            <td>
              <strong>{VARIANT_LABELS[variant.type] ?? variant.type}</strong>
              {!variant.standard && <> (nur auf Anfrage)</>}
            </td>
            <td>{variant.keywords.map((keyword) => `„${keyword}“`).join(', ')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
