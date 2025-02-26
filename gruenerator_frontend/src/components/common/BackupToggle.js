import React from 'react';
import PropTypes from 'prop-types';
import { HiServer } from 'react-icons/hi';
import FeatureToggle from './FeatureToggle';

const BackupToggle = ({ useBackupProvider, setUseBackupProvider }) => {
  return (
    <FeatureToggle
      isActive={useBackupProvider}
      onToggle={setUseBackupProvider}
      label="BackUp-Grünerator (ChatGPT)"
      icon={HiServer}
      className="backup-toggle"
    />
  );
};

BackupToggle.propTypes = {
  useBackupProvider: PropTypes.bool.isRequired,
  setUseBackupProvider: PropTypes.func.isRequired
};

export default BackupToggle;