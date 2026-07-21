import React, { memo } from 'react';
import { HiOutlineSparkles } from 'react-icons/hi2';
import { useNavigate } from 'react-router-dom';

import ChatInner from './ChatInner';

const CreatorSection: React.FC = memo(() => {
  const navigate = useNavigate();

  return (
    <div className="w-full flex flex-col gap-sm">
      <ChatInner />

      <div className="flex flex-col items-center gap-1 text-center">
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
