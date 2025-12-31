import React, { useMemo } from 'react';
import { MdSubtitles, MdVideoSettings, MdAutoAwesome } from 'react-icons/md';
import { useBetaFeatures } from '../../../hooks/useBetaFeatures';
import '../styles/ModeSelector.css';

const allModes = [
  {
    id: 'auto',
    title: 'Automatisch',
    description: 'Ein Klick: Stille entfernen, Untertitel hinzufügen',
    Icon: MdAutoAwesome,
    enabled: true
  },
  {
    id: 'subtitle',
    title: 'Manuell',
    description: 'Schnell Untertitel zu deinem Video hinzufügen',
    Icon: MdSubtitles,
    enabled: true
  },
  {
    id: 'full-edit',
    title: 'Volle Bearbeitung inkl. Untertitel',
    description: 'Video schneiden, Text-Overlays und Untertitel',
    Icon: MdVideoSettings,
    enabled: true,
    badge: 'Beta'
  }
];

const ModeSelector = ({ onSelect, videoFile }) => {
  const { canAccessBetaFeature } = useBetaFeatures();

  const modes = useMemo(() => {
    if (canAccessBetaFeature('videoEditor')) {
      return allModes;
    }
    return allModes.filter(mode => mode.id !== 'full-edit');
  }, [canAccessBetaFeature]);

  const handleCardClick = (mode) => {
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
            {mode.badge && (
              <span className="mode-card-badge">{mode.badge}</span>
            )}
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
