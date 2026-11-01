// SPDX-License-Identifier: MPL-2.0
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

import type { KawaiiIllustrationType } from '@ggraphic/editor/utils/illustrations/types';

export type AssetView =
  | 'browse'
  | 'marke'
  | 'bloecke'
  | 'sticker'
  | 'fotos'
  | 'hintergruende'
  | 'formen'
  | 'diagramme'
  | 'rahmen'
  | 'illustrationen'
  | 'icons'
  | 'emoji';

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
