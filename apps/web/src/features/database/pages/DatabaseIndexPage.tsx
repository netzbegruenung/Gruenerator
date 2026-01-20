import { useNavigate } from 'react-router-dom';
import IndexCard from '../../../components/common/IndexCard';
import { getOrderedSections } from '../config/databaseConfig';
import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import ErrorBoundary from '../../../components/ErrorBoundary';
import '../../../assets/styles/components/gallery-layout.css';
import '../../../assets/styles/components/gallery-content-type.css';

const DatabaseIndexPage = () => {
  const navigate = useNavigate();
  const sections = getOrderedSections();

  return (
    <ErrorBoundary>
      <div className="gallery-layout">
        <div className="gallery-header">
          <h1>Datenbank</h1>
          <p>
            Durchsuche Vorlagen, Prompts und Anträge für deine grüne Arbeit.
          </p>
        </div>

        <div className="gallery-grid">
          {sections.map((section) => (
            <IndexCard
              key={section.id}
              title={section.title}
              description={section.description}
              meta={section.meta}
              tags={section.tags}
              onClick={() => navigate(section.path)}
              variant={section.id === 'vorlagen' ? 'elevated' : 'default'}
            />
          ))}
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default withAuthRequired(DatabaseIndexPage, {
  title: 'Datenbank'
});
