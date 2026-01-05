import './DreizeilenTextSection.css';

export interface DreizeilenTextSectionProps {
  line1: string;
  line2: string;
  line3: string;
  onLine1Change: (value: string) => void;
  onLine2Change: (value: string) => void;
  onLine3Change: (value: string) => void;
}

export function DreizeilenTextSection({
  line1,
  line2,
  line3,
  onLine1Change,
  onLine2Change,
  onLine3Change,
}: DreizeilenTextSectionProps) {
  return (
    <div className="sidebar-section sidebar-section--dreizeilen-text">
      <div className="form-field-wrapper">
        <label htmlFor="line1-input" className="form-field-label">
          Zeile 1
        </label>
        <input
          id="line1-input"
          type="text"
          className="form-input"
          value={line1}
          onChange={(e) => onLine1Change(e.target.value)}
          placeholder="Erste Zeile..."
        />
      </div>
      <div className="form-field-wrapper">
        <label htmlFor="line2-input" className="form-field-label">
          Zeile 2
        </label>
        <input
          id="line2-input"
          type="text"
          className="form-input"
          value={line2}
          onChange={(e) => onLine2Change(e.target.value)}
          placeholder="Zweite Zeile..."
        />
      </div>
      <div className="form-field-wrapper">
        <label htmlFor="line3-input" className="form-field-label">
          Zeile 3
        </label>
        <input
          id="line3-input"
          type="text"
          className="form-input"
          value={line3}
          onChange={(e) => onLine3Change(e.target.value)}
          placeholder="Dritte Zeile..."
        />
      </div>
      <p className="sidebar-hint">
        Gib hier deine drei Textzeilen ein, die jeweils auf einem eigenen Balken erscheinen. Mit der Schriftgröße kannst du deinen Text hervorheben. Halte die Zeilen etwa gleich lang und vermeide zu kleine Schriften für bessere Lesbarkeit.
      </p>
    </div>
  );
}
