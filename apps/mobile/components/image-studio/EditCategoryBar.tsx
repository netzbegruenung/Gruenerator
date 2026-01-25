/**
 * EditCategoryBar Component
 * Wraps shared CategoryBar for image-studio type compatibility
 */

import { CategoryBar } from '../common/editor-toolbar';
import type { CategoryConfig as SharedCategoryConfig } from '../common/editor-toolbar';
import type { EditCategory, CategoryConfig } from '../../config/editSheetConfig';

interface EditCategoryBarProps {
  categories: CategoryConfig[];
  onSelectCategory: (category: EditCategory) => void;
}

export function EditCategoryBar({ categories, onSelectCategory }: EditCategoryBarProps) {
  // Convert editSheetConfig CategoryConfig to shared CategoryConfig
  const sharedCategories: SharedCategoryConfig<EditCategory>[] = categories.map((c) => ({
    id: c.id,
    label: c.label,
    icon: c.icon as SharedCategoryConfig<EditCategory>['icon'],
  }));

  return <CategoryBar categories={sharedCategories} onSelectCategory={onSelectCategory} />;
}
