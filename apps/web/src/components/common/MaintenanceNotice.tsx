import { FaTools } from 'react-icons/fa';
import styles from './MaintenanceNotice.module.css';

export interface MaintenanceNoticeProps {
  featureName?: string;
}

const MaintenanceNotice = ({ featureName = 'Dieser Bereich' }: MaintenanceNoticeProps) => {
  return (
    <div className={styles.maintenanceContainer}>
      <FaTools className={styles.maintenanceIcon} aria-hidden="true" />
      <h2 className={styles.maintenanceTitle}>{featureName} wird gerade gewartet</h2>
      <p className={styles.maintenanceText}>
        Wir führen gerade Wartungsarbeiten an dieser Funktion durch, um sie für dich zu verbessern.
        Bitte versuche es später noch einmal. Vielen Dank für dein Verständnis!
      </p>
    </div>
  );
};

export default MaintenanceNotice;
