import type { ComponentType } from 'react';
import type { IconBaseProps } from 'react-icons';

import {
  PiFileText,
  PiNewspaper,
  PiMagicWand,
  PiMagnifyingGlass,
  PiVideoCamera,
  PiImageSquare,
  PiArchive,
  PiUser,
  PiWrench,
  PiPlus,
  PiPencilSimple,
  PiCaretDown,
  PiCaretUp,
  PiArrowRight,
  PiBrain,
  PiTextAlignLeftFill,
  PiGlobe,
  PiPaintBrush
} from 'react-icons/pi';

import {
  FaInstagram,
  FaFacebook,
  FaTwitter,
  FaLinkedin,
  FaCloud,
  FaBook,
  FaTiktok
} from 'react-icons/fa';

import { FaFileWord } from 'react-icons/fa6';

import { CiMemoPad } from 'react-icons/ci';

import { GiHedgehog } from 'react-icons/gi';

import {
  HiInformationCircle,
  HiOutlineTrash,
  HiRefresh,
  HiArrowLeft,
  HiLockClosed,
  HiBeaker,
  HiChat,
  HiMicrophone,
  HiClipboardCheck,
  HiUserGroup,
  HiPencilAlt,
  HiClipboardList,
  HiQuestionMarkCircle,
  HiSpeakerphone,
  HiDownload,
  HiLink,
  HiSparkles
} from 'react-icons/hi';

import {
  IoDownloadOutline,
  IoCopyOutline,
  IoShareOutline,
  IoAccessibilityOutline,
  IoAccessibility
} from 'react-icons/io5';

import {
  FiUpload,
  FiFile,
  FiX,
  FiFileText,
  FiCheck
} from 'react-icons/fi';

import { RiMagicLine, RiRobot3Line } from 'react-icons/ri';

import { FaMagic } from 'react-icons/fa';

import GrueneratorGPTIcon from '../components/common/GrueneratorGPTIcon';

/**
 * Icon component type used throughout the registry
 */
export type IconType = ComponentType<IconBaseProps>;

/**
 * Icon category types
 */
export type IconCategory = 'platforms' | 'textTypes' | 'navigation' | 'actions' | 'ui' | 'accessibility' | 'campaigns';

/**
 * Platform icon names
 */
export type PlatformIconName =
  | 'instagram' | 'facebook' | 'twitter' | 'linkedin' | 'tiktok'
  | 'messenger' | 'sharepic' | 'pressemitteilung' | 'actionIdeas' | 'reelScript';

/**
 * Text type icon names
 */
export type TextTypeIconName =
  | 'rede' | 'wahlprogramm' | 'buergeranfragen' | 'universal'
  | 'antrag' | 'kleine_anfrage' | 'grosse_anfrage';

/**
 * Navigation icon names
 */
export type NavigationIconName =
  | 'antrag' | 'presse-social' | 'universal' | 'gruene-jugend' | 'suche'
  | 'reel' | 'sharepic' | 'datenbank' | 'vorlagen' | 'you' | 'tools'
  | 'barrierefreiheit' | 'imagine' | 'website';

/**
 * Action icon names
 */
export type ActionIconName =
  | 'copy' | 'download' | 'share' | 'docs' | 'cloud' | 'word' | 'gruenerator'
  | 'notebook' | 'delete' | 'edit' | 'add' | 'info' | 'upload' | 'close'
  | 'check' | 'arrowRight' | 'back' | 'refresh' | 'lock' | 'labor'
  | 'altText' | 'kiLabel' | 'link';

/**
 * UI icon names
 */
export type UIIconName =
  | 'user' | 'file' | 'fileAlt' | 'fileTextAlt' | 'image' | 'video'
  | 'search' | 'caretDown' | 'caretUp' | 'assistant' | 'brain';

/**
 * Icon registry structure
 */
export interface IconRegistry {
  platforms: Record<PlatformIconName, IconType>;
  textTypes: Record<TextTypeIconName, IconType>;
  navigation: Record<NavigationIconName, IconType>;
  actions: Record<ActionIconName, IconType>;
  ui: Record<UIIconName, IconType>;
  accessibility: Record<string, IconType>;
  campaigns: Record<string, IconType>;
}

/**
 * Comprehensive icon registry organized by usage category
 * Each category contains semantic name -> React Icon Component mappings
 */
