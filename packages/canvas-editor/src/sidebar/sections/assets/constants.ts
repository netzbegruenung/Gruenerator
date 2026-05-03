import { FaPuzzlePiece, FaShapes } from 'react-icons/fa';
import { HiSparkles } from 'react-icons/hi2';
import { PiFrameCornersFill, PiSmileyWink, PiTagFill } from 'react-icons/pi';
import {
  Planet,
  Cat,
  Ghost,
  IceCream,
  Browser,
  Mug,
  SpeechBubble,
  Backpack,
  CreditCard,
  File,
  Folder,
  type KawaiiProps,
} from 'react-kawaii';

import type { KawaiiIllustrationType } from '../../../utils/illustrations/types';
import type { IconType } from 'react-icons';

export type AssetView =
  | 'browse'
  | 'grafiken'
  | 'extras'
  | 'formen'
  | 'rahmen'
  | 'illustrationen'
  | 'icons';

export interface CategoryCardDef {
  id: AssetView;
  label: string;
  Icon: IconType;
  iconColor: string;
  border: string;
  hoverBorder: string;
  ring: string;
  anim: string;
}

export const CATEGORY_CARDS: CategoryCardDef[] = [
  {
    id: 'grafiken',
    label: 'Grafiken',
    Icon: FaPuzzlePiece,
    iconColor: 'text-emerald-500 dark:text-emerald-300',
    border: 'border-emerald-500/60 dark:border-emerald-400/60',
    hoverBorder: 'group-hover:border-emerald-500 dark:group-hover:border-emerald-400',
    ring: 'focus-visible:ring-emerald-500/50',
    anim: 'cat-anim-tilt',
  },
  {
    id: 'extras',
    label: 'Extras',
    Icon: PiTagFill,
    iconColor: 'text-amber-500 dark:text-amber-300',
    border: 'border-amber-500/60 dark:border-amber-400/60',
    hoverBorder: 'group-hover:border-amber-500 dark:group-hover:border-amber-400',
    ring: 'focus-visible:ring-amber-500/50',
    anim: 'cat-anim-swing',
  },
  {
    id: 'formen',
    label: 'Formen',
    Icon: FaShapes,
    iconColor: 'text-violet-500 dark:text-violet-300',
    border: 'border-violet-500/60 dark:border-violet-400/60',
    hoverBorder: 'group-hover:border-violet-500 dark:group-hover:border-violet-400',
    ring: 'focus-visible:ring-violet-500/50',
    anim: 'cat-anim-spin',
  },
  {
    id: 'rahmen',
    label: 'Rahmen',
    Icon: PiFrameCornersFill,
    iconColor: 'text-sky-500 dark:text-sky-300',
    border: 'border-sky-500/60 dark:border-sky-400/60',
    hoverBorder: 'group-hover:border-sky-500 dark:group-hover:border-sky-400',
    ring: 'focus-visible:ring-sky-500/50',
    anim: 'cat-anim-pulse',
  },
  {
    id: 'illustrationen',
    label: 'Illustrationen',
    Icon: PiSmileyWink,
    iconColor: 'text-rose-500 dark:text-rose-300',
    border: 'border-rose-500/60 dark:border-rose-400/60',
    hoverBorder: 'group-hover:border-rose-500 dark:group-hover:border-rose-400',
    ring: 'focus-visible:ring-rose-500/50',
    anim: 'cat-anim-wink',
  },
  {
    id: 'icons',
    label: 'Icons',
    Icon: HiSparkles,
    iconColor: 'text-yellow-500 dark:text-yellow-300',
    border: 'border-yellow-500/60 dark:border-yellow-400/60',
    hoverBorder: 'group-hover:border-yellow-500 dark:group-hover:border-yellow-400',
    ring: 'focus-visible:ring-yellow-500/50',
    anim: 'cat-anim-twinkle',
  },
];

export const PREVIEW_COMPONENTS: Record<
  KawaiiIllustrationType,
  React.FunctionComponent<KawaiiProps>
> = {
  planet: Planet,
  cat: Cat,
  ghost: Ghost,
  iceCream: IceCream,
  browser: Browser,
  mug: Mug,
  speechBubble: SpeechBubble,
  backpack: Backpack,
  creditCard: CreditCard,
  file: File,
  folder: Folder,
};
