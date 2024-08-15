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
      <h2>Erweiterter Editor (für Expert*innen)</h2>
      <BalkenOffsetControl
        balkenOffset={balkenOffset}
        onControlChange={onBalkenOffsetChange}
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