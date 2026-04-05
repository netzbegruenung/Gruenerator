import { useShareLinks } from '@gruenerator/wolke';
import { motion } from 'motion/react';
import { memo, useCallback, useState } from 'react';
import { FaWordpress } from 'react-icons/fa6';
import { FiCloud } from 'react-icons/fi';

import AutoBackupSection from '../../../../../wolke/components/AutoBackupSection';
import CloudButton from '../../../../../wolke/components/CloudButton';
import CloudCard from '../../../../../wolke/components/CloudCard';
import WolkeAddForm from '../../../../../wolke/components/WolkeAddForm';
import WolkeConnectionCard from '../../../../../wolke/components/WolkeConnectionCard';
import WolkeSetupWizard from '../../../../../wolke/components/WolkeSetupWizard';
import WordPressSetupModal from '../../../../../wordpress/components/WordPressSetupModal';
import {
  useWordPressSites,
  useDeleteWordPressSite,
} from '../../../../../wordpress/hooks/useWordPress';

import { cn } from '@/utils/cn';
import './clouds.css';

interface WolkeManagementViewProps {
  onSuccessMessage: (message: string) => void;
  onErrorMessage: (message: string) => void;
}

const MOTION_CONFIG = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.3 },
} as const;

const CLOUD_A =
  'M 6,18 C 6,14 10,11 14,11 C 14,6 20,3 25,6 C 28,2 34,2 37,6 C 42,6 46,10 46,14 C 49,14 52,18 50,22 L 0,22 C -2,18 2,14 6,14 C 6,14 6,14 6,18 Z';
const CLOUD_B =
  'M 8,20 C 8,15 14,12 18,12 C 20,6 28,4 34,8 C 38,3 46,5 48,10 C 54,10 58,15 56,20 L 56,22 L 2,22 L 2,20 C 0,16 4,13 8,14 C 8,14 8,16 8,20 Z';
const CLOUD_C =
  'M 4,16 C 4,12 8,9 12,10 C 14,5 22,3 28,7 C 30,4 36,3 40,7 C 44,6 48,10 46,14 C 50,15 52,19 48,22 L 0,22 C -2,18 2,14 4,14 C 4,14 4,14 4,16 Z';

const CLOUDS = [CLOUD_A, CLOUD_B, CLOUD_C];

const nudgeCloud = (e: React.MouseEvent<SVGGElement>) => {
  const g = e.currentTarget;
  g.classList.remove('cloud-nudged');
  void g.getBoundingClientRect();
  g.classList.add('cloud-nudged');
  g.addEventListener('animationend', () => g.classList.remove('cloud-nudged'), { once: true });
};

const TopClouds = memo(() => (
  <div className="pointer-events-none absolute inset-x-0 -top-8 z-10 h-28 overflow-visible">
    <svg
      viewBox="0 0 1000 100"
      className="w-full h-full"
      style={{ pointerEvents: 'auto' }}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <g className="fill-grey-200/40 dark:fill-grey-700/20">
        <g transform="translate(50, 40) scale(1.6)">
          <g className="cloud-drift-1" onClick={nudgeCloud}>
            <path d={CLOUDS[0]} />
          </g>
        </g>
        <g transform="translate(350, 10) scale(2.0)">
          <g className="cloud-drift-2" onClick={nudgeCloud}>
            <path d={CLOUDS[1]} />
          </g>
        </g>
        <g transform="translate(680, 50) scale(1.3)">
          <g className="cloud-drift-3" onClick={nudgeCloud}>
            <path d={CLOUDS[2]} />
          </g>
        </g>
        <g transform="translate(900, 25) scale(1.7)">
          <g className="cloud-drift-4" onClick={nudgeCloud}>
            <path d={CLOUDS[0]} />
          </g>
        </g>
      </g>
    </svg>
  </div>
));
TopClouds.displayName = 'TopClouds';

const BottomClouds = memo(() => (
  <div className="pointer-events-none absolute inset-x-0 -bottom-10 z-10 h-28 overflow-visible">
    <svg
      viewBox="0 0 1000 100"
      className="w-full h-full"
      style={{ pointerEvents: 'auto' }}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <g className="fill-grey-200/40 dark:fill-grey-700/20">
        <g transform="translate(120, 45) scale(1.5)">
          <g className="cloud-drift-5" onClick={nudgeCloud}>
            <path d={CLOUDS[2]} />
          </g>
        </g>
        <g transform="translate(500, 15) scale(1.9)">
          <g className="cloud-drift-6" onClick={nudgeCloud}>
            <path d={CLOUDS[0]} />
          </g>
        </g>
        <g transform="translate(820, 35) scale(1.3)">
          <g className="cloud-drift-7" onClick={nudgeCloud}>
            <path d={CLOUDS[1]} />
          </g>
        </g>
      </g>
    </svg>
  </div>
));
BottomClouds.displayName = 'BottomClouds';

