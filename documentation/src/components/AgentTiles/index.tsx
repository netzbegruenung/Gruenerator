import React from 'react';
import {
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
 * Presentation only: which Landesverbände to show and their icon + @-mention +
 * optional Presse/Insta shortcodes (none of which live in the app source). The
 * drift-prone bits — display name, hub slug, notebook slug — are pulled from the
 * generated manifest (derived from packages/shared LANDESVERBAENDE) by `id`, so
 * a rename in code flows in here and a removed LV fails the docs build.
 */
interface LvTile {
  id: string;
  Icon: IconType;
  mention: string;
  presse?: string;
  insta?: string;
}

const TILES: LvTile[] = [
  {
    id: 'berlin',
    Icon: PiBuildings,
    mention: '@berlin',
    presse: '/presse-berlin',
    insta: '/insta-berlin',
  },
  {
    id: 'mecklenburg-vorpommern',
    Icon: PiWaves,
    mention: '@mv',
    presse: '/presse-mv',
    insta: '/insta-mv',
  },
  {
    id: 'thueringen',
    Icon: PiTree,
    mention: '@thüringen',
    presse: '/presse-thueringen',
    insta: '/insta-thueringen',
  },
  {
    id: 'brandenburg',
    Icon: PiFlowerLight,
    mention: '@brandenburg',
    presse: '/presse-brandenburg',
    insta: '/insta-brandenburg',
  },
  {
    id: 'bayern',
    Icon: PiMountains,
    mention: '@bayern',
    presse: '/presse-bayern',
    insta: '/insta-bayern',
  },
  { id: 'sachsen-anhalt', Icon: PiCastleTurret, mention: '@sachsen-anhalt' },
  { id: 'hessen', Icon: PiLeaf, mention: '@hessen' },
  { id: 'saarland', Icon: PiPlant, mention: '@saar' },
];

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
            <p className={styles.kinds}>Öffentlichkeitsarbeit · Bürger*innenanfragen</p>
            {tile.presse && tile.insta && (
              <div className={styles.chips}>
                <span className={styles.chip}>{tile.presse}</span>
                <span className={styles.chip}>{tile.insta}</span>
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
