import React from 'react';
import PropTypes from 'prop-types';

const ProfileCard = ({ 
    title, 
    children, 
    headerActions = null,
    className = '',
    contentClassName = '',
    ...props 
}) => {
    return (
        <div className={`profile-card ${className}`} {...props}>
            <div className="profile-card-header">
                <h3>{title}</h3>
                {headerActions}
            </div>
            <div className={`profile-card-content ${contentClassName}`}>
                {children}
            </div>
        </div>
    );
};

ProfileCard.propTypes = {
    title: PropTypes.string.isRequired,
    children: PropTypes.node.isRequired,
    headerActions: PropTypes.node,
    className: PropTypes.string,
    contentClassName: PropTypes.string
};

export default ProfileCard;