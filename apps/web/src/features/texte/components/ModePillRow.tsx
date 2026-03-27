import { SettingsDropdown, pillBase, pillInactive, pillActive } from '@gruenerator/ui';
import React, { memo, useCallback } from 'react';

import { MODE_GROUPS, SUBMODE_LABELS } from '../modes';

import { cn } from '@/utils/cn';

interface ModePillRowProps {
  mode: string;
  onModeChange: (mode: string) => void;
}

const ModePillRow: React.FC<ModePillRowProps> = memo(({ mode, onModeChange }) => {
  const resolveGroupMode = useCallback((groupId: string): string => {
    const group = MODE_GROUPS.find((g) => g.id === groupId);
    if (group?.submodes) return group.submodes[0];
    return groupId;
  }, []);

  const isGroupActive = useCallback(
    (groupId: string): boolean => {
      const group = MODE_GROUPS.find((g) => g.id === groupId);
      if (group?.submodes) return group.submodes.includes(mode);
      return mode === groupId;
    },
    [mode]
  );

  const sonstigeGroup = MODE_GROUPS.find((g) => g.submodes);
  const isSonstigeActive = sonstigeGroup?.submodes?.includes(mode) ?? false;

  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {MODE_GROUPS.map((group) => {
        if (group.submodes) {
          return (
            <SettingsDropdown
              key={group.id}
              config={{
                key: group.id,
                label: group.label,
                options: group.submodes.map((id) => ({
                  id,
                  label: SUBMODE_LABELS[id] ?? id,
                })),
                multiple: false,
              }}
              value={isSonstigeActive ? mode : ''}
              onChange={(val) => onModeChange(val as string)}
              triggerLabel={group.label}
            />
          );
        }

        const active = isGroupActive(group.id);
        return (
          <button
            key={group.id}
            type="button"
            onClick={() => onModeChange(resolveGroupMode(group.id))}
            className={cn(pillBase, active ? pillActive : pillInactive)}
          >
            {group.icon && <span className="shrink-0 [&_svg]:size-3.5">{group.icon}</span>}
            <span className="max-sm:hidden">{group.label}</span>
          </button>
        );
      })}
    </div>
  );
});

ModePillRow.displayName = 'ModePillRow';

export default ModePillRow;
