import { FaTools } from 'react-icons/fa';

export interface MaintenanceNoticeProps {
  featureName?: string;
}

const MaintenanceNotice = ({ featureName = 'Dieser Bereich' }: MaintenanceNoticeProps) => {
  return (
    <div
      className={
        'flex flex-col items-center justify-center text-center ' +
        'px-md py-xl max-md:px-sm max-md:py-lg bg-background-alt rounded-lg ' +
        'mx-auto max-md:mx-sm my-lg max-md:my-md max-w-[600px] ' +
        'border border-grey-200 dark:border-grey-700 shadow-md min-h-[300px]'
      }
    >
      <FaTools
        className="text-5xl max-md:text-4xl text-primary-600 mb-md"
        aria-hidden="true"
      />
      <h2 className="text-2xl max-md:text-xl font-bold text-foreground-heading mb-sm">
        {featureName} wird gerade gewartet
      </h2>
      <p className="text-base max-md:text-sm text-foreground leading-relaxed">
        Wir führen gerade Wartungsarbeiten an dieser Funktion durch, um sie für dich zu verbessern.
        Bitte versuche es später noch einmal. Vielen Dank für dein Verständnis!
      </p>
    </div>
  );
};

export default MaintenanceNotice;
