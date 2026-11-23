import React, { memo } from 'react';

import ChatInner from './ChatInner';
import { NavigationNewsPill } from './NavigationNewsPill';

const CreatorSection: React.FC = memo(() => (
  <div className="w-full flex flex-col gap-sm">
    <ChatInner />

    <div className="flex flex-wrap items-center justify-center gap-2 text-center">
      <NavigationNewsPill className="mt-1" />
    </div>
  </div>
));

CreatorSection.displayName = 'CreatorSection';

export default CreatorSection;
