import React, { Suspense, lazy, memo, useState } from 'react';

import ModePillRow from '../creator/components/ModePillRow';
import { DEFAULT_MODE } from '../creator/modes';

import ChatInner from './ChatInner';

// Chat is the default tab (DEFAULT_MODE) and must paint instantly, so it stays
// eager. The Bilder tab is lazy — its heavy deps (image-studio) stay out of the
// initial chunk until the user switches tabs.
const BilderInner = lazy(() => import('./BilderInner'));

const CreatorSection: React.FC = memo(() => {
  const [mode, setMode] = useState(DEFAULT_MODE);
  const isChat = mode === 'chat';

  return (
    <div className="w-full flex flex-col gap-md">
      <div className="flex justify-center">
        <ModePillRow mode={mode} onModeChange={setMode} />
      </div>

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
          <BilderInner key={mode} />
        </Suspense>
      )}
    </div>
  );
});

CreatorSection.displayName = 'CreatorSection';

export default CreatorSection;
