import React, { memo } from 'react';
import { useNavigate } from 'react-router-dom';

import ChatInner from './ChatInner';

const CreatorSection: React.FC = memo(() => {
  const navigate = useNavigate();

  // Chat and Workplace moved from the tabs at the top into the sidebar: the
  // tour shows where (its "Zwei Bereiche" step points at the sidebar).
  const startTour = () =>
    void import('../../tours/workplaceTour').then((m) =>
      m.startWorkplaceTour((path) => void navigate(path))
    );

  return (
    <div className="w-full flex flex-col gap-sm">
      <ChatInner />

      <div className="flex flex-wrap items-center justify-center gap-2 text-center">
        <button
          type="button"
          onClick={startTour}
          className="mt-1 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-1.5 text-[13.5px] font-semibold text-grey-900 shadow-sm transition-colors hover:bg-grey-50"
        >
          <span className="text-primary-700">Neu:</span>
          Der Workplace ist umgezogen – kurze Tour
        </button>
      </div>
    </div>
  );
});

CreatorSection.displayName = 'CreatorSection';

export default CreatorSection;
