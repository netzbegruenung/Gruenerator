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
    description:
      'Was ist der Grünerator? Lerne die grüne KI kennen und erfahre, was sie besonders macht.',
    link: '/docs/ueber-den-gruenerator/intro',
    topPages: [
      { title: 'Einführung', link: '/docs/ueber-den-gruenerator/intro' },
      { title: 'Pro EU', link: '/docs/ueber-den-gruenerator/gruenerator-pro-eu' },
      {
        title: 'Support & Mitgliedschaft',
        link: '/docs/ueber-den-gruenerator/support-mitgliedschaft',
      },
    ],
  },
  {
    title: 'Grundlagen',
    icon: '📚',
    description: 'Wichtige Basics für die Arbeit mit dem Grünerator und KI-generierten Inhalten.',
    link: '/docs/Grundlagen/Kennzeichnungs-Guide',
    topPages: [
      { title: 'Kennzeichnungs-Guide', link: '/docs/Grundlagen/Kennzeichnungs-Guide' },
      { title: 'Welches KI-Tool wofür?', link: '/docs/Grundlagen/welches-ki-tool-wofuer' },
    ],
  },
  {
    title: 'Profil',
    icon: '👤',
    description: 'Personalisiere den Grünerator und nutze die Grüne Wolke für deine Inhalte.',
    link: '/docs/Profil/gruene-wolke-tutorial',
    topPages: [
      { title: 'Grüne Wolke Tutorial', link: '/docs/Profil/gruene-wolke-tutorial' },
      { title: 'Anweisungen & Wissen', link: '/docs/Profil/anweisungen-wissen' },
    ],
  },
  {
    title: 'Grünerieren',
    icon: '✨',
    description: 'Erstelle grüne Inhalte: Texte, Sharepics, Untertitel und mehr.',
    link: '/docs/gruenerieren/pro-modus',
    topPages: [
      { title: 'Pro-Modus', link: '/docs/gruenerieren/pro-modus' },
      { title: 'Websuche', link: '/docs/gruenerieren/websuche' },
      { title: 'Privacy-Mode', link: '/docs/gruenerieren/privacy-mode' },
    ],
  },
  {
    title: 'LLM Basics',
    icon: '🧠',
    description: 'Verstehe, wie Large Language Models funktionieren und welche Risiken es gibt.',
    link: '/docs/llm-basics/wie-llms-funktionieren',
    topPages: [
      { title: 'Wie LLMs funktionieren', link: '/docs/llm-basics/wie-llms-funktionieren' },
      { title: 'Risiken & Gefahren', link: '/docs/llm-basics/risiken-und-gefahren-von-llms' },
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
                href="https://gruenerator.de"
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
