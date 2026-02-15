import { useNavigate } from 'react-router-dom';

import IndexCard from '../../components/common/IndexCard';
import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import ErrorBoundary from '../../components/ErrorBoundary';
import '../../assets/styles/components/gallery-layout.css';

interface ToolEntry {
  id: string;
  title: string;
  description: string;
  path: string;
  tags?: string[];
}

const tools: ToolEntry[] = [
  {
    id: 'suche',
    title: 'Suche',
    description: 'Webrecherche für aktuelle Informationen mit KI-Unterstützung.',
    path: '/suche',
    tags: ['Web', 'Recherche'],
  },
  {
    id: 'notebooks',
    title: 'Notebooks',
    description: 'Durchsuche grüne Dokumente und Programme mit KI-gestützten Fragen.',
    path: '/notebooks',
    tags: ['Dokumente', 'Q&A'],
  },
  {
    id: 'research',
    title: 'Research',
    description: 'Manuelle Suche über alle gescrapten Dokumente und Programme.',
    path: '/research',
    tags: ['Dokumente', 'Qdrant'],
  },
  ...(import.meta.env.DEV
    ? [
        {
          id: 'datenbank',
          title: 'Datenbank',
          description: 'Durchsuche Vorlagen, Prompts und Anträge für deine grüne Arbeit.',
          path: '/datenbank',
          tags: ['Vorlagen', 'Prompts', 'Anträge'],
        },
        {
          id: 'scanner',
          title: 'Scanner',
          description: 'Text aus Dokumenten extrahieren mit OCR-Erkennung.',
          path: '/scanner',
          tags: ['OCR', 'Dokumente'],
        },
      ]
    : []),
];

const ToolsPage = () => {
  const navigate = useNavigate();

  return (
    <ErrorBoundary>
      <div className="gallery-layout">
        <div className="gallery-header">
          <h1>Tools</h1>
          <p>Werkzeuge für Recherche, Wissensmanagement und mehr.</p>
        </div>

        <div className="gallery-grid">
          {tools.map((tool) => (
            <IndexCard
              key={tool.id}
              title={tool.title}
              description={tool.description}
              tags={tool.tags}
              onClick={() => navigate(tool.path)}
            />
          ))}
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default withAuthRequired(ToolsPage, {
  title: 'Tools',
});
