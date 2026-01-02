import { memo, ComponentType, ReactNode } from 'react';
import { FaBrain } from 'react-icons/fa';
import { HiDocument, HiDocumentText } from 'react-icons/hi';

/**
 * OptionIcon - Standardized icon rendering for select options
 * Supports both direct icon components and icon type strings with built-in mappings
 */
interface OptionIconConfig {
  className?: string;
  [key: string]: unknown;
}

interface OptionIconProps {
  icon?: ComponentType<{ className?: string; size?: number }> | string | ReactNode;
  iconType?: string;
  size?: number;
  config?: OptionIconConfig;
}

const OptionIcon = memo<OptionIconProps>(({ icon: Icon, iconType, size = 16, config = {} }) => {
  const iconClass = config.className || "option-icon";

  // If direct icon component is provided, use it
  if (Icon) {
    if (typeof Icon === 'function') {
      return <Icon className={iconClass} size={size} />;
    }
    if (typeof Icon === 'string') {
      // String-based icon (could be extended for icon libraries)
      return <span className={`${iconClass} icon-${Icon}`} style={{ fontSize: size }} />;
    }
    return Icon;
  }

  // Built-in icon type mappings (from KnowledgeSelector)
  if (iconType) {
    switch (iconType) {
      case 'instruction':
      case 'anweisung':
        return (
          <svg className={iconClass} width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
            <polyline points="14,2 14,8 20,8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10,9 9,9 8,9"/>
          </svg>
        );

      case 'knowledge':
      case 'wissen':
      case 'group_knowledge':
        return <FaBrain className={iconClass} size={size} />;

      case 'document':
      case 'dokument':
      case 'user_document':
      case 'group_document':
        return <HiDocument className={iconClass} size={size} />;

      case 'text':
      case 'user_text':
      case 'group_text':
        return <HiDocumentText className={iconClass} size={size} />;

      // Platform icons (from PlatformSelector pattern)
      case 'platform':
        // This could be extended to support different platform types
        return (
          <svg className={iconClass} width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L2 7V10C2 16 6 20.5 12 22C18 20.5 22 16 22 10V7L12 2Z"/>
          </svg>
        );

      default:
        // Default/unknown icon
        return (
          <svg className={iconClass} width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        );
    }
  }

  return null;
});

OptionIcon.displayName = 'OptionIcon';

export default OptionIcon;
