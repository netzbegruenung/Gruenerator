import { Button, cn } from '@gruenerator/ui';
import { QRCodeSVG } from 'qrcode.react';

import { getVisitorDevice } from '../../../utils/platform';
import {
  PLAY_STORE_URL,
  STORE_URLS,
  TESTFLIGHT_URL,
  appDownloadUrl,
  type DeviceId,
} from '../../apps/storeLinks';

import { SIDE_CARD } from './sideCards';

const STORE_CTA: Record<DeviceId, string> = {
  android: 'Bei Google Play laden',
  ios: 'Beta über TestFlight laden',
};

const PHONE =
  'aspect-[1320/2868] rounded-[22px] bg-[#111] p-1 shadow-[0_18px_34px_-14px_rgba(0,0,0,0.35)] ' +
  'transition-transform duration-300 ease-out hover:-translate-y-2 motion-reduce:transition-none ' +
  // Narrow card: three equal phones that shrink with the card; wide card: fixed size.
  'min-w-0 max-w-[104px] flex-1 @2xl:w-[124px] @2xl:max-w-none @2xl:flex-none';

// Real store screenshots (iPhone); the middle one sits a little higher.
const SCREENS = ['app-chat', 'app-arbeiten', 'app-notebook'] as const;

/** Three phones side by side; each lifts on its own when hovered. */
function Phones() {
  return (
    <div
      aria-hidden
      className="flex items-start justify-center gap-3 @2xl:flex-1 @2xl:items-center @2xl:gap-4"
    >
      {SCREENS.map((name, i) => (
        <div key={name} className={cn(PHONE, i !== 1 && 'mt-5 @2xl:mt-6')}>
          <img
            src={`/arbeiten-previews/${name}.webp`}
            alt=""
            loading="lazy"
            className="size-full rounded-[18px] object-cover"
          />
        </div>
      ))}
    </div>
  );
}

const STORE_LINK = { target: '_blank', rel: 'noopener noreferrer' } as const;

/**
 * Invites to the mobile app. A phone gets one button to its store; a computer gets a QR
 * code (pointing at the public /app redirect) plus the two store links, or two store
 * buttons when the card is too narrow for the QR. The phones show at every width.
 */
export function AppsCard() {
  const device = getVisitorDevice();

  return (
    // Laid out by the card's own width, not the window's: beside the newsletter it gets
    // two thirds of the row, alone the whole row.
    <div className="@container h-full">
      <div
        className={cn(
          'flex h-full flex-col gap-6 overflow-hidden p-6 @2xl:flex-row @2xl:items-center @2xl:gap-10 @2xl:p-10',
          SIDE_CARD
        )}
      >
        {/* Heading at the top, QR at the bottom: the same rhythm as the newsletter card beside it. */}
        <div className="@2xl:flex @2xl:w-56 @2xl:shrink-0 @2xl:flex-col @2xl:justify-between @2xl:self-stretch">
          <div>
            <h3 className="m-0 text-2xl font-bold leading-tight text-foreground-heading md:text-[28px]">
              Der Grünerator als App
            </h3>
            <p className="m-0 mt-1.5 text-base text-(--dash-mg-sub)">Für iPhone und Android.</p>
          </div>
          {device ? (
            <Button asChild variant="brand" size="lg" className="mt-5 w-full @2xl:w-auto">
              <a href={STORE_URLS[device]} {...STORE_LINK}>
                {STORE_CTA[device]}
              </a>
            </Button>
          ) : (
            <>
              {/* Narrow card (no device detected): store buttons instead of a QR code
                  nobody can scan with the phone it is shown on. */}
              <div className="mt-5 flex flex-wrap gap-2 @2xl:hidden">
                <Button asChild variant="brand" size="lg">
                  <a href={PLAY_STORE_URL} {...STORE_LINK}>
                    Google Play
                  </a>
                </Button>
                <Button asChild variant="brand-outline" size="lg">
                  <a href={TESTFLIGHT_URL} {...STORE_LINK}>
                    iPhone (Beta)
                  </a>
                </Button>
              </div>
              <div className="mt-6 hidden @2xl:block">
                {/* The QR stays black on white in dark mode too: scanners need the contrast. */}
                <span className="inline-block rounded-2xl bg-white p-2 shadow-sm">
                  <QRCodeSVG
                    value={appDownloadUrl()}
                    size={112}
                    fgColor="#1F4F35"
                    title="QR-Code: Grünerator-App herunterladen"
                  />
                </span>
                <p className="m-0 mt-2 text-[12.5px] text-(--dash-mg-sub)">
                  <a href={PLAY_STORE_URL} {...STORE_LINK} className="text-inherit underline">
                    Google Play
                  </a>
                  {' · '}
                  <a href={TESTFLIGHT_URL} {...STORE_LINK} className="text-inherit underline">
                    iPhone-Beta
                  </a>
                </p>
              </div>
            </>
          )}
        </div>
        <Phones />
      </div>
    </div>
  );
}
