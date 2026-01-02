import type { ReactNode } from 'react';

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

export default ProfileCard;
