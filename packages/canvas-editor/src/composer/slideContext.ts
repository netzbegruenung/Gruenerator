import { type RequiredFontRole } from '@ggraphic/core';
import { type ComposerBrand } from '@ggraphic/editor/brand/composerBrand';
import { type AdditionalText } from '@ggraphic/editor/configs/types';
import { type CanvasFormat } from '@ggraphic/editor/formats/index';
import { type ShapeInstance } from '@ggraphic/editor/utils/shapes';
import { type TextAccent } from '@ggraphic/editor/utils/textUtils';
import {
  type SharepicBrandId,
  type SharepicCreatorLocale,
  type SharepicThema,
} from '@gruenerator/contracts';

import { type BrandTheme } from '../brand/theme';

import { type MeasureText } from './chromeParts';
import { type Column, type ComposedSlide, type ComposeOptions } from './composeTypes';
import { type slideInk } from './slideInk';

type SlideInk = ReturnType<typeof slideInk>;

/**
 * What an item layout inside `build` reads from its slide. Built once, after
 * `column` is final; every member stays the same across `build` calls.
 */
export interface SlideCtx {
  measure: MeasureText;
  theme: BrandTheme;
  /** The brand's composer values; read these instead of branching on `isAt`. */
  brand: ComposerBrand;
  headFamily: string;
  locale: SharepicCreatorLocale;
  /** The design (brand × country); per-design tables are keyed by it. */
  brandId: SharepicBrandId;
  /** The spec's theme (Pride, Frauen), null on a plain slide. */
  thema: SharepicThema | null;
  canvas: CanvasFormat;
  options: ComposeOptions;
  /** Written only from a `place` callback, never while `build` measures. */
  out: ComposedSlide;
  column: Column;
  xAlign: Column['align'];
  darkText: string;
  onLight: SlideInk['onLight'];
  darkInk: SlideInk['darkInk'];
  onGrass: SlideInk['onGrass'];
  textColor: SlideInk['textColor'];
  accent: SlideInk['accent'];
  accentInk: SlideInk['accentInk'];
  badgeColors: SlideInk['badgeColors'];
  cardAccent: SlideInk['cardAccent'];
  contrastPanel: SlideInk['contrastPanel'];
  /** The slide's ref, not a copy: `vergleich` columns move the logo by writing it. */
  logoAt: { current: { x: number } | null };
  addShape: (shape: ShapeInstance) => void;
  addIcon: (
    id: string,
    iconId: string,
    x: number,
    y: number,
    size: number,
    color: string,
    opacity?: number
  ) => void;
  rect: (id: string, x: number, y: number, w: number, h: number, fill: string) => ShapeInstance;
  text: (
    id: string,
    value: string,
    y: number,
    fontSize: number,
    role: RequiredFontRole,
    extra?: Partial<AdditionalText>
  ) => void;
  lineCount: (
    value: string,
    width: number,
    size: number,
    family: string,
    weight: NonNullable<TextAccent['fontStyle']>,
    runAccent?: TextAccent
  ) => number;
  /** The widest size `value` can take on one line of `width`, up to `cap`. */
  fitLine: (value: string, cap: number, width: number, family: string) => number;
  /** A quote alone on a colour: the slide's hero, sized like a headline. */
  quoteAlone: boolean;
  quoteSize: (base: number, scale: number, cap: number) => number;
  /** A paragraph's size at scale 1, before `paraCap`. */
  paraBase: number;
}

/** What changes from one `build` call to the next. */
export interface BuildPass {
  scale: number;
  /** Paragraphs never come closer than 1 : 1.8 to the headline. */
  paraCap: number;
  /** Height a chart gives up before any text shrinks. */
  chartShrink: number;
}