export const ICONS: IconRegistry = {
  platforms: {
    instagram: FaInstagram,
    facebook: FaFacebook,
    twitter: FaTwitter,
    linkedin: FaLinkedin,
    tiktok: FaTiktok,
    messenger: HiChat,
    sharepic: PiImageSquare,
    pressemitteilung: PiNewspaper,
    actionIdeas: PiMagicWand,
    reelScript: PiVideoCamera
  },

  textTypes: {
    rede: HiMicrophone,
    wahlprogramm: HiClipboardCheck,
    buergeranfragen: HiUserGroup,
    universal: HiPencilAlt,
    antrag: HiClipboardList,
    kleine_anfrage: HiQuestionMarkCircle,
    grosse_anfrage: HiSpeakerphone
  },

  navigation: {
    antrag: PiFileText,
    'presse-social': PiNewspaper,
    universal: PiMagicWand,
    'gruene-jugend': GiHedgehog,
    suche: PiMagnifyingGlass,
    reel: PiVideoCamera,
    sharepic: PiImageSquare,
    datenbank: PiArchive,
    vorlagen: PiPaintBrush,
    you: PiUser,
    tools: PiWrench,
    barrierefreiheit: IoAccessibilityOutline,
    imagine: RiMagicLine,
    website: PiGlobe
  },

  actions: {
    copy: IoCopyOutline,
    download: HiDownload,
    share: IoShareOutline,
    docs: CiMemoPad,
    cloud: FaCloud,
    word: FaFileWord,
    gruenerator: GrueneratorGPTIcon as IconType,
    notebook: FaBook,
    delete: HiOutlineTrash,
    edit: PiPencilSimple,
    add: PiPlus,
    info: HiInformationCircle,
    upload: FiUpload,
    close: FiX,
    check: FiCheck,
    arrowRight: PiArrowRight,
    back: HiArrowLeft,
    refresh: HiRefresh,
    lock: HiLockClosed,
    labor: HiBeaker,
    altText: IoAccessibility,
    kiLabel: PiTextAlignLeftFill,
    link: HiLink
  },

  ui: {
    user: PiUser,
    file: PiFileText,
    fileAlt: FiFile,
    fileTextAlt: FiFileText,
    image: PiImageSquare,
    video: PiVideoCamera,
    search: PiMagnifyingGlass,
    caretDown: PiCaretDown,
    caretUp: PiCaretUp,
    assistant: RiRobot3Line,
    brain: PiBrain
  },

  accessibility: {
    altText: IoAccessibility,
    leichteSprache: IoAccessibility
  },

  campaigns: {
    campaign: HiSparkles,
    sharepic: PiImageSquare
  }
};

/**
 * Get an icon component by category and name
 */
export const getIcon = <C extends IconCategory>(
  category: C,
  name: string
): IconType | null => {
  return (ICONS[category] as Record<string, IconType>)?.[name] || null;
};

/**
 * Get all icons from a specific category
 */
export const getIconsFromCategory = <C extends IconCategory>(
  category: C
): IconRegistry[C] => {
  return ICONS[category];
};

/**
 * Check if an icon exists in the registry
 */
export const hasIcon = (category: IconCategory, name: string): boolean => {
  return Boolean((ICONS[category] as Record<string, IconType>)?.[name]);
};

/**
 * Get all available categories
 */
export const getCategories = (): IconCategory[] => {
  return Object.keys(ICONS) as IconCategory[];
};

/**
 * Backward compatibility: Get icon by ID (for existing menuData.jsx usage)
 */
export const getIconById = (id: string): IconType | null => {
  if ((ICONS.navigation as Record<string, IconType>)[id]) {
    return (ICONS.navigation as Record<string, IconType>)[id];
  }

  for (const category of Object.keys(ICONS) as IconCategory[]) {
    if ((ICONS[category] as Record<string, IconType>)[id]) {
      return (ICONS[category] as Record<string, IconType>)[id];
    }
  }

  return null;
};

export const ICON_CATEGORIES = {
  PLATFORMS: 'platforms',
  NAVIGATION: 'navigation',
  ACTIONS: 'actions',
  UI: 'ui'
} as const;

export type IconCategoryKey = typeof ICON_CATEGORIES[keyof typeof ICON_CATEGORIES];

export const AssistantIcon = RiRobot3Line;
export const NotebookIcon = FaBook;
