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

import styles from './styles.module.css';

const APP = 'https://gruenerator.eu';

type Landesverband = {
  name: string;
  Icon: IconType;
  agentSlug: string;
  notebookSlug: string;
  mention: string;
  presse?: string;
  insta?: string;
};

const LANDESVERBAENDE: Landesverband[] = [
  {
    name: 'Berlin',
    Icon: PiBuildings,
    agentSlug: 'gruene-berlin',
    notebookSlug: 'berlin',
    mention: '@berlin',
    presse: '/presse-berlin',
    insta: '/insta-berlin',
  },
  {
    name: 'Mecklenburg-Vorpommern',
    Icon: PiWaves,
    agentSlug: 'gruene-mv',
    notebookSlug: 'mecklenburg-vorpommern',
    mention: '@mv',
    presse: '/presse-mv',
    insta: '/insta-mv',
  },
  {
    name: 'Thüringen',
    Icon: PiTree,
    agentSlug: 'gruene-thueringen',
    notebookSlug: 'thueringen',
    mention: '@thüringen',
    presse: '/presse-thueringen',
    insta: '/insta-thueringen',
  },
  {
    name: 'Brandenburg',
    Icon: PiFlowerLight,
    agentSlug: 'gruene-brandenburg',
    notebookSlug: 'brandenburg',
    mention: '@brandenburg',
    presse: '/presse-brandenburg',
    insta: '/insta-brandenburg',
  },
  {
    name: 'Bayern',
    Icon: PiMountains,
    agentSlug: 'gruene-bayern',
    notebookSlug: 'bayern',
    mention: '@bayern',
    presse: '/presse-bayern',
    insta: '/insta-bayern',
  },
  {
    name: 'Sachsen-Anhalt',
    Icon: PiCastleTurret,
    agentSlug: 'gruene-sachsen-anhalt',
    notebookSlug: 'sachsen-anhalt',
    mention: '@sachsen-anhalt',
  },
  {
    name: 'Hessen',
    Icon: PiLeaf,
    agentSlug: 'gruene-hessen',
    notebookSlug: 'hessen',
    mention: '@hessen',
  },
  {
    name: 'Saarland',
    Icon: PiPlant,
    agentSlug: 'gruene-saarland',
    notebookSlug: 'saarland',
    mention: '@saar',
  },
];

export default function AgentTiles(): React.JSX.Element {
  return (
    <div className={styles.grid}>
      {LANDESVERBAENDE.map((lv) => {
        const Icon = lv.Icon;
        return (
          <div key={lv.agentSlug} className={styles.tile}>
            <div className={styles.head}>
              <span className={styles.icon} aria-hidden="true">
                <Icon />
              </span>
              <a className={styles.name} href={`${APP}/agents/${lv.agentSlug}`}>
                {lv.name}
              </a>
            </div>
            <p className={styles.kinds}>Öffentlichkeitsarbeit · Bürger*innenanfragen</p>
            {lv.presse && lv.insta && (
              <div className={styles.chips}>
                <span className={styles.chip}>{lv.presse}</span>
                <span className={styles.chip}>{lv.insta}</span>
              </div>
            )}
            <a className={styles.notebook} href={`${APP}/notebooks/${lv.notebookSlug}`}>
              Notebook {lv.mention}
            </a>
          </div>
        );
      })}
    </div>
  );
}
