import PageContainer from '../../../components/common/PageContainer';
import { getToolGradient } from '../../../config/toolTheme';

const FreistellenPage = () => (
  <PageContainer
    maxWidth="lg"
    title="Hintergrund entfernen"
    subtitle="Person oder Motiv in Sekunden freistellen"
    bgClassName={getToolGradient('freisteller')}
  >
    {null}
  </PageContainer>
);

export default FreistellenPage;
