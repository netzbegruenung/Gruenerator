import TextareaAutosize from 'react-textarea-autosize';
import type { TextSectionProps } from '../types';
import '../../../../../assets/styles/components/form/form-inputs.css';
import './TextSection.css';

export function TextSection({
  quote,
  name,
  onQuoteChange,
  onNameChange,
}: TextSectionProps) {
  return (
    <div className="sidebar-section sidebar-section--text">
      <TextareaAutosize
        id="quote-text"
        className="form-textarea"
        value={quote}
        onChange={(e) => onQuoteChange(e.target.value)}
        placeholder="Zitat eingeben..."
        minRows={2}
      />
      <input
        id="name-text"
        className="form-input"
        type="text"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder="Name eingeben..."
      />
    </div>
  );
}
