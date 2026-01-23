import { HiBeaker } from 'react-icons/hi';

import { StatusBadge } from '../StatusBadge';
import './EarlyAccessBanner.css';

interface EarlyAccessBannerProps {
  feedbackUrl?: string;
  description?: string;
}

const EarlyAccessBanner = ({
  feedbackUrl = 'https://tally.so/r/kdGVxr',
  description = 'Diese Funktion befindet sich noch in der Testphase. Es kann zu Fehlern kommen.',
}: EarlyAccessBannerProps) => {
  return (
    <div className="early-access-banner">
      <HiBeaker className="early-access-banner__icon" />
      <div className="early-access-banner__content">
        <p className="early-access-banner__title">
          Early Access <StatusBadge type="early-access" variant="inline" />
        </p>
        <p className="early-access-banner__text">{description}</p>
      </div>
      <a
        href={feedbackUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="early-access-banner__link"
      >
        Feedback geben
      </a>
    </div>
  );
};

export default EarlyAccessBanner;
