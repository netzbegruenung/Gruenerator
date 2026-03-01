import { useState } from 'react';
import { FaInstagram } from 'react-icons/fa';

import type { EmbedPlatform } from '../../types/consent';

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
      warning: 'Die USA gelten nach EU-Recht als Land mit unzureichendem Datenschutzniveau.',
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
      warning: 'Die USA gelten nach EU-Recht als Land mit unzureichendem Datenschutzniveau.',
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
    <div className="flex flex-col items-center justify-center p-xl bg-neutral-600 rounded-md text-center min-h-[300px]">
      <div className="text-5xl text-grey-600 mb-md [&>svg]:w-12 [&>svg]:h-12">{content.icon}</div>
      <h3 className="font-[family-name:var(--font-family-heading)] text-xl text-grey-900 m-0 mb-sm">
        {content.text.title}
      </h3>
      <p className="text-sm text-grey-600 max-w-[480px] m-0 mb-sm leading-relaxed">
        {content.text.description}
      </p>
      <p className="text-xs text-grey-400 max-w-[480px] m-0 mb-lg leading-snug">
        {content.text.warning}
      </p>

      <label className="flex items-center gap-xs mb-md cursor-pointer">
        <input
          type="checkbox"
          checked={rememberChoice}
          onChange={(e) => setRememberChoice(e.target.checked)}
          className="w-[18px] h-[18px] accent-primary-600 cursor-pointer"
        />
        <span className="text-sm text-grey-600">{content.text.rememberLabel}</span>
      </label>

      <div className="flex flex-col items-center gap-sm">
        <button
          className="inline-flex items-center gap-xs py-sm px-lg bg-primary-600 text-white border-none rounded-sm font-[family-name:var(--font-family-body)] text-base font-semibold cursor-pointer transition-colors hover:bg-primary-700 [&>svg]:w-5 [&>svg]:h-5"
          onClick={handleLoadClick}
        >
          {content.icon}
          {content.text.loadButton}
        </button>
        <a
          href={content.text.privacyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary-600 no-underline hover:underline"
        >
          {content.text.privacyLink}
        </a>
      </div>
    </div>
  );
}
