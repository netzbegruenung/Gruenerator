import ErrorBoundary from '../../components/ErrorBoundary';
import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../components/common/PageContainer';
import ToolGrid from '../../components/common/ToolGrid';
import { getIcon } from '../../config/icons';

import type { ToolEntry } from '../../components/common/ToolGrid';

const tools: ToolEntry[] = [
  {
    id: 'suche',
    title: 'Suche',
    description: 'Webrecherche für aktuelle Informationen mit KI-Unterstützung.',
    path: '/suche',
    icon: getIcon('navigation', 'suche'),
    tags: ['Web', 'Recherche'],
  },
  {
    id: 'notebooks',
    title: 'Notebooks',
    description: 'Durchsuche grüne Dokumente und Programme mit KI-gestützten Fragen.',
    path: '/notebooks',
    icon: getIcon('navigation', 'notebooks'),
    tags: ['Dokumente', 'Q&A'],
  },
  {
    id: 'research',
    title: 'Recherche',
    description: 'Manuelle Suche über alle gescrapten Dokumente und Programme.',
    path: '/research',
    icon: getIcon('navigation', 'research'),
    tags: ['Dokumente', 'Qdrant'],
  },
  {
    id: 'boards',
    title: 'Boards',
    description: 'Kanban-Boards zur kollaborativen Aufgabenplanung im Team.',
    path: '/boards',
    icon: getIcon('navigation', 'boards'),
    tags: ['Kanban', 'Planung'],
  },
  ...(import.meta.env.DEV
    ? [
        {
          id: 'datenbank',
          title: 'Datenbank',
          description: 'Durchsuche Vorlagen, Prompts und Anträge für deine grüne Arbeit.',
          path: '/datenbank',
          icon: getIcon('navigation', 'datenbank'),
          tags: ['Vorlagen', 'Prompts', 'Anträge'],
        },
        {
          id: 'scanner',
          title: 'Scanner',
          description: 'Text aus Dokumenten extrahieren mit OCR-Erkennung.',
          path: '/scanner',
          icon: getIcon('navigation', 'scanner'),
          tags: ['OCR', 'Dokumente'],
        },
        {
          id: 'transkription',
          title: 'Transkription',
          description: 'Audio- und Meeting-Aufnahmen automatisch transkribieren.',
          path: '/transkription',
          icon: getIcon('navigation', 'transkription'),
          tags: ['Audio', 'Meetings'],
        },
      ]
    : []),
];

const ToolsPage = () => (
  <ErrorBoundary>
    <PageContainer title="Tools" subtitle="Werkzeuge für Recherche, Wissensmanagement und mehr.">
      <ToolGrid tools={tools} columns={3} />
    </PageContainer>
  </ErrorBoundary>
);

export default withAuthRequired(ToolsPage, {
  title: 'Tools',
});
