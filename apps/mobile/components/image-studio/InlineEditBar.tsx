/**
 * InlineEditBar Component
 * Image-studio specific inline editing bar
 * Uses shared InlineBar with image-studio controls
 *
 * Note: Controls handle their own state via Zustand selectors for performance
 */

import { InlineBar } from '../common/editor-toolbar';
import { FontSizeControl, ColorSchemeSelector, CreditInput } from '../image-modification';

export type InlineEditCategory = 'fontSize' | 'colorScheme' | 'credit';

interface InlineEditBarProps {
  category: InlineEditCategory;
  onClose: () => void;
  disabled?: boolean;
}

export function InlineEditBar({ category, onClose, disabled = false }: InlineEditBarProps) {
  const renderControl = () => {
    switch (category) {
      case 'fontSize':
        return <FontSizeControl disabled={disabled} />;
      case 'colorScheme':
        return <ColorSchemeSelector disabled={disabled} />;
      case 'credit':
        return <CreditInput disabled={disabled} />;
      default:
        return null;
    }
  };

  return <InlineBar onClose={onClose}>{renderControl()}</InlineBar>;
}
