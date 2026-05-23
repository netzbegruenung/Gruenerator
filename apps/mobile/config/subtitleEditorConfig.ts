/**
 * Subtitle Editor Configuration
 * Category definitions for the subtitle editor toolbar
 */

import type { CategoryConfig } from '../components/common/editor-toolbar';
import type { IoniconsIconName } from '@react-native-vector-icons/ionicons';

export type SubtitleEditCategory = 'style' | 'position' | 'text';

export const SUBTITLE_CATEGORIES: CategoryConfig<SubtitleEditCategory>[] = [
  { id: 'style', label: 'Stil', icon: 'brush-outline' as IoniconsIconName },
  { id: 'position', label: 'Position', icon: 'move-outline' as IoniconsIconName },
  { id: 'text', label: 'Text', icon: 'text-outline' as IoniconsIconName },
];
