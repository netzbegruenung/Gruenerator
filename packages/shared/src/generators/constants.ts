/**
 * Generator Constants
 * Shared constants for text generators across web and mobile platforms.
 */

import type { SocialPlatform, AntragRequestType, AccessibilityMode } from './types.js';

// API Endpoints
export const GENERATOR_ENDPOINTS = {
  PRESSE_SOCIAL: '/texte/social',
  ANTRAG: '/antraege/generate-simple',
  UNIVERSAL: '/texte/universal',
  ALT_TEXT: '/texte/alttext',
  LEICHTE_SPRACHE: '/texte/leichte-sprache',
} as const;

// Platform option interface
export interface PlatformOption {
  id: SocialPlatform;
  label: string;
  shortLabel?: string;
}

// Social media platform options
export const SOCIAL_PLATFORMS: readonly PlatformOption[] = [
  { id: 'pressemitteilung', label: 'Pressemitteilung', shortLabel: 'Presse' },
  { id: 'instagram', label: 'Instagram', shortLabel: 'Insta' },
  { id: 'facebook', label: 'Facebook', shortLabel: 'FB' },
  { id: 'twitter', label: 'Twitter/X, Mastodon & Bsky', shortLabel: 'X' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'sharepic', label: 'Sharepic' },
  { id: 'actionIdeas', label: 'Aktionsideen' },
  { id: 'reelScript', label: 'Skript für Reels & Tiktoks' },
] as const;

// Mobile-optimized subset (fewer options for smaller screens)
export const SOCIAL_PLATFORMS_MOBILE: readonly PlatformOption[] = [
  { id: 'pressemitteilung', label: 'Pressemitteilung', shortLabel: 'Presse' },
  { id: 'instagram', label: 'Instagram', shortLabel: 'Insta' },
  { id: 'facebook', label: 'Facebook', shortLabel: 'FB' },
  { id: 'twitter', label: 'Twitter/X', shortLabel: 'X' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'sharepic', label: 'Sharepic' },
] as const;

// Antrag type option interface
export interface AntragTypeOption {
  id: AntragRequestType;
  label: string;
  shortLabel?: string;
}

// Antrag type options
export const ANTRAG_TYPES: readonly AntragTypeOption[] = [
  { id: 'antrag', label: 'Antrag' },
  { id: 'kleine_anfrage', label: 'Kleine Anfrage', shortLabel: 'Kleine' },
  { id: 'grosse_anfrage', label: 'Große Anfrage', shortLabel: 'Große' },
] as const;

// Accessibility mode option interface
export interface AccessibilityModeOption {
  id: AccessibilityMode;
  label: string;
}

// Accessibility mode options
export const ACCESSIBILITY_MODES: readonly AccessibilityModeOption[] = [
  { id: 'alt-text', label: 'Alt-Text' },
  { id: 'leichte-sprache', label: 'Leichte Sprache' },
] as const;

// Generator titles (German)
export const GENERATOR_TITLES = {
  PRESSE_SOCIAL: 'Welche Botschaft willst du heute grünerieren?',
  ANTRAG: {
    antrag: 'Welchen Antrag willst du heute grünerieren?',
    kleine_anfrage: 'Welche Kleine Anfrage willst du heute grünerieren?',
    grosse_anfrage: 'Welche Große Anfrage willst du heute grünerieren?',
  },
  UNIVERSAL: {
    universal: 'Welchen Text willst du heute grünerieren?',
    rede: 'Welche Rede willst du heute grünerieren?',
    wahlprogramm: 'Welches Wahlprogramm-Kapitel willst du heute grünerieren?',
    buergeranfragen: 'Welche Bürger*innenanfrage willst du heute grünerieren?',
    leichte_sprache: 'Welchen Text willst du in Leichte Sprache übersetzen?',
  },
} as const;

// Form placeholders (German)
export const FORM_PLACEHOLDERS = {
  INHALT: 'Beschreibe was du brauchst...',
  ZITATGEBER: 'Wer soll zitiert werden?',
  GLIEDERUNG: 'Optionale Gliederung oder Struktur...',
  TEXT_FORM: 'Textform (z.B. Brief, E-Mail, Flyer...)',
  THEMA: 'Thema und Details...',
} as const;

// Validation messages (German)
export const VALIDATION_MESSAGES = {
  INHALT_REQUIRED: 'Inhalt ist erforderlich',
  PLATFORM_REQUIRED: 'Mindestens eine Plattform muss ausgewählt werden',
  REQUEST_TYPE_REQUIRED: 'Art der Anfrage ist erforderlich',
  THEMA_REQUIRED: 'Bitte Thema eingeben',
  TEXT_REQUIRED: 'Text ist erforderlich',
  IMAGE_REQUIRED: 'Bild ist erforderlich',
  ACTION_REQUIRED: 'Aktion ist erforderlich',
} as const;
