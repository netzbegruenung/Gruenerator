import React from 'react';
import PropTypes from 'prop-types';
import '../../assets/styles/components/BackupToggle.css';

const BackupToggle = ({ useBackupProvider, setUseBackupProvider }) => {
  const handleToggle = () => {
    const newValue = !useBackupProvider;
    console.log('[BackupToggle] Toggling backup provider:', newValue);
    setUseBackupProvider(newValue);
  };

  return (
    <div className="backup-toggle">
      <label className="backup-switch">
        <input
          type="checkbox"
          checked={useBackupProvider}
          onChange={handleToggle}
        />
        <span className="backup-slider"></span>
      </label>
      <span className="backup-label">
        BackUp-Grünerator (ChatGPT) {useBackupProvider ? 'aktiv' : 'inaktiv'}
      </span>
    </div>
  );
};

BackupToggle.propTypes = {
  useBackupProvider: PropTypes.bool.isRequired,
  setUseBackupProvider: PropTypes.func.isRequired
};

export default BackupToggle;