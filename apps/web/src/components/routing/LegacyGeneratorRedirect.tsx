import { useParams, Navigate } from 'react-router-dom';

const LegacyGeneratorRedirect = () => {
  const { slug } = useParams();
  return <Navigate to={`/gruenerator/${slug}`} replace />;
};

export default LegacyGeneratorRedirect;
