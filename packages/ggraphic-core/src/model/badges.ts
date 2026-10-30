// SPDX-License-Identifier: MPL-2.0
/**
 * Kreis- und Pillen-Badges.
 */

export interface CircleBadgeTextLine {
  text: string;
  yOffset: number;
  fontFamily: string;
  fontSize: number;
  fontWeight?: 'normal' | 'bold';
}

export interface CircleBadgeInstance {
  id: string;
  x: number;
  y: number;
  radius: number;
  backgroundColor: string;
  textColor: string;
  rotation: number;
  scale: number;
  opacity?: number;
  textLines: CircleBadgeTextLine[];
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type PillBadgeFontStyle = 'normal' | 'italic' | 'bold' | 'bold italic';

export interface PillBadgeInstance {
  id: string;
  text: string;
  x: number;
  y: number;
  backgroundColor: string;
  textColor: string;
  fontSize: number;
  fontFamily: string;
  fontStyle: PillBadgeFontStyle;
  rotation: number;
  scale: number;
  opacity: number;
  paddingX: number;
  paddingY: number;
  cornerRadius: number;
}
