import { BalkenOffsetControl, BalkenGruppeControl, SonnenblumenControl } from '../../../../components/utils/ImageModificationForm';

interface AdvancedEditingSectionProps {
  balkenOffset: number[];
  balkenGruppenOffset: { x: number; y: number };
  sunflowerOffset: { x: number; y: number };
  onBalkenOffsetChange: (value: number[]) => void;
  onBalkenGruppenOffsetChange: (offset: { x: number; y: number }) => void;
  onSonnenblumenOffsetChange: (offset: { x: number; y: number }) => void;
}

const AdvancedEditingSection = ({
  balkenOffset,
  balkenGruppenOffset,
  sunflowerOffset,
  onBalkenOffsetChange,
  onBalkenGruppenOffsetChange,
  onSonnenblumenOffsetChange,
}: AdvancedEditingSectionProps) => {
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
