import type { MouseEvent, ReactNode } from 'react';

// Canva Button Feature CSS - Loaded only when this feature is accessed
import '../../../../assets/styles/components/canva/canva-button.css';

/**
 * Canva-branded button component following official brand guidelines
 * Uses official Canva icon and brand-compliant styling
 */
interface CanvaButtonProps {
  onClick?: (event: React.MouseEvent) => void;
  disabled?: boolean;
  loading?: boolean;
  size?: 'small' | 'medium' | 'large';
  variant?: 'primary' | 'secondary';
  children?: ReactNode;
  className?: string;
  ariaLabel?: string;
}

const CanvaButton = ({ onClick,
    disabled = false,
    loading = false,
    size = 'medium', // 'small', 'medium', 'large'
    variant = 'primary', // 'primary', 'secondary'
    children,
    className = '',
    ariaLabel,
    ...props }: CanvaButtonProps): JSX.Element => {
    const handleClick = (e) => {
        if (!disabled && !loading && onClick) {
            onClick(e);
        }
    };

    const getButtonClass = () => {
        let classes = ['canva-button'];

        // Size classes
        classes.push(`canva-button-${size}`);

        // Variant classes
        classes.push(`canva-button-${variant}`);

        // State classes
        if (disabled) classes.push('canva-button-disabled');
        if (loading) classes.push('canva-button-loading');

        // Custom className
        if (className) classes.push(className);

        return classes.join(' ');
    };

    const renderIcon = () => (
        <div className="canva-button-icon">
            <img
                src="/images/canva/Canva Icon logo.svg"
                alt="Canva"
                className="canva-logo"
            />
        </div>
    );

    const renderContent = () => {
        if (loading) {
            return (
                <>
                    {renderIcon()}
                    <span className="canva-button-text">Verbinde...</span>
                </>
            );
        }

        return (
            <>
                {renderIcon()}
                <span className="canva-button-text">
                    {children || 'Mit Canva verbinden'}
                </span>
            </>
        );
    };

    return (
        <button
            type="button"
            className={getButtonClass()}
            onClick={handleClick}
            disabled={disabled || loading}
            aria-label={ariaLabel || 'Mit Canva verbinden'}
            {...props}
        >
            {renderContent()}
        </button>
    );
};

export default CanvaButton;
