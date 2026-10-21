import {
  type SharepicFormat,
  type SharepicItem,
  type SharepicPhotoAttribution,
  type SharepicTextSide,
} from '@gruenerator/contracts';

import type { MeasureText } from './chromeParts';
import type { SharepicProvenance } from './sharepicProvenance';
import type { IconState } from '../configs/factory/baseTypes';
import type { AdditionalText } from '../configs/types';
import type { AssetInstance } from '../utils/canvasAssets';
import type { ChartInstance } from '../utils/chartUtils';
import type { CircleBadgeInstance } from '../utils/circleBadgeUtils';
import type { PillBadgeInstance } from '../utils/pillBadgeUtils';
import type { ShapeInstance } from '../utils/shapes';
import type { UserImageInstance } from '../utils/userImageUtils';

/** How bright or busy the photo is where the text sits; decides how dense the scrim gets. */
export type PhotoTone = 'dunkel' | 'mittel' | 'hell';

export interface ComposeOptions {
  /** URL the canvas loads a stock photo from. */
  photoSrc: (filename: string) => string;
  /** Photo credit per slide, as the draft returned it. */
  attributions?: (SharepicPhotoAttribution | null)[];
  measure?: MeasureText;
  /** AI notice on every slide, the last of a carousel in its long form. Default on. */
  kiLabel?: boolean;
  /**
   * Tone of a stock photo on the side the text sits on, measured by the
   * client (the composer stays sync and pure). `null` or absent: `mittel`.
   */
  photoTone?: (filename: string, side: SharepicTextSide) => PhotoTone | null;
  /** Also return where each element comes from (`ComposedSharepic.provenance`). */
  provenance?: true;
}

/** Props for the `freeform` / `freeform-at` config's `createInitialState` — one page. */
export type ComposedSlide = {
  backgroundMode: 'color' | 'image';
  backgroundColor: string;
  currentImageSrc?: string;
  hasBackgroundImage: boolean;
  /** Where the cover-fitted photo sits; absent: the editor's default, centred on the canvas. */
  imageOffset?: { x: number; y: number };
  imageScale?: number;
  imageAttribution: SharepicPhotoAttribution | null;
  additionalTexts: AdditionalText[];
  pillBadgeInstances: PillBadgeInstance[];
  circleBadgeInstances: CircleBadgeInstance[];
  shapeInstances: ShapeInstance[];
  assetInstances: AssetInstance[];
  chartInstances: ChartInstance[];
  /** An infographic's painted illustrations. */
  userImageInstances: UserImageInstance[];
  selectedIcons: string[];
  iconStates: Record<string, IconState>;
  layerOrder: string[];
};

export interface ComposedSharepic {
  templateType: 'freeform' | 'freeform-at';
  /** The canvas format the slides are laid out on. */
  format: SharepicFormat;
  /** One page per slide, in order. */
  slides: ComposedSlide[];
  /** Per slide, keyed by element id; only with `ComposeOptions.provenance`. */
  provenance?: Record<string, SharepicProvenance>[];
}

export type BildItem = Extract<SharepicItem, { type: 'bild' }>;
export type DiagrammItem = Extract<SharepicItem, { type: 'diagramm' }>;
export type FaktencheckItem = Extract<SharepicItem, { type: 'faktencheck' }>;
export type HeadlineItem = Extract<SharepicItem, { type: 'headline' }>;
export type IconlisteItem = Extract<SharepicItem, { type: 'iconliste' }>;
export type InfografikItem = Extract<SharepicItem, { type: 'infografik' }>;
export type ListeItem = Extract<SharepicItem, { type: 'liste' }>;
export type RechnungItem = Extract<SharepicItem, { type: 'rechnung' }>;
export type SteckbriefItem = Extract<SharepicItem, { type: 'steckbrief' }>;
export type VergleichItem = Extract<SharepicItem, { type: 'vergleich' }>;
export type ZahlItem = Extract<SharepicItem, { type: 'zahl' }>;

export interface Column {
  x: number;
  width: number;
  align: 'left' | 'center';
}

export interface Placed {
  height: number;
  /** Space after this item. */
  after: number;
  place: (y: number) => void;
}
