import { SettingsDropdown, SettingsTagInput } from '@gruenerator/ui';
import React, { memo } from 'react';

import FeatureIcons from '../../../components/common/FeatureIcons';
import { MODE_MAP, type ModeState, type ModeDefinition } from '../modes';

interface ModeToolbarProps {
  mode: string;
  state: ModeState;
  onStateChange: (key: string, value: string | string[]) => void;
  attachedFiles: unknown[];
  onAttachmentClick: (files: File[]) => Promise<void>;
  onRemoveFile: (index: number) => void;
  def?: ModeDefinition;
}

const ModeToolbar: React.FC<ModeToolbarProps> = memo(
  ({
    mode,
    state,
    onStateChange,
    attachedFiles,
    onAttachmentClick,
    onRemoveFile,
    def: defProp,
  }) => {
    const def = defProp ?? MODE_MAP[mode];

    return (
      <>
        <FeatureIcons
          onAttachmentClick={onAttachmentClick}
          onRemoveFile={onRemoveFile}
          attachedFiles={attachedFiles as []}
          showAgentMode={def?.showAgentMode}
          noBorder
        />
        {def?.settings?.map((config) => (
          <SettingsDropdown
            key={config.key}
            config={config}
            value={state[config.key] ?? (config.multiple ? [] : '')}
            onChange={(val) => onStateChange(config.key, val)}
          />
        ))}
        {def?.tagInputs?.map((config) => (
          <SettingsTagInput
            key={config.key}
            items={(state[config.key] as string[]) ?? []}
            onChange={(items) => onStateChange(config.key, items)}
            triggerLabel={config.label}
            placeholder={config.placeholder}
          />
        ))}
      </>
    );
  }
);

ModeToolbar.displayName = 'ModeToolbar';

export default ModeToolbar;
