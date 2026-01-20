import { memo } from 'react';
import GalleryContainer from '../../components/common/Gallery/GalleryContainer';

const PromptsGalleryPage = memo(() => (
  <GalleryContainer
    initialContentType="prompts"
    availableContentTypes={['prompts']}
  />
));

PromptsGalleryPage.displayName = 'PromptsGalleryPage';

export default PromptsGalleryPage;
