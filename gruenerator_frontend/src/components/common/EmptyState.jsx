import React from 'react';
import PropTypes from 'prop-types';

const EmptyState = ({ 
    icon: Icon, 
    iconSize = 48,
    title, 
    description, 
    children,
    className = '',
    centered = true 
}) => {
    return (
        <div className={`knowledge-empty-state ${centered ? 'centered' : ''} ${className}`}>
            {Icon && <Icon size={iconSize} className="empty-state-icon" />}
            {title && <p>{title}</p>}
            {description && <p className="empty-state-description">{description}</p>}
            {children}
        </div>
    );
};

EmptyState.propTypes = {
    icon: PropTypes.elementType,
    iconSize: PropTypes.number,
    title: PropTypes.string,
    description: PropTypes.string,
    children: PropTypes.node,
    className: PropTypes.string,
    centered: PropTypes.bool
};

export default EmptyState;