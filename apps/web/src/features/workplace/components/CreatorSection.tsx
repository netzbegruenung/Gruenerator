import React, { Suspense, lazy, memo, useState } from 'react';
import { HiOutlineSparkles } from 'react-icons/hi2';
import { useNavigate } from 'react-router-dom';

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
          className="mt-1 inline-flex items-center gap-2 rounded-full border border-primary-300 bg-primary-50 px-4 py-1.5 text-[13.5px] font-semibold text-primary-700 transition-colors hover:border-primary-400 hover:bg-primary-100 dark:border-primary-700 dark:bg-primary-900/30 dark:text-primary-200 dark:hover:bg-primary-900/50"
        >
          <HiOutlineSparkles className="size-4" />
          Entdecke den neuen Grünerator
        </button>
      </div>
    </div>
  );
});

CreatorSection.displayName = 'CreatorSection';

export default CreatorSection;
