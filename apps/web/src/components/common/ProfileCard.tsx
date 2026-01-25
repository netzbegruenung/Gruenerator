import type { ReactNode, HTMLAttributes } from 'react';

interface ProfileCardProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  children: ReactNode;
  headerActions?: ReactNode;
  className?: string;
  contentClassName?: string;
}

const ProfileCard = ({
  title,
  children,
  headerActions = null,
  className = '',
  contentClassName = '',
  ...props
}: ProfileCardProps) => {
  return (
    <div className={`profile-card ${className}`} {...props}>
      <div className="profile-card-header">
        <h3>{title}</h3>
        {headerActions}
      </div>
      <div className={`profile-card-content ${contentClassName}`}>{children}</div>
    </div>
  );
};

export default ProfileCard;
