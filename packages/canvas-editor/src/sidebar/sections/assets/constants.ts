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
}

export const CATEGORY_CARDS: CategoryCardDef[] = [
  { id: 'grafiken', label: 'Logos' },
  { id: 'extras', label: 'Balken' },
  { id: 'formen', label: 'Formen' },
  { id: 'diagramme', label: 'Diagramme' },
  { id: 'rahmen', label: 'Rahmen' },
  { id: 'illustrationen', label: 'Illustrationen' },
  { id: 'icons', label: 'Icons' },
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
