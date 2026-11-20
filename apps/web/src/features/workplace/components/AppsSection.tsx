import { Button, cn } from '@gruenerator/ui';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { DASH_CARD } from '../../../components/dashboard/dashboardStyles';
import { getVisitorDevice, isDesktopApp } from '../../../utils/platform';
import {
  PLAY_STORE_URL,
  STORE_URLS,
  TESTFLIGHT_URL,
  appDownloadUrl,
  type DeviceId,
} from '../../apps/storeLinks';

import { SECTION_LINK } from './arbeitenGrid';
import { ArbeitenSection } from './ArbeitenSections';

// Per-viewer convenience: someone who hid the card doesn't see it again in this browser.
const HIDDEN_KEY = 'gruenerator:arbeiten-apps-hidden';

const readHidden = (): boolean => {
  try {
    return localStorage.getItem(HIDDEN_KEY) === '1';
  } catch {
    return false;
  }
};

const STORE_CTA: Record<DeviceId, string> = {
  android: 'Bei Google Play laden',
  ios: 'Beta über TestFlight laden',
};

// The Briefing's neutral card: white, hairline border, soft shadow (dashboardTokens.css).
const CARD = cn('rounded-2xl md:rounded-[20px]', DASH_CARD);

const PHONE =
  'shrink-0 aspect-[1320/2868] rounded-[22px] bg-[#111] p-1 shadow-[0_18px_34px_-14px_rgba(0,0,0,0.35)] ' +
  'transition-transform duration-300 ease-out hover:-translate-y-2 motion-reduce:transition-none';

// Real store screenshots (iPhone); the middle one sits a little higher.
const SCREENS = ['app-chat', 'app-arbeiten', 'app-notebook'] as const;

/** Three phones side by side; each lifts on its own when hovered. */
function Phones({ className, phoneWidth }: { className: string; phoneWidth: string }) {
  return (
    <div aria-hidden className={cn('flex items-start', className)}>
      {SCREENS.map((name, i) => (
        <div key={name} className={cn(PHONE, phoneWidth, i !== 1 && 'mt-6')}>
          <img
            src={`/arbeiten-previews/${name}.jpg`}
            alt=""
            loading="lazy"
            className="size-full rounded-[18px] object-cover"
          />
        </div>
      ))}
    </div>
  );
}

/**
 * „Apps" on the Arbeiten tab: invites to the mobile app. A phone gets one button to its
 * store; a computer gets a QR code to scan (pointing at the public /app redirect) plus
 * the two store links. Hidden in the desktop app and once dismissed.
 */
export function AppsSection() {
  const [hidden, setHidden] = useState(readHidden);
  if (hidden || isDesktopApp()) return null;

  const device = getVisitorDevice();

  const hide = () => {
    try {
      localStorage.setItem(HIDDEN_KEY, '1');
    } catch {
      // Storage blocked: hide for this visit only.
    }
    setHidden(true);
  };

  return (
    <ArbeitenSection
      title="Apps"
      action={
        <span className="flex items-center gap-4">
          <Link to="/apps" className={SECTION_LINK}>
            Alle Apps
          </Link>
          <button
            type="button"
            onClick={hide}
            className="touch-target cursor-pointer border-0 bg-transparent p-0 text-sm text-muted-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
          >
            Ausblenden
          </button>
        </span>
      }
    >
      <div className="dashboard-surface dashboard-neutral">
        {device ? (
          <div className={cn('relative h-[460px] overflow-hidden px-5 pt-6', CARD)}>
            <h3 className="m-0 mb-4 text-[22px] font-bold leading-tight text-foreground-heading">
              Der Grünerator als App
            </h3>
            <Button asChild variant="brand" size="lg" className="w-full">
              <a href={STORE_URLS[device]} target="_blank" rel="noopener noreferrer">
                {STORE_CTA[device]}
              </a>
            </Button>
            <Phones className="mt-6 justify-center gap-3" phoneWidth="w-[96px]" />
          </div>
        ) : (
          <div
            className={cn(
              'relative flex flex-col gap-6 overflow-hidden p-6 sm:flex-row sm:items-center lg:px-10 xl:h-[330px] xl:gap-10 xl:py-0',
              CARD
            )}
          >
            <div className="relative z-10 max-w-md xl:w-60 xl:shrink-0">
              <h3 className="m-0 text-2xl font-bold leading-tight text-foreground-heading md:text-[28px]">
                Der Grünerator als App
              </h3>
              <p className="m-0 mt-1.5 text-base text-(--dash-mg-sub)">Für iPhone und Android.</p>
            </div>
            <Phones
              className="hidden flex-1 justify-center gap-5 self-stretch pt-12 xl:flex"
              phoneWidth="w-[144px]"
            />
            <div className="relative z-10 shrink-0 text-center sm:ml-auto xl:ml-0">
              {/* The QR stays black on white in dark mode too: scanners need the contrast. */}
              <span className="inline-block rounded-2xl bg-white p-2.5 shadow-sm">
                <QRCodeSVG
                  value={appDownloadUrl()}
                  size={132}
                  fgColor="#1F4F35"
                  title="QR-Code: Grünerator-App herunterladen"
                />
              </span>
              <p className="m-0 mt-2 text-[13px] font-bold text-foreground-heading">
                Mit dem Handy scannen
              </p>
              <p className="m-0 mt-1 text-[12.5px] text-(--dash-mg-sub)">
                <a
                  href={PLAY_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-inherit underline"
                >
                  Google Play
                </a>
                {' · '}
                <a
                  href={TESTFLIGHT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-inherit underline"
                >
                  iPhone-Beta
                </a>
              </p>
            </div>
          </div>
        )}
      </div>
    </ArbeitenSection>
  );
}
