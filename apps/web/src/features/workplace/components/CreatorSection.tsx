import React, { Suspense, lazy, memo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { isTourDone } from '../../tours/tourState';

import ChatInner from './ChatInner';

// Chat is the default and must paint instantly, so it stays eager. The Bilder
// mode is lazy — its heavy deps (image-studio) stay out of the initial chunk
// until the user switches via the toggle link.
const BilderInner = lazy(() => import('./BilderInner'));

const CreatorSection: React.FC = memo(() => {
  const [isChat, setIsChat] = useState(true);
  const navigate = useNavigate();

  return (
    <div className="w-full flex flex-col gap-sm">
      {isChat ? (
        <ChatInner />
      ) : (
        <Suspense
          fallback={
            <div className="flex justify-center py-xl">
              <div className="loading-spinner" />
            </div>
          }
        >
          <BilderInner />
        </Suspense>
      )}

      <div className="flex flex-col items-center gap-1 text-center">
        <button
          type="button"
          onClick={() => setIsChat((prev) => !prev)}
          className="text-[13.5px] font-semibold text-primary-600 transition-colors hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
        >
          {isChat ? 'Oder editiere / erstelle ein Bild' : 'Oder schreibe eine Nachricht'}
        </button>
        <button
          type="button"
          onClick={() =>
            void import('../../tours/workplaceTour').then((m) =>
              m.startWorkplaceTour((path) => void navigate(path))
            )
          }
          className="text-[13.5px] font-semibold text-primary-600 transition-colors hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
        >
          {isTourDone('workplace') ? 'Tour erneut starten' : 'Tour starten'}
        </button>
      </div>
    </div>
  );
});

CreatorSection.displayName = 'CreatorSection';

export default CreatorSection;
