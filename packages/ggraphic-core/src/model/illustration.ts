// SPDX-License-Identifier: MPL-2.0
/**
 * Illustrationen: Kawaii-Figuren und SVG-Sets.
 */

// React Kawaii types
export type KawaiiMood = 'sad' | 'shocked' | 'happy' | 'blissful' | 'lovestruck' | 'excited' | 'ko';

export type KawaiiIllustrationType =
  | 'planet'
  | 'cat'
  | 'ghost'
  | 'iceCream'
  | 'browser'
  | 'mug'
  | 'speechBubble'
  | 'backpack'
  | 'creditCard'
  | 'file'
  | 'folder';

// SVG Illustration types
export type SvgSource =
  | 'undraw'
  | 'opendoodles'
  | 'illlustrations'
  | 'gophers'
  | 'transhumans'
  | 'humaaans'
  | 'openpeeps';

export interface KawaiiInstance {
  id: string;
  illustrationId: KawaiiIllustrationType;
  source: 'kawaii';
  x: number;
  y: number;
  scale: number;
  rotation: number;
  color: string;
  opacity: number;
  mood: KawaiiMood;
  flipX?: boolean;
  flipY?: boolean;
}

export interface SvgInstance {
  id: string;
  illustrationId: string;
  source: SvgSource;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  color?: string;
  flipX?: boolean;
  flipY?: boolean;
}

export type IllustrationInstance = KawaiiInstance | SvgInstance;
