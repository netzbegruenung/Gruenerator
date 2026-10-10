import PageContainer from '../../../components/common/PageContainer';
import { getToolGradient } from '../../../config/toolTheme';

const BildErweiternPage = () => (
  <PageContainer
    maxWidth="lg"
    title="Bild erweitern"
    subtitle="KI ergänzt dein Bild auf ein neues Format"
    bgClassName={getToolGradient('bild-erweitern')}
  >
    {null}
  </PageContainer>
);

export default BildErweiternPage;
