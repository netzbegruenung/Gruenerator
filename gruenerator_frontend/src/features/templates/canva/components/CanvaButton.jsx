import React from 'react';
import PropTypes from 'prop-types';

// Canva Button Feature CSS - Loaded only when this feature is accessed
import '../../../../assets/styles/components/canva/canva-button.css';

/**
 * Canva-branded button component following official brand guidelines
 * Uses official Canva icon and brand-compliant styling
 */
const CanvaButton = ({
    onClick,
    disabled = false,
    loading = false,
    size = 'medium', // 'small', 'medium', 'large'
    variant = 'primary', // 'primary', 'secondary'
    children,
    className = '',
    ariaLabel,
    ...props
}) => {
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

CanvaButton.propTypes = {
    onClick: PropTypes.func,
    disabled: PropTypes.bool,
    loading: PropTypes.bool,
    size: PropTypes.oneOf(['small', 'medium', 'large']),
    variant: PropTypes.oneOf(['primary', 'secondary']),
    children: PropTypes.node,
    className: PropTypes.string,
    ariaLabel: PropTypes.string,
};

export default CanvaButton;