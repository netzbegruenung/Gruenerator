import React from 'react';
import { MdSubtitles, MdAutoAwesome } from 'react-icons/md';

import type { IconType } from 'react-icons';
import '../styles/ModeSelector.css';

interface Mode {
  id: 'auto' | 'subtitle';
  title: string;
  description: string;
  Icon: IconType;
  enabled: boolean;
}

interface ModeSelectorProps {
  onSelect: (modeId: Mode['id']) => void;
  videoFile: File;
}

const modes: Mode[] = [
  {
    id: 'auto',
    title: 'Automatisch',
    description: 'Ein Klick: Stille entfernen, Untertitel hinzufügen',
    Icon: MdAutoAwesome,
    enabled: true,
  },
  {
    id: 'subtitle',
    title: 'Manuell',
    description: 'Schnell Untertitel zu deinem Video hinzufügen',
    Icon: MdSubtitles,
    enabled: true,
  },
];

const ModeSelector: React.FC<ModeSelectorProps> = ({ onSelect, videoFile }) => {
  const handleCardClick = (mode: Mode) => {
    if (mode.enabled) {
      onSelect(mode.id);
    }
  };

  return (
    <div className="mode-selector">
      <div className="mode-selector-cards">
        {modes.map((mode) => (
          <button
            key={mode.id}
            className={`mode-card ${!mode.enabled ? 'mode-card-disabled' : ''}`}
            onClick={() => handleCardClick(mode)}
            disabled={!mode.enabled}
            type="button"
          >
            <div className="mode-card-icon">
              <mode.Icon />
            </div>
            <div className="mode-card-content">
              <h3 className="mode-card-title">{mode.title}</h3>
              <p className="mode-card-description">{mode.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default ModeSelector;
