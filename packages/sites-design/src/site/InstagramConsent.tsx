import { type MouseEvent } from 'react';
import { FaInstagram } from 'react-icons/fa6';

// Verbatim from PLATFORM_CONTENT.instagram in components/consent/EmbedConsentPlaceholder.tsx.
const TEXT = {
  title: 'Instagram-Inhalte laden',
  description:
    'Durch Klicken auf "Instagram-Inhalte laden" werden Inhalte von Instagram eingebettet. Dabei werden Daten an Meta Platforms Ireland Ltd. (und ggf. Meta Platforms Inc. in den USA) übermittelt.',
  warning:
    'Die USA gelten nach EU-Recht als Land mit unzureichendem Datenschutzniveau. Meta verarbeitet Ihre Daten gemäß der Instagram-Datenschutzrichtlinie.',
  rememberLabel: 'Meine Auswahl für diesen Browser merken',
  loadButton: 'Instagram-Inhalte laden',
  privacyLink: 'Mehr erfahren',
  privacyUrl: 'https://help.instagram.com/519522125107875',
} as const;

export function InstagramConsent({
  username,
  loaded,
  onConsent,
}: {
  username: string;
  loaded: boolean;
  onConsent?: (remember: boolean) => void;
}) {
  const src = `https://www.instagram.com/${username}/embed`;
  const title = `Instagram-Profil von @${username}`;
  const handleLoad = onConsent
    ? (event: MouseEvent<HTMLButtonElement>) => {
        const block = event.currentTarget.closest('[data-site-consent]');
        const remember = block?.querySelector<HTMLInputElement>('[data-consent-remember]');
        onConsent(remember?.checked ?? false);
      }
    : null;

  return (
    <div data-site-consent="instagram" data-embed-src={src} data-embed-title={title}>
      {loaded ? (
        <iframe
          src={src}
          title={title}
          loading="lazy"
          allow="encrypted-media"
          className="site:block site:min-h-[28rem] site:w-full site:rounded-card site:border-0 site:bg-ground"
        />
      ) : (
        <div
          data-consent-prompt=""
          data-ground="paper"
          className="site:flex site:max-w-[40rem] site:flex-col site:items-start site:gap-4 site:rounded-card site:border site:border-ink/15 site:p-6 site:sm:p-10"
        >
          <FaInstagram aria-hidden className="site:size-8 site:text-heading" />
          <h3 className="site:text-h3 site:text-heading">{TEXT.title}</h3>
          <p className="site:max-w-prose">{TEXT.description}</p>
          <p className="site:max-w-prose site:text-small">{TEXT.warning}</p>
          <label className="site:flex site:min-h-11 site:cursor-pointer site:items-center site:gap-3">
            <input
              type="checkbox"
              data-consent-remember=""
              className="site:size-6 site:shrink-0 site:cursor-pointer site:accent-action"
            />
            <span>{TEXT.rememberLabel}</span>
          </label>
          <div className="site:flex site:flex-wrap site:items-center site:gap-x-6 site:gap-y-2">
            <button
              type="button"
              data-consent-load=""
              {...(handleLoad ? { onClick: handleLoad } : {})}
              className="site:inline-flex site:min-h-11 site:cursor-pointer site:items-center site:gap-2 site:rounded-pill site:bg-action site:px-6 site:font-[700] site:text-action-ink"
            >
              <FaInstagram aria-hidden className="site:size-5" />
              {TEXT.loadButton}
            </button>
            <a
              href={TEXT.privacyUrl}
              rel="noopener noreferrer"
              className="site:inline-flex site:min-h-11 site:items-center site:text-link site:underline site:underline-offset-4"
            >
              {TEXT.privacyLink}
            </a>
          </div>
        </div>
      )}
      <div data-consent-target="" />
      <p className="site:mt-4">
        <a
          href={`https://www.instagram.com/${username}/`}
          className="site:inline-flex site:min-h-11 site:items-center site:text-link site:underline site:underline-offset-4 site:wrap-anywhere"
        >
          {`Profil @${username} auf Instagram öffnen`}
        </a>
      </p>
    </div>
  );
}
