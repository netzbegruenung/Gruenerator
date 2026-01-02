// Neue Komponente: AdvancedEditingSection.js
import React from 'react';
import { BalkenOffsetControl, BalkenGruppeControl, SonnenblumenControl } from '../../../../components/utils/ImageModificationForm';

const AdvancedEditingSection = ({
  balkenOffset,
  balkenGruppenOffset,
  sunflowerOffset,
  onBalkenOffsetChange,
  onBalkenGruppenOffsetChange,
  onSonnenblumenOffsetChange,
}) => {
  return (
    <div className="advanced-editing-section">
      <h3>Erweiterter Editor (für Expert*innen)</h3>
      <div className="advanced-controls-grid">
        <div className="control-item">
          <h4>Einzelne Balken verschieben</h4>
          <p>Passe die Position jedes einzelnen Balkens individuell an.</p>
          <BalkenOffsetControl
            balkenOffset={balkenOffset}
            onControlChange={(name, value) => {
              console.log('AdvancedEditingSection onControlChange:', name, value);
              onBalkenOffsetChange(value);
            }}
          />
        </div>
        <div className="control-item">
          <BalkenGruppeControl
            offset={balkenGruppenOffset}
            onOffsetChange={onBalkenGruppenOffsetChange}
          />
        </div>
        <div className="control-item">
          <SonnenblumenControl
            offset={sunflowerOffset}
            onOffsetChange={onSonnenblumenOffsetChange}
          />
        </div>
      </div>
    </div>
  );
};

export default AdvancedEditingSection;