const WolkeManagementView = memo(
  ({ onSuccessMessage, onErrorMessage }: WolkeManagementViewProps) => {
    const { data: shareLinks = [], isLoading } = useShareLinks();
    const [showWizard, setShowWizard] = useState(false);
    const [showManualForm, setShowManualForm] = useState(false);

    const hasLinks = !isLoading && shareLinks.length > 0;

    const handleWizardSuccess = useCallback(
      (message: string) => {
        setShowWizard(false);
        setShowManualForm(false);
        onSuccessMessage(message);
      },
      [onSuccessMessage]
    );

    return (
      <motion.div
        className="relative"
        initial={MOTION_CONFIG.initial}
        animate={MOTION_CONFIG.animate}
        transition={MOTION_CONFIG.transition}
      >
        {!showWizard && <TopClouds />}
        {!showWizard && <BottomClouds />}
        <CloudCard>
          <div className={cn('flex flex-col p-xl', showWizard ? 'gap-md md:gap-xl' : 'gap-xl')}>
            {!showWizard && (
              <div className="flex items-center gap-sm">
                <FiCloud className="w-6 h-6 text-primary-500 dark:text-primary-400" />
                <h2 className="text-xl font-semibold text-foreground-heading m-0">Wolke</h2>
              </div>
            )}

            {(hasLinks || showManualForm) && (
              <WolkeAddForm onSuccess={onSuccessMessage} onError={onErrorMessage} />
            )}

            {isLoading && (
              <p className="text-sm text-grey-400 text-center py-sm">Lade Verbindungen...</p>
            )}

            {hasLinks && (
              <>
                <hr className="border-grey-200 dark:border-grey-700" />
                <div className="flex flex-col gap-sm">
                  <h3 className="text-sm font-medium text-grey-600 dark:text-grey-300 uppercase tracking-wide">
                    Verbindungen ({shareLinks.length})
                  </h3>
                  {shareLinks.map((link) => (
                    <WolkeConnectionCard
                      key={link.id}
                      shareLink={link}
                      onSuccess={onSuccessMessage}
                      onError={onErrorMessage}
                    />
                  ))}
                </div>
              </>
            )}

            {!isLoading && shareLinks.length === 0 && !showManualForm && !showWizard && (
              <div className="flex flex-col items-center gap-sm py-lg">
                <CloudButton onClick={() => setShowWizard(true)} />
                <button
                  type="button"
                  onClick={() => setShowManualForm(true)}
                  className="text-xs text-grey-400 hover:text-foreground hover:underline transition-colors mt-sm"
                >
                  oder manuell einrichten
                </button>
              </div>
            )}

            {!isLoading && shareLinks.length === 0 && showWizard && (
              <WolkeSetupWizard
                onSuccess={handleWizardSuccess}
                onError={onErrorMessage}
                onCancel={() => setShowWizard(false)}
              />
            )}

            {hasLinks && (
              <>
                <hr className="border-grey-200 dark:border-grey-700" />
                <AutoBackupSection />
              </>
            )}
          </div>
        </CloudCard>
        {import.meta.env.DEV && <WordPressSection />}
      </motion.div>
    );
  }
);

const WordPressSection = memo(() => {
  const { data: sites = [], isLoading } = useWordPressSites();
  const deleteSite = useDeleteWordPressSite();
  const [showSetup, setShowSetup] = useState(false);

  return (
    <div className="mt-xl">
      <div className="flex items-center gap-sm mb-md">
        <FaWordpress className="w-6 h-6 text-foreground-heading" />
        <h2 className="text-xl font-semibold text-foreground-heading m-0">WordPress</h2>
        <span className="text-xs bg-secondary-100 text-secondary-700 px-sm py-0.5 rounded-full font-medium">
          Dev
        </span>
      </div>

      {isLoading && <p className="text-sm text-grey-400 text-center py-sm">Lade Verbindungen...</p>}

      {!isLoading && sites.length > 0 && (
        <div className="flex flex-col gap-sm mb-md">
          {sites.map((site) => (
            <div
              key={site.id}
              className="flex items-center justify-between p-md rounded-lg border border-grey-200 dark:border-grey-700 bg-background-pure"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground-heading">
                  {site.label || site.site_url.replace(/^https?:\/\//, '')}
                </span>
                <span className="text-xs text-grey-400">{site.site_url}</span>
              </div>
              <button
                type="button"
                onClick={() => deleteSite.mutate(site.id)}
                disabled={deleteSite.isPending}
                className="text-xs text-grey-400 hover:text-[var(--error-red)] transition-colors cursor-pointer bg-transparent border-none"
              >
                Entfernen
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowSetup(true)}
        className={cn(
          'px-lg py-sm rounded-lg font-medium text-sm cursor-pointer transition-all duration-200',
          'bg-none border border-grey-300 text-foreground hover:bg-grey-50 hover:border-grey-400',
          'flex items-center gap-sm'
        )}
      >
        <FaWordpress size={16} />
        WordPress-Seite verbinden
      </button>

      {showSetup && (
        <WordPressSetupModal
          onClose={() => setShowSetup(false)}
          onSuccess={() => setShowSetup(false)}
        />
      )}
    </div>
  );
});
WordPressSection.displayName = 'WordPressSection';

WolkeManagementView.displayName = 'WolkeManagementView';

export default WolkeManagementView;
