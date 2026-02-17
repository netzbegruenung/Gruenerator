import { memo } from 'react';

import GalleryContainer from '../../components/common/Gallery/GalleryContainer';

const AgentsGalleryPage = memo(() => (
  <GalleryContainer initialContentType="agents" availableContentTypes={['agents']} />
));

AgentsGalleryPage.displayName = 'AgentsGalleryPage';

export default AgentsGalleryPage;
