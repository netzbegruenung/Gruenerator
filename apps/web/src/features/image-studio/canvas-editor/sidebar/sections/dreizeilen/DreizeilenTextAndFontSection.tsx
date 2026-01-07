import { PiTextT, PiTextAa } from 'react-icons/pi';
import { SubsectionTabBar, Subsection } from '../../SubsectionTabBar';
import { FontSizeSection } from '../FontSizeSection';
import { TextControl } from '../TextSection';
import type { AdditionalText } from '../../../configs/types';
import './DreizeilenTextSection.css';

export interface DreizeilenTextAndFontSectionProps {
    line1: string;
    line2: string;
    line3: string;
    onLine1Change: (value: string) => void;
    onLine2Change: (value: string) => void;
    onLine3Change: (value: string) => void;
    fontSize: number;
    onFontSizeChange: (value: number) => void;
    // Additional Texts
    additionalTexts?: AdditionalText[];
    onAddHeader?: () => void;
    onAddText?: () => void;
    onUpdateAdditionalText?: (id: string, text: string) => void;
    onRemoveAdditionalText?: (id: string) => void;
}

/**
 * Combined Text + Font Size section.
 * On desktop: shows both stacked.
 * On mobile: uses SubsectionTabBar to switch between Text input and Font size.
 */
export function DreizeilenTextAndFontSection({
    line1,
    line2,
    line3,
    onLine1Change,
    onLine2Change,
    onLine3Change,
    fontSize,
    onFontSizeChange,
    additionalTexts = [],
    onAddHeader,
    onAddText,
    onUpdateAdditionalText,
    onRemoveAdditionalText,
}: DreizeilenTextAndFontSectionProps) {
    // Text editing content
    const textContent = (
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

            {/* Additional Texts List */}
            {additionalTexts.length > 0 && (
                <div className="additional-texts-list" style={{ marginTop: 16 }}>
                    {additionalTexts.map((item) => (
                        <TextControl
                            key={item.id}
                            value={item.text}
                            onChange={(val) => onUpdateAdditionalText?.(item.id, val)}
                            placeholder={item.type === 'header' ? "Zusatz-Header..." : "Zusatz-Text..."}
                            onRemove={() => onRemoveAdditionalText?.(item.id)}
                            type={item.type}
                        />
                    ))}
                </div>
            )}

            {(onAddHeader || onAddText) && (
                <div className="text-section-actions" style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                    {onAddHeader && (
                        <button className="btn btn-secondary btn-sm" onClick={onAddHeader} style={{ flex: 1 }}>
                            + Überschrift
                        </button>
                    )}
                    {onAddText && (
                        <button className="btn btn-secondary btn-sm" onClick={onAddText} style={{ flex: 1 }}>
                            + Text
                        </button>
                    )}
                </div>
            )}
        </div>
    );

    // Font size content
    const fontSizeContent = (
        <FontSizeSection
            quoteFontSize={fontSize}
            onQuoteFontSizeChange={onFontSizeChange}
        />
    );

    const subsections: Subsection[] = [
        { id: 'text', icon: PiTextT, label: 'Text', content: textContent },
        { id: 'fontsize', icon: PiTextAa, label: 'Größe', content: fontSizeContent },
    ];

    return (
        <div className="dreizeilen-text-and-font-section" style={{ paddingTop: 16 }}>
            <SubsectionTabBar subsections={subsections} defaultSubsection="text" />
        </div>
    );
}
