import { FaIcons, FaPuzzlePiece, FaShapes } from 'react-icons/fa';
import { PiChartBarFill, PiFrameCornersFill, PiSmileyWink, PiTagFill } from 'react-icons/pi';
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

import { SYSTEM_ASSETS } from '../../../utils/canvasAssets';
import { DiagrammePreviewIcon, TripleBalkenPreviewIcon } from '../BadgePreviewIcons';

import type { KawaiiIllustrationType } from '../../../utils/illustrations/types';
import type { IconType } from 'react-icons';
import type { ComponentType } from 'react';

export type AssetView =
  | 'browse'
  | 'grafiken'
  | 'extras'
  | 'formen'
  | 'diagramme'
  | 'rahmen'
  | 'illustrationen'
  | 'icons';

export interface CategoryCardDef {
  id: AssetView;
  label: string;
  Icon: IconType;
  /** Image file path rendered as-is in full color — takes precedence over Icon when set */
  image?: string;
  /** Image used as a CSS mask, painted with eucalyptus — silhouette tint, loses internal color detail */
  maskImage?: string;
  /** Custom SVG component taking a size prop — takes precedence over Icon when set */
  IconComponent?: ComponentType<{ size?: number }>;
  iconColor: string;
  hoverShadow: string;
  ring: string;
}

const EUCALYPTUS_ICON = 'text-secondary-600 dark:text-secondary-300';
const EUCALYPTUS_HOVER_SHADOW =
  'group-hover:shadow-sm group-hover:shadow-secondary-600/15 dark:group-hover:shadow-secondary-300/15';
const EUCALYPTUS_RING = 'focus-visible:ring-secondary-600/50';

export const CATEGORY_CARDS: CategoryCardDef[] = [
  {
    id: 'grafiken',
    label: 'Logos',
    Icon: FaPuzzlePiece,
    image: SYSTEM_ASSETS.sunflower.green.src,
    iconColor: EUCALYPTUS_ICON,
    hoverShadow: EUCALYPTUS_HOVER_SHADOW,
    ring: EUCALYPTUS_RING,
  },
  {
    id: 'extras',
    label: 'Balken',
    Icon: PiTagFill,
    IconComponent: TripleBalkenPreviewIcon,
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
    id: 'diagramme',
    label: 'Diagramme',
    Icon: PiChartBarFill,
    IconComponent: DiagrammePreviewIcon,
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
    maskImage: '/illustrations/undraw/eco-conscious_oqny.svg',
    iconColor: EUCALYPTUS_ICON,
    hoverShadow: EUCALYPTUS_HOVER_SHADOW,
    ring: EUCALYPTUS_RING,
  },
  {
    id: 'icons',
    label: 'Icons',
    Icon: FaIcons,
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
