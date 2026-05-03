import { FaPuzzlePiece } from 'react-icons/fa';
// import { FaShapes } from 'react-icons/fa';
// import { HiSparkles } from 'react-icons/hi2';
import { PiTagFill } from 'react-icons/pi';
// import { PiFrameCornersFill, PiSmileyWink } from 'react-icons/pi';
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

const EUCALYPTUS_ICON = 'text-secondary-600 dark:text-secondary-300';
const EUCALYPTUS_HOVER_SHADOW =
  'group-hover:shadow-lg group-hover:shadow-secondary-600/50 dark:group-hover:shadow-secondary-300/40';
const EUCALYPTUS_RING = 'focus-visible:ring-secondary-600/50';

export const CATEGORY_CARDS: CategoryCardDef[] = [
  {
    id: 'grafiken',
    label: 'Grafiken',
    Icon: FaPuzzlePiece,
    iconColor: EUCALYPTUS_ICON,
    hoverShadow: EUCALYPTUS_HOVER_SHADOW,
    ring: EUCALYPTUS_RING,
  },
  {
    id: 'extras',
    label: 'Extras',
    Icon: PiTagFill,
    iconColor: EUCALYPTUS_ICON,
    hoverShadow: EUCALYPTUS_HOVER_SHADOW,
    ring: EUCALYPTUS_RING,
  },
  {
    id: 'formen',
    label: 'Formen',
    Icon: FaShapes,
    iconColor: EUCALYPTUS_ICON,
    hoverShadow: EUCALYPTUS_HOVER_SHADOW,
    ring: EUCALYPTUS_RING,
  },
  {
    id: 'rahmen',
    label: 'Rahmen',
    Icon: PiFrameCornersFill,
    iconColor: EUCALYPTUS_ICON,
    hoverShadow: EUCALYPTUS_HOVER_SHADOW,
    ring: EUCALYPTUS_RING,
  },
  {
    id: 'illustrationen',
    label: 'Illustrationen',
    Icon: PiSmileyWink,
    iconColor: EUCALYPTUS_ICON,
    hoverShadow: EUCALYPTUS_HOVER_SHADOW,
    ring: EUCALYPTUS_RING,
  },
  {
    id: 'icons',
    label: 'Icons',
    Icon: HiSparkles,
    iconColor: EUCALYPTUS_ICON,
    hoverShadow: EUCALYPTUS_HOVER_SHADOW,
    ring: EUCALYPTUS_RING,
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
