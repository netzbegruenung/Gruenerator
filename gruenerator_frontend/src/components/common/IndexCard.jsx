import React from 'react';
import PropTypes from 'prop-types';
import '../../assets/styles/components/common/index-card.css';

const IndexCard = ({
  title,
  description,
  meta = null,
  tags = [],
  headerActions = null,
  onClick = null,
  className = '',
  variant = 'default',
  ...props
}) => {
  const handleKeyPress = (e) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick(e);
    }
  };

  const isClickable = !!onClick;
  const variantClass = variant !== 'default' ? `index-card--${variant}` : '';
  const clickableClass = !isClickable ? 'index-card--non-clickable' : '';

  return (
    <div
      className={`index-card ${variantClass} ${clickableClass} ${className}`}
      onClick={isClickable ? onClick : undefined}
      onKeyPress={isClickable ? handleKeyPress : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      {...props}
    >
      <div className="index-card__header">
        <h3 className="index-card__title">{title}</h3>
        {headerActions && (
          <div className="index-card__header-actions">{headerActions}</div>
        )}
      </div>

      <div className="index-card__content">
        {description && (
          <p className="index-card__description">{description}</p>
        )}
      </div>

      {tags.length > 0 && (
        <div className="index-card__tags">
          {tags.map((tag, index) => (
            <span key={index} className="index-card__tag">
              {tag}
            </span>
          ))}
        </div>
      )}

      {meta && <div className="index-card__meta">{meta}</div>}
    </div>
  );
};

IndexCard.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  meta: PropTypes.node,
  tags: PropTypes.arrayOf(PropTypes.string),
  headerActions: PropTypes.node,
  onClick: PropTypes.func,
  className: PropTypes.string,
  variant: PropTypes.oneOf(['default', 'elevated', 'subtle'])
};

export default IndexCard;
