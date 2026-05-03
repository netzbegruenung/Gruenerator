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
  hoverShadow: string;
  ring: string;
}

export const CATEGORY_CARDS: CategoryCardDef[] = [
  {
    id: 'grafiken',
    label: 'Grafiken',
    Icon: FaPuzzlePiece,
    iconColor: 'text-emerald-400 dark:text-emerald-200',
    hoverShadow: 'group-hover:shadow-lg group-hover:shadow-emerald-400/50 dark:group-hover:shadow-emerald-300/40',
    ring: 'focus-visible:ring-emerald-400/50',
  },
  {
    id: 'extras',
    label: 'Extras',
    Icon: PiTagFill,
    iconColor: 'text-amber-400 dark:text-amber-200',
    hoverShadow: 'group-hover:shadow-lg group-hover:shadow-amber-400/50 dark:group-hover:shadow-amber-300/40',
    ring: 'focus-visible:ring-amber-400/50',
  },
  {
    id: 'formen',
    label: 'Formen',
    Icon: FaShapes,
    iconColor: 'text-violet-400 dark:text-violet-200',
    hoverShadow: 'group-hover:shadow-lg group-hover:shadow-violet-400/50 dark:group-hover:shadow-violet-300/40',
    ring: 'focus-visible:ring-violet-400/50',
  },
  {
    id: 'rahmen',
    label: 'Rahmen',
    Icon: PiFrameCornersFill,
    iconColor: 'text-sky-400 dark:text-sky-200',
    hoverShadow: 'group-hover:shadow-lg group-hover:shadow-sky-400/50 dark:group-hover:shadow-sky-300/40',
    ring: 'focus-visible:ring-sky-400/50',
  },
  {
    id: 'illustrationen',
    label: 'Illustrationen',
    Icon: PiSmileyWink,
    iconColor: 'text-rose-400 dark:text-rose-200',
    hoverShadow: 'group-hover:shadow-lg group-hover:shadow-rose-400/50 dark:group-hover:shadow-rose-300/40',
    ring: 'focus-visible:ring-rose-400/50',
  },
  {
    id: 'icons',
    label: 'Icons',
    Icon: HiSparkles,
    iconColor: 'text-yellow-400 dark:text-yellow-200',
    hoverShadow: 'group-hover:shadow-lg group-hover:shadow-yellow-400/50 dark:group-hover:shadow-yellow-300/40',
    ring: 'focus-visible:ring-yellow-400/50',
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
