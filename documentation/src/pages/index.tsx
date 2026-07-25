import type { ReactNode } from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import styles from './index.module.css';

type CategoryCard = {
  title: string;
  icon: string;
  description: string;
  link: string;
  topPages: {
    title: string;
    link: string;
  }[];
};

const categories: CategoryCard[] = [
  {
    title: 'Über den Grünerator',
    icon: '🎯',
    description: 'Was der Grünerator ist, welche Werkzeuge es gibt und worauf er aufbaut.',
    link: '/docs/ueber-den-gruenerator/intro',
    topPages: [
      { title: 'Einführung', link: '/docs/ueber-den-gruenerator/intro' },
      { title: 'Alle Werkzeuge', link: '/docs/ueber-den-gruenerator/tools' },
      { title: 'Deine Daten im Grünerator', link: '/docs/ueber-den-gruenerator/notebook' },
    ],
  },
  {
    title: 'Chat',
    icon: '✨',
    description:
      'Im Gespräch arbeiten: fragen, recherchieren, Dateien mitgeben, Inhalte erstellen.',
    link: '/docs/chat/was-kann-ich-fragen',
    topPages: [
      { title: 'Was kann ich fragen?', link: '/docs/chat/was-kann-ich-fragen' },
      { title: 'KI-Modelle', link: '/docs/chat/ki-modelle' },
      { title: 'Dateien hinzufügen', link: '/docs/chat/dateien-hinzufuegen' },
    ],
  },
  {
    title: 'Office',
    icon: '📄',
    description: 'Dokumente, Tabellen, Präsentationen und Boards — gemeinsam schreiben und planen.',
    link: '/docs/office/intro',
    topPages: [
      { title: 'Überblick', link: '/docs/office/intro' },
      { title: 'Tabellen', link: '/docs/office/tabellen' },
      { title: 'Boards', link: '/docs/office/boards' },
    ],
  },
  {
    title: 'Wissen',
    icon: '📚',
    description: 'Eigene Notebooks anlegen und die Inhalte der Landesverbände nutzen.',
    link: '/docs/wissen/eigenes-notebook-erstellen',
    topPages: [
      { title: 'Eigenes Notebook erstellen', link: '/docs/wissen/eigenes-notebook-erstellen' },
      { title: 'Landesverbände', link: '/docs/wissen/landesverbaende' },
    ],
  },
  {
    title: 'Grüneratoren',
    icon: '🕵️',
    description: 'Die Agentura: fertige Grüneratoren nutzen und eigene bauen.',
    link: '/docs/grueneratoren/agentura',
    topPages: [
      { title: 'Agentura', link: '/docs/grueneratoren/agentura' },
      {
        title: 'Eigene Grüneratoren erstellen',
        link: '/docs/grueneratoren/eigene-agentinnen-erstellen',
      },
    ],
  },
  {
    title: 'Konto & Projekte',
    icon: '👤',
    description: 'Projekte, Einstellungen und die Anbindung der Grünen Wolke.',
    link: '/docs/konto/projekte',
    topPages: [
      { title: 'Projekte', link: '/docs/konto/projekte' },
      { title: 'Einstellungen', link: '/docs/konto/einstellungen' },
      { title: 'Grüne Wolke', link: '/docs/konto/gruene-wolke' },
    ],
  },
  {
    title: 'Integrationen',
    icon: '🔌',
    description: 'Den Grünerator mit anderen Diensten verbinden — in beide Richtungen.',
    link: '/docs/integrationen/konnektoren',
    topPages: [
      { title: 'Konnektoren', link: '/docs/integrationen/konnektoren' },
      { title: 'KI-Chat einrichten', link: '/docs/integrationen/ki-chat-einrichten' },
      { title: 'Was kann der MCP-Server?', link: '/docs/integrationen/mcp-was-kann-ich-fragen' },
    ],
  },
  {
    title: 'Grundlagen',
    icon: '🧠',
    description:
      'Wie KI-Sprachmodelle funktionieren, wo ihre Grenzen liegen, wie man kennzeichnet.',
    link: '/docs/grundlagen/wie-llms-funktionieren',
    topPages: [
      { title: 'Wie LLMs funktionieren', link: '/docs/grundlagen/wie-llms-funktionieren' },
      { title: 'Risiken & Gefahren', link: '/docs/grundlagen/risiken-und-gefahren-von-llms' },
      { title: 'Kennzeichnungs-Guide', link: '/docs/grundlagen/Kennzeichnungs-Guide' },
    ],
  },
];

function CategoryCard({ category }: { category: CategoryCard }): ReactNode {
  return (
    <div className={styles.categoryCard}>
      <Link to={category.link} className={styles.categoryCardLink}>
        <div className={styles.categoryHeader}>
          <span className={styles.categoryIcon}>{category.icon}</span>
          <h3 className={styles.categoryTitle}>{category.title}</h3>
        </div>
        <p className={styles.categoryDescription}>{category.description}</p>
      </Link>

      <div className={styles.topPages}>
        {category.topPages.map((page, idx) => (
          <Link key={idx} to={page.link} className={styles.topPageLink}>
            <svg className={styles.linkIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            {page.title}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();

  return (
    <Layout
      title={`${siteConfig.title}`}
      description="Dokumentation für den Grünerator - die grüne KI für Bündnis 90/Die Grünen"
    >
      {/* Hero Section */}
      <header className={styles.hero}>
        <div className="container">
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>
              <span className={styles.titleGreen}>Grünerator</span> Dokumentation
            </h1>
            <p className={styles.heroSubtitle}>Alles, was du über die grüne KI wissen musst</p>
            <div className={styles.heroButtons}>
              <Link className={styles.primaryButton} to="/docs/ueber-den-gruenerator/intro">
                Erste Schritte
              </Link>
              <Link
                className={styles.secondaryButton}
                href="https://gruenerator.eu"
                target="_blank"
                rel="noopener noreferrer"
              >
                Zum Grünerator →
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Category Explorer Section */}
      <main className={styles.main}>
        <div className="container">
          <div className={styles.categoriesIntro}>
            <h2 className={styles.sectionTitle}>Entdecke die Dokumentation</h2>
            <p className={styles.sectionSubtitle}>Wähle eine Kategorie, um mehr zu erfahren</p>
          </div>

          <div className={styles.categoriesGrid}>
            {categories.map((category, idx) => (
              <CategoryCard key={idx} category={category} />
            ))}
          </div>
        </div>
      </main>
    </Layout>
  );
}
