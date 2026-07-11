import PageContainer from '../../../components/common/PageContainer';
import { DocsHome } from '../../docs/DocsPage';
import StudioGallerySections from '../../image-studio/components/StudioGallerySections';

// "Arbeiten": the office start page (docs/boards/sheets/presentations) with
// the studio gallery (sharepics, KI images, reels) integrated below.
const ArbeitenTab = () => (
  <PageContainer maxWidth="lg" noPadTop className="max-md:pt-lg">
    <DocsHome />
    <div className="mt-2xl">
      <StudioGallerySections />
    </div>
  </PageContainer>
);

export default ArbeitenTab;
