import { useParams, Navigate } from 'react-router-dom';

// Custom generators were converted to `cg-<slug>` agents; send legacy
// /generator/:slug links straight to the agent's chat.
const LegacyGeneratorRedirect = () => {
  const { slug } = useParams();
  return <Navigate to={`/agents/cg-${slug}`} replace />;
};

export default LegacyGeneratorRedirect;
