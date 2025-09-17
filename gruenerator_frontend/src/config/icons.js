// Global Icon Registry for Grünerator
// Centralized icon management for consistent usage across the application

// Import all needed icons from react-icons
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
  PiArrowRight
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
  HiCog,
  HiRefresh,
  HiArrowLeft,
  HiLockClosed,
  HiBeaker,
  HiChat
} from 'react-icons/hi';

import { 
  IoDownloadOutline,
  IoCopyOutline,
  IoShareOutline,
  IoAccessibilityOutline
} from 'react-icons/io5';

import {
  FiUpload,
  FiFile, 
  FiX,
  FiFileText,
  FiCheck
} from 'react-icons/fi';

import { RiMagicLine, RiRobot3Line } from 'react-icons/ri';

/**
 * Comprehensive icon registry organized by usage category
 * Each category contains semantic name -> React Icon Component mappings
 */
export const ICONS = {
  // Platform icons for social media and generator types
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

  // Navigation icons for header menu and routing
  navigation: {
    antrag: PiFileText,
    'presse-social': PiNewspaper,
    universal: PiMagicWand,
    'gruene-jugend': GiHedgehog,
    suche: PiMagnifyingGlass,
    reel: PiVideoCamera,
    sharepic: PiImageSquare,
    datenbank: PiArchive,
    you: PiUser,
    tools: PiWrench,
    barrierefreiheit: IoAccessibilityOutline,
    imagine: RiMagicLine
  },

  // Action icons for buttons and interactive elements
  actions: {
    copy: IoCopyOutline,
    download: IoDownloadOutline,
    share: IoShareOutline,
    docs: CiMemoPad,
    cloud: FaCloud,
    word: FaFileWord,
    gruenerator: HiCog,
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
    labor: HiBeaker
  },

  // UI/Form icons for form elements and components
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
    assistant: RiRobot3Line
  }
};

/**
 * Get an icon component by category and name
 * @param {string} category - Icon category (platforms, navigation, actions, ui)
 * @param {string} name - Icon name within the category
 * @returns {React.Component|null} Icon component or null if not found
 */
export const getIcon = (category, name) => {
  return ICONS[category]?.[name] || null;
};

/**
 * Get all icons from a specific category
 * @param {string} category - Icon category
 * @returns {Object} Object with icon names as keys and components as values
 */
export const getIconsFromCategory = (category) => {
  return ICONS[category] || {};
};

/**
 * Check if an icon exists in the registry
 * @param {string} category - Icon category
 * @param {string} name - Icon name
 * @returns {boolean} True if icon exists
 */
export const hasIcon = (category, name) => {
  return Boolean(ICONS[category]?.[name]);
};

/**
 * Get all available categories
 * @returns {string[]} Array of category names
 */
export const getCategories = () => {
  return Object.keys(ICONS);
};

/**
 * Backward compatibility: Get icon by ID (for existing menuData.jsx usage)
 * @param {string} id - Icon identifier
 * @returns {React.Component|null} Icon component or null if not found
 */
export const getIconById = (id) => {
  // Check navigation category first (most common usage)
  if (ICONS.navigation[id]) return ICONS.navigation[id];
  
  // Check other categories
  for (const category of Object.keys(ICONS)) {
    if (ICONS[category][id]) return ICONS[category][id];
  }
  
  return null;
};

// Export categories for convenience
export const ICON_CATEGORIES = {
  PLATFORMS: 'platforms',
  NAVIGATION: 'navigation', 
  ACTIONS: 'actions',
  UI: 'ui'
};

// Convenience export for the standard assistant/chat icon
export const AssistantIcon = RiRobot3Line;

// Convenience export for the notebook icon
export const NotebookIcon = FaBook;
