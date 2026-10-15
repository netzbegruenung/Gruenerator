import React, { memo, useState } from 'react';
// import { HiOutlineSparkles } from 'react-icons/hi2';
// import { useNavigate } from 'react-router-dom';

import ChatInner from './ChatInner';
import SharepicAnnouncementDialog from './SharepicAnnouncementDialog';

const CreatorSection: React.FC = memo(() => {
  // const navigate = useNavigate();
  const [sharepicNewsOpen, setSharepicNewsOpen] = useState(false);

  return (
    <div className="w-full flex flex-col gap-sm">
      <ChatInner />

      <div className="flex flex-wrap items-center justify-center gap-2 text-center">
        {/* Abgelöst durch den Sharepic-Knopf daneben.
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
        */}
        <button
          type="button"
          onClick={() => setSharepicNewsOpen(true)}
          className="mt-1 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-1.5 text-[13.5px] font-semibold text-grey-900 shadow-sm transition-colors hover:bg-grey-50"
        >
          <span className="text-primary-700">Neu:</span>
          Entdecke die Sharepics
        </button>
      </div>

      <SharepicAnnouncementDialog open={sharepicNewsOpen} onOpenChange={setSharepicNewsOpen} />
    </div>
  );
});

CreatorSection.displayName = 'CreatorSection';

export default CreatorSection;
