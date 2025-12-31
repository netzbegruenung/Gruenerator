import React from 'react';

const QuoteBlock = ({ text, author, title, className = '' }) => {
    return (
        <blockquote className={`quote-block ${className}`}>
            <p className="quote-block__text">
                {text}
            </p>
            {(author || title) && (
                <footer className="quote-block__attribution">
                    {author && <cite className="quote-block__author">{author}</cite>}
                    {author && title && ', '}
                    {title && <span className="quote-block__title">{title}</span>}
                </footer>
            )}
        </blockquote>
    );
};

export default QuoteBlock;