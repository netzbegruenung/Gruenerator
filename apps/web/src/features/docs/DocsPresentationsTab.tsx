import { PresentationList, SlidesProvider } from '@gruenerator/slides';

import { webAppSlidesAdapter } from './slidesAdapter';

interface DocsPresentationsTabProps {
  searchQuery: string;
  onPresentationClick: (id: string) => void;
}

export function DocsPresentationsTab({
  searchQuery,
  onPresentationClick,
}: DocsPresentationsTabProps) {
  return (
    <SlidesProvider adapter={webAppSlidesAdapter}>
      <PresentationList searchQuery={searchQuery} onPresentationClick={onPresentationClick} />
    </SlidesProvider>
  );
}
