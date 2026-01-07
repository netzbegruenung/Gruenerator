import React from 'react';
import { BRAND_COLORS } from '../../../utils/shapes';
import '../FloatingTapBar.css';

interface FloatingColorPickerProps {
    currentColor: string;
    onColorSelect: (color: string) => void;
}

export function FloatingColorPicker({ currentColor, onColorSelect }: FloatingColorPickerProps) {
    const [isExpanded, setIsExpanded] = React.useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);

    // Auto-collapse on click outside
    React.useEffect(() => {
        if (!isExpanded) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsExpanded(false);
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsExpanded(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isExpanded]);

    // Reset state if current color changes externally (optional, but good for sync)
    // Actually, we probably want to keep it as is unless explicitly closed.

    if (!isExpanded) {
        return (
            <div className="floating-color-picker floating-color-picker--collapsed" ref={containerRef}>
                <button
                    className="floating-color-btn floating-color-trigger"
                    style={{ backgroundColor: currentColor }}
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsExpanded(true);
                    }}
                    title="Farbe ändern"
                    type="button"
                    aria-expanded="false"
                    aria-label="Farbpalette öffnen"
                />
            </div>
        );
    }

    return (
        <div className="floating-color-picker floating-color-picker--expanded" ref={containerRef}>
            {BRAND_COLORS.map((color) => (
                <button
                    key={color.id}
                    className={`floating-color-btn ${currentColor === color.value ? 'floating-color-btn--active' : ''}`}
                    style={{ backgroundColor: color.value }}
                    onClick={(e) => {
                        e.stopPropagation();
                        onColorSelect(color.value);
                        // Optional: Close on select? Or keep open for browsing?
                        // "Best Practice" usually allows rapid browsing, so keeping open is better.
                        // Can click trigger (which is now part of the list if we render it differently, or just the list itself) to close?
                        // Let's rely on click-outside to close for a better UX.
                    }}
                    title={color.name}
                    type="button"
                />
            ))}
        </div>
    );
}
