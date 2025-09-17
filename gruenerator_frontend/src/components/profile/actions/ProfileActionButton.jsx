import React from 'react';
import PropTypes from 'prop-types';
import { ICONS } from '../../../config/icons';

const DEFAULTS = {
  edit: { label: 'Bearbeiten', variant: 'secondary' },
  delete: { label: 'Löschen', variant: 'danger' },
  back: { label: 'Zurück', variant: 'ghost' },
  refresh: { label: 'Aktualisieren', variant: 'ghost' },
  open: { label: 'Öffnen', variant: 'secondary' },
  add: { label: 'Hinzufügen', variant: 'ghost' },
  info: { label: 'Info', variant: 'ghost' }
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
  return ICONS.actions[action] || null;
};

export const ProfileActionButton = ({
  action,
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
  showLabel = true
}) => {
  const defaults = DEFAULTS[action] || { label: action, variant: 'secondary' };
  const finalLabel = label || defaults.label;
  const finalTitle = title || finalLabel;
  const finalAria = ariaLabel || finalLabel;
  const finalVariant = variant || defaults.variant;
  const Icon = getIconForAction(action);

  return (
    <button
      type="button"
      className={`${variantToClass(finalVariant)} ${sizeToClass(size)} ${className}`}
      onClick={onClick}
      disabled={disabled || loading}
      aria-label={finalAria}
      title={finalTitle}
    >
      {Icon ? (
        loading && spinOnLoading ? (
          <Icon className="pabtn__icon spinning" />
        ) : (
          <Icon className="pabtn__icon" />
        )
      ) : (
        loading ? <span className="pabtn__spinner" aria-hidden="true" /> : null
      )}
      {showLabel && finalLabel && <span className="pabtn__label">{finalLabel}</span>}
    </button>
  );
};

ProfileActionButton.propTypes = {
  action: PropTypes.oneOf(['edit','delete','back','refresh','open','add','info']).isRequired,
  label: PropTypes.string,
  ariaLabel: PropTypes.string,
  title: PropTypes.string,
  variant: PropTypes.oneOf(['ghost','secondary','primary','danger','delete']),
  size: PropTypes.oneOf(['s','m']),
  loading: PropTypes.bool,
  spinOnLoading: PropTypes.bool,
  disabled: PropTypes.bool,
  onClick: PropTypes.func,
  className: PropTypes.string,
  showLabel: PropTypes.bool
};

export const ProfileIconButton = (props) => (
  <ProfileActionButton {...props} label={undefined} showLabel={false} />
);

export default ProfileActionButton;
