import { FaCheck } from 'react-icons/fa';

import { SidebarHint } from '../../components/SidebarHint';
import {
  CARD_CHECK,
  CARD_GRID,
  CARD_LABEL,
  SELECTABLE_CARD_ACTIVE,
  SELECTABLE_CARD_WITH_LABEL,
  SIDEBAR_SECTION,
} from '../../primitives';

import type { ColorScheme } from '../../../utils/dreizeilenLayout';

import { cn } from '../../../utils/cn';

export interface DreizeilenColorSectionProps {
  colorSchemes: ColorScheme[];
  activeSchemeId: string;
  onSchemeChange: (schemeId: string) => void;
}

export function DreizeilenColorSection({
  colorSchemes,
  activeSchemeId,
  onSchemeChange,
}: DreizeilenColorSectionProps) {
  return (
    <div className={cn(SIDEBAR_SECTION, 'w-full')}>
      <div className={CARD_GRID}>
        {colorSchemes.map((scheme) => {
          const isActive = activeSchemeId === scheme.id;
          return (
            <button
              key={scheme.id}
              className={cn(SELECTABLE_CARD_WITH_LABEL, isActive && SELECTABLE_CARD_ACTIVE)}
              onClick={() => onSchemeChange(scheme.id)}
              type="button"
              title={scheme.label}
            >
              <div className="flex flex-col gap-[2px] w-[44px] shrink-0">
                {scheme.colors.map((color, i) => (
                  <span
                    key={i}
                    className="h-[10px] rounded-[2px] -skew-x-[12deg]"
                    style={{
                      backgroundColor: color.background,
                      marginLeft: i === 0 ? 0 : i === 1 ? 3 : 6,
                      marginRight: i === 0 ? 6 : i === 1 ? 3 : 0,
                    }}
                  />
                ))}
              </div>
              <span className={CARD_LABEL}>{scheme.label}</span>
              {isActive && (
                <span className={CARD_CHECK}>
                  <FaCheck size={10} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <SidebarHint>
        Wähle ein Farbschema, das die Lesbarkeit deiner Balken optimiert. Die Vorschau zeigt dir,
        wie die drei Balken eingefärbt werden. Achte auf guten Kontrast zwischen Balkenfarbe und
        Text.
      </SidebarHint>
    </div>
  );
}
