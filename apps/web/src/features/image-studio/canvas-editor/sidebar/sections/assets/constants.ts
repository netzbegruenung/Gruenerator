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
}

export const CATEGORY_CARDS: CategoryCardDef[] = [
  { id: 'grafiken', label: 'Grafiken', Icon: FaPuzzlePiece },
  { id: 'extras', label: 'Extras', Icon: PiTagFill },
  { id: 'formen', label: 'Formen', Icon: FaShapes },
  { id: 'rahmen', label: 'Rahmen', Icon: PiFrameCornersFill },
  { id: 'illustrationen', label: 'Illustrationen', Icon: PiSmileyWink },
  { id: 'icons', label: 'Icons', Icon: HiSparkles },
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
