import React from 'react';

const CalloutBlock = ({ 
    title, 
    text, 
    buttonText, 
    buttonHref, 
    onClick,
    className = '' 
}) => {
    return (
        <div className={`callout-block ${className}`}>
            {title && (
                <h3 className="callout-block__title">
                    {title}
                </h3>
            )}
            {text && (
                <p className="callout-block__text">
                    {text}
                </p>
            )}
            {buttonText && (
                <>
                    {buttonHref ? (
                        <a 
                            href={buttonHref}
                            className="callout-block__button"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            {buttonText}
                        </a>
                    ) : (
                        <button 
                            className="callout-block__button"
                            onClick={onClick}
                        >
                            {buttonText}
                        </button>
                    )}
                </>
            )}
        </div>
    );
};

export default CalloutBlock;