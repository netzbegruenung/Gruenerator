import React from 'react';
import { FaTools } from 'react-icons/fa'; // Example icon
import styles from './MaintenanceNotice.module.css';

const MaintenanceNotice = ({ featureName = 'Dieser Bereich' }) => {
  return (
    <div className={styles.maintenanceContainer}>
      <FaTools className={styles.maintenanceIcon} aria-hidden="true" />
      <h2 className={styles.maintenanceTitle}>{featureName} wird gerade gewartet</h2>
      <p className={styles.maintenanceText}>
        Wir führen gerade Wartungsarbeiten an dieser Funktion durch, um sie für dich zu verbessern.
        Bitte versuche es später noch einmal.
        Vielen Dank für dein Verständnis!
      </p>
    </div>
  );
};

export default MaintenanceNotice; 