import { useState } from 'react';
import { FaInstagram } from 'react-icons/fa';
import type { EmbedPlatform } from '../../types/consent';
import '../../styles/components/embed-consent.css';

interface ConsentText {
  title: string;
  description: string;
  warning: string;
  rememberLabel: string;
  loadButton: string;
  privacyLink: string;
  privacyUrl: string;
}

const PLATFORM_CONTENT: Record<EmbedPlatform, { icon: React.ReactNode; text: ConsentText }> = {
  instagram: {
    icon: <FaInstagram />,
    text: {
      title: 'Instagram-Inhalte laden',
      description:
        'Durch Klicken auf "Instagram-Inhalte laden" werden Inhalte von Instagram eingebettet. Dabei werden Daten an Meta Platforms Ireland Ltd. (und ggf. Meta Platforms Inc. in den USA) übermittelt.',
      warning:
        'Die USA gelten nach EU-Recht als Land mit unzureichendem Datenschutzniveau. Meta verarbeitet Ihre Daten gemäß der Instagram-Datenschutzrichtlinie.',
      rememberLabel: 'Meine Auswahl für diesen Browser merken',
      loadButton: 'Instagram-Inhalte laden',
      privacyLink: 'Mehr erfahren',
      privacyUrl: 'https://help.instagram.com/519522125107875',
    },
  },
  youtube: {
    icon: null,
    text: {
      title: 'YouTube-Inhalte laden',
      description:
        'Durch Klicken auf "YouTube-Inhalte laden" werden Inhalte von YouTube eingebettet. Dabei werden Daten an Google Ireland Ltd. übermittelt.',
      warning:
        'Die USA gelten nach EU-Recht als Land mit unzureichendem Datenschutzniveau.',
      rememberLabel: 'Meine Auswahl für diesen Browser merken',
      loadButton: 'YouTube-Inhalte laden',
      privacyLink: 'Mehr erfahren',
      privacyUrl: 'https://policies.google.com/privacy',
    },
  },
  twitter: {
    icon: null,
    text: {
      title: 'X/Twitter-Inhalte laden',
      description:
        'Durch Klicken auf "X-Inhalte laden" werden Inhalte von X (Twitter) eingebettet. Dabei werden Daten an X Corp. in den USA übermittelt.',
      warning:
        'Die USA gelten nach EU-Recht als Land mit unzureichendem Datenschutzniveau.',
      rememberLabel: 'Meine Auswahl für diesen Browser merken',
      loadButton: 'X-Inhalte laden',
      privacyLink: 'Mehr erfahren',
      privacyUrl: 'https://twitter.com/privacy',
    },
  },
};

interface EmbedConsentPlaceholderProps {
  platform: EmbedPlatform;
  onConsent: (remember: boolean) => void;
}

export function EmbedConsentPlaceholder({ platform, onConsent }: EmbedConsentPlaceholderProps) {
  const [rememberChoice, setRememberChoice] = useState(false);
  const content = PLATFORM_CONTENT[platform];

  const handleLoadClick = () => {
    onConsent(rememberChoice);
  };

  return (
    <div className="embed-consent-placeholder">
      <div className="embed-consent-icon">{content.icon}</div>
      <h3 className="embed-consent-title">{content.text.title}</h3>
      <p className="embed-consent-description">{content.text.description}</p>
      <p className="embed-consent-warning">{content.text.warning}</p>

      <label className="embed-consent-checkbox">
        <input
          type="checkbox"
          checked={rememberChoice}
          onChange={(e) => setRememberChoice(e.target.checked)}
        />
        <span>{content.text.rememberLabel}</span>
      </label>

      <div className="embed-consent-actions">
        <button className="embed-consent-button" onClick={handleLoadClick}>
          {content.icon}
          {content.text.loadButton}
        </button>
        <a
          href={content.text.privacyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="embed-consent-link"
        >
          {content.text.privacyLink}
        </a>
      </div>
    </div>
  );
}
