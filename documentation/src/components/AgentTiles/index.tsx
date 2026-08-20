import React from 'react';
import {
  PiAnchor,
  PiBuildings,
  PiCastleTurret,
  PiFlowerLight,
  PiLeaf,
  PiMountains,
  PiPlant,
  PiTree,
  PiWaves,
} from 'react-icons/pi';
import type { IconType } from 'react-icons';

import capabilities from '@site/src/generated/chat-capabilities.json';
import labelsJson from '@site/src/generated/ui-labels.json';

import styles from './styles.module.css';

const APP = 'https://gruenerator.eu';

interface LvLabel {
  title: string;
  notebook?: string;
  agentSlug?: string;
}
const labels = labelsJson as Record<string, LvLabel>;

/**
 * Every LV recipe the app actually offers. The generator already drops the
 * recipes of a Landesverband whose notebook is `enabled: false` (Hamburg, at
 * the time of writing), so a chip only exists here if the `@`-mention really
 * resolves in the composer. `-at` is Austria — it has the same two recipes but
 * no tile; the Österreich note in the doc covers it.
 */
const LV_RECIPES = new Set(
  (capabilities.skills as { command: string }[])
    .map((s) => s.command)
    .filter((c) => /^@(presse|insta)-/.test(c) && !c.endsWith('-at'))
);

/**
 * Presentation only: which Landesverbände to show and their icon + @-mention
 * (neither lives in the app source). The drift-prone bits — display name, hub
 * slug, notebook slug — are pulled from the generated manifest (derived from
 * packages/shared LANDESVERBAENDE) by `id`, so a rename in code flows in here
 * and a removed LV fails the docs build. The Presse/Insta chips are likewise
 * derived, from `LV_RECIPES` above: the tile only says which mention suffix a
 * LV uses (`mv`, not `mecklenburg-vorpommern`), the generated list decides
 * whether the chip is shown at all.
 */
interface LvTile {
  id: string;
  Icon: IconType;
  mention: string;
  /** Suffix of the `@presse-…`/`@insta-…` recipes; omit if the LV has none. */
  recipeSlug?: string;
}

const TILES: LvTile[] = [
  { id: 'berlin', Icon: PiBuildings, mention: '@berlin', recipeSlug: 'berlin' },
  { id: 'hamburg', Icon: PiAnchor, mention: '@hamburg', recipeSlug: 'hamburg' },
  { id: 'mecklenburg-vorpommern', Icon: PiWaves, mention: '@mv', recipeSlug: 'mv' },
  { id: 'thueringen', Icon: PiTree, mention: '@thüringen', recipeSlug: 'thueringen' },
  { id: 'brandenburg', Icon: PiFlowerLight, mention: '@brandenburg', recipeSlug: 'brandenburg' },
  { id: 'bayern', Icon: PiMountains, mention: '@bayern', recipeSlug: 'bayern' },
  {
    id: 'sachsen-anhalt',
    Icon: PiCastleTurret,
    mention: '@sachsen-anhalt',
    recipeSlug: 'sachsen-anhalt',
  },
  { id: 'hessen', Icon: PiLeaf, mention: '@hessen', recipeSlug: 'hessen' },
  { id: 'saarland', Icon: PiPlant, mention: '@saar', recipeSlug: 'saarland' },
];

/**
 * Die Ebenen, für die ein LV-Presserezept geschrieben sein kann (`LvEbene` in
 * packages/shared). Ein Verband mit beiden Ebenen im Korpus führt statt eines
 * `@presse-hessen` die zwei Rezepte `@presse-hessen-partei` und
 * `@presse-hessen-fraktion`; einstufige Verbände (Brandenburg, Saarland,
 * Thüringen) behalten die suffixlose Form.
 */
const EBENEN = ['partei', 'fraktion'] as const;

/**
 * Wofür sich die Kachel eines Kürzels zuständig erklärt: die einstufige
 * Presseform, ihre beiden Ebenen, und Instagram. Insta steht bewusst OHNE
 * Ebenen darin — es ist heute nicht geteilt, und ein Vorab-Anspruch würde dem
 * Wächter unten genau den Fall wegnehmen, für den er da ist.
 */
function recipesFor(slug: string): string[] {
  return [
    `@presse-${slug}`,
    ...EBENEN.map((ebene) => `@presse-${slug}-${ebene}`),
    `@insta-${slug}`,
  ];
}

/**
 * Fails the docs build when a LV recipe exists in the app but no tile claims
 * it — the direction the hand-written list kept drifting in (Bayern, Hessen,
 * Sachsen-Anhalt and Saarland all gained recipes that the docs never grew).
 */
const claimed = new Set(TILES.flatMap((t) => (t.recipeSlug ? recipesFor(t.recipeSlug) : [])));
const unclaimed = [...LV_RECIPES].filter((c) => !claimed.has(c));
if (unclaimed.length > 0) {
  throw new Error(
    `AgentTiles: no tile claims the recipe(s) ${unclaimed.join(', ')}. ` +
      `Add the Landesverband (or its recipeSlug) to TILES, and keep the table in ` +
      `documentation/docs/wissen/landesverbaende.md in step.`
  );
}

export default function AgentTiles(): React.JSX.Element {
  return (
    <div className={styles.grid}>
      {TILES.map((tile) => {
        const label = labels[`lv.${tile.id}`];
        if (!label?.agentSlug || !label.notebook) {
          throw new Error(
            `AgentTiles: Landesverband "${tile.id}" is missing from ui-labels.json ` +
              `(or has no hub/notebook). Regenerate with ` +
              `\`pnpm --filter @gruenerator/documentation labels:generate\`; if the LV was ` +
              `removed or lost its hub in packages/shared/src/agents/landesverbaende.ts, drop its tile here.`
          );
        }
        const Icon = tile.Icon;
        // Aus denselben Namen wie der Anspruch oben, gefiltert auf das, was es
        // wirklich gibt: ein geteilter Verband zeigt beide Ebenen als eigene
        // Chips, ein einstufiger seine eine Form.
        const chips = tile.recipeSlug
          ? recipesFor(tile.recipeSlug).filter((c) => LV_RECIPES.has(c))
          : [];
        return (
          <div key={tile.id} className={styles.tile}>
            <div className={styles.head}>
              <span className={styles.icon} aria-hidden="true">
                <Icon />
              </span>
              <a className={styles.name} href={`${APP}/agents/${label.agentSlug}`}>
                {label.title}
              </a>
            </div>
            <p className={styles.kinds}>
              Öffentlichkeitsarbeit · Bürger*innenanfragen · Wahlprüfsteine
            </p>
            {chips.length > 0 && (
              <div className={styles.chips}>
                {chips.map((c) => (
                  <span key={c} className={styles.chip}>
                    {c}
                  </span>
                ))}
              </div>
            )}
            <a className={styles.notebook} href={`${APP}/notebooks/${label.notebook}`}>
              Notebook {tile.mention}
            </a>
          </div>
        );
      })}
    </div>
  );
}
