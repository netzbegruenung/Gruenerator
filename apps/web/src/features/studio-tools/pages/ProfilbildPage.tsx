import PageContainer from '../../../components/common/PageContainer';
import { getToolGradient } from '../../../config/toolTheme';

const ProfilbildPage = () => (
  <PageContainer
    maxWidth="lg"
    title="Profilbild"
    subtitle="Freistellen und Hintergrund per Klick wechseln"
    bgClassName={getToolGradient('profilbild')}
  >
    {null}
  </PageContainer>
);

export default ProfilbildPage;
