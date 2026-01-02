import type { MouseEvent } from 'react';
import { ICONS } from '../../../config/icons';
import { SiCanva } from 'react-icons/si';

const DEFAULTS = {
  edit: { label: 'Bearbeiten', variant: 'secondary' },
  delete: { label: 'Löschen', variant: 'danger' },
  back: { label: 'Zurück', variant: 'ghost' },
  refresh: { label: 'Aktualisieren', variant: 'ghost' },
  open: { label: 'Öffnen', variant: 'secondary' },
  add: { label: 'Hinzufügen', variant: 'ghost' },
  info: { label: 'Info', variant: 'ghost' },
  altText: { label: 'Alt-Text', variant: 'secondary' },
  kiLabel: { label: 'KI-Label', variant: 'primary' },
  download: { label: 'Herunterladen', variant: 'primary' },
  canva: { label: 'In Canva bearbeiten', variant: 'secondary' },
  link: { label: 'Link kopieren', variant: 'ghost' },
  share: { label: 'Teilen', variant: 'primary' }
};

const variantToClass = (variant) => {
  switch (variant) {
    case 'primary': return 'pabtn pabtn--primary';
    case 'secondary': return 'pabtn pabtn--secondary';
    case 'danger': return 'pabtn pabtn--danger';
    case 'delete': return 'pabtn pabtn--delete';
    case 'ghost': default: return 'pabtn pabtn--ghost';
  }
};

const sizeToClass = (size) => (size === 'm' ? 'pabtn--m' : 'pabtn--s');

const getIconForAction = (action) => {
  if (action === 'open') return ICONS.actions.arrowRight;
  if (action === 'canva') return SiCanva;
  return ICONS.actions[action] || null;
};

export interface ProfileActionButtonProps {
  action: 'edit' | 'delete' | 'back' | 'refresh' | 'open' | 'add' | 'info' | 'altText' | 'kiLabel' | 'download' | 'canva' | 'link' | 'share';
  label?: string;
  ariaLabel?: string;
  title?: string;
  variant?: 'ghost' | 'secondary' | 'primary' | 'danger' | 'delete';
  size?: 's' | 'm';
  loading?: boolean;
  spinOnLoading?: boolean;
  disabled?: boolean;
  onClick?: (event: React.MouseEvent) => void;
  className?: string;
  showLabel?: boolean;
}

export const ProfileActionButton = ({ action,
  label,
  ariaLabel,
  title,
  variant,
  size = 's',
  loading = false,
  spinOnLoading = false,
  disabled = false,
  onClick,
  className = '',
  showLabel = true }: ProfileActionButtonProps): JSX.Element => {
  const defaults = DEFAULTS[action] || { label: action, variant: 'secondary' };
  const finalLabel = label || defaults.label;
  const finalTitle = title || finalLabel;
  const finalAria = ariaLabel || finalLabel;
  const finalVariant = variant || defaults.variant;
  const Icon = getIconForAction(action);

  const renderIcon = () => {
    if (Icon) {
      return loading && spinOnLoading ? (
        <Icon className="pabtn__icon spinning" />
      ) : (
        <Icon className="pabtn__icon" />
      );
    }
    if (loading) {
      return <span className="pabtn__spinner" aria-hidden="true" />;
    }
    return null;
  };

  return (
    <button
      type="button"
      className={`${variantToClass(finalVariant)} ${sizeToClass(size)} ${className}`}
      onClick={onClick}
      disabled={disabled || loading}
      aria-label={finalAria}
      title={finalTitle}
    >
      {renderIcon()}
      {showLabel && finalLabel && <span className="pabtn__label">{finalLabel}</span>}
    </button>
  );
};

export const ProfileIconButton = (props) => (
  <ProfileActionButton {...props} label={undefined} showLabel={false} />
);

export default ProfileActionButton;
