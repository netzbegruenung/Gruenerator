import { useNavigate } from 'react-router-dom';
import IndexCard from '../../../components/common/IndexCard';
import { getOrderedNotebooks } from '../config/notebooksConfig';
import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import ErrorBoundary from '../../../components/ErrorBoundary';
import '../../../assets/styles/components/gallery-layout.css';
import '../../../assets/styles/components/gallery-content-type.css';

const NotebooksGalleryPage = () => {
  const navigate = useNavigate();
  const notebooks = getOrderedNotebooks();

  return (
    <ErrorBoundary>
      <div className="gallery-layout">
        <div className="gallery-header">
          <h1>Notebooks</h1>
          <p>
            Durchsuche grüne Dokumente und Programme mit KI-gestützten Fragen.
            Wähle ein Notebook und stelle deine Fragen zu grüner Politik.
          </p>
        </div>

        <div className="gallery-grid">
          {notebooks.map((notebook) => (
            <IndexCard
              key={notebook.id}
              title={notebook.title}
              description={notebook.description}
              meta={notebook.meta}
              tags={notebook.tags}
              onClick={() => navigate(notebook.path)}
              variant={notebook.id === 'gruenerator-notebook' ? 'elevated' : 'default'}
            />
          ))}
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default withAuthRequired(NotebooksGalleryPage, {
  title: 'Notebooks'
});
