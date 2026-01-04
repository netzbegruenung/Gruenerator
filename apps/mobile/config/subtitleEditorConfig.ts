/**
 * Subtitle Editor Configuration
 * Category definitions for the subtitle editor toolbar
 */

import type { Ionicons } from '@expo/vector-icons';
import type { CategoryConfig } from '../components/common/editor-toolbar';

export type SubtitleEditCategory = 'style' | 'position' | 'text';

export const SUBTITLE_CATEGORIES: CategoryConfig<SubtitleEditCategory>[] = [
  { id: 'style', label: 'Stil', icon: 'brush-outline' as keyof typeof Ionicons.glyphMap },
  { id: 'position', label: 'Position', icon: 'move-outline' as keyof typeof Ionicons.glyphMap },
  { id: 'text', label: 'Text', icon: 'text-outline' as keyof typeof Ionicons.glyphMap },
];
