import React from 'react';

const PageHeader = ({ 
    title, 
    subtitle, 
    author, 
    readTime, 
    alignment = 'center',
    showDivider = true 
}) => {
    const headerClass = `page-header ${alignment === 'left' ? 'page-header--left-aligned' : ''}`;

    return (
        <header className={headerClass}>
            {title && (
                <h1 className="page-header__title gradient-title">
                    {title}
                </h1>
            )}
            
            {subtitle && (
                <p className="page-header__subtitle">
                    {subtitle}
                </p>
            )}

            {(author || readTime) && (
                <div className="page-header__meta">
                    {author && (
                        <span className="page-header__author">
                            {author}
                        </span>
                    )}
                    {readTime && (
                        <span className="page-header__read-time">
                            {readTime} Lesezeit
                        </span>
                    )}
                </div>
            )}

            {showDivider && (
                <hr className="page-header__divider" />
            )}
        </header>
    );
};

export default PageHeader;