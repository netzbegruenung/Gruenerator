// Neue Komponente: AdvancedEditingSection.js
import React from 'react';
import PropTypes from 'prop-types';
import { BalkenOffsetControl, BalkenGruppeControl, SonnenblumenControl } from '../utils/ImageModificationForm';

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
      <BalkenOffsetControl
  balkenOffset={balkenOffset}
  onControlChange={(name, value) => {
    console.log('AdvancedEditingSection onControlChange:', name, value);
    onBalkenOffsetChange(value);
  }}
/>
      <BalkenGruppeControl
        offset={balkenGruppenOffset}
        onOffsetChange={onBalkenGruppenOffsetChange}
      />
      <SonnenblumenControl
        offset={sunflowerOffset}
        onOffsetChange={onSonnenblumenOffsetChange}
      />
    </div>
  );
};

AdvancedEditingSection.propTypes = {
  balkenOffset: PropTypes.arrayOf(PropTypes.number).isRequired,
  balkenGruppenOffset: PropTypes.arrayOf(PropTypes.number).isRequired,
  sunflowerOffset: PropTypes.arrayOf(PropTypes.number).isRequired,
  onBalkenOffsetChange: PropTypes.func.isRequired,
  onBalkenGruppenOffsetChange: PropTypes.func.isRequired,
  onSonnenblumenOffsetChange: PropTypes.func.isRequired,
};

export default AdvancedEditingSection;