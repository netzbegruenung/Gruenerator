import type { ReactNode } from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import SearchBar from '@theme/SearchBar';
import {
  SECTIONS,
  QUICK_TASKS,
  EXTRA_LINKS,
  type DocSection,
  type QuickTask,
} from '@site/src/nav/sections';
import styles from './index.module.css';

function TaskCard({ task }: { task: QuickTask }): ReactNode {
  return (
    <Link to={task.to} className={styles.taskCard}>
      <div className={styles.taskText}>
        <span className={styles.taskLabel}>{task.label}</span>
        <span className={styles.taskDescription}>{task.description}</span>
      </div>
      <svg
        className={styles.taskArrow}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M14 5l7 7m0 0l-7 7m7-7H3"
        />
      </svg>
    </Link>
  );
}

function SectionCard({ section }: { section: DocSection }): ReactNode {
  return (
    <div className={styles.categoryCard}>
      <Link to={section.intro} className={styles.categoryCardLink}>
        <div className={styles.categoryHeader}>
          <span className={styles.categoryIcon}>{section.icon}</span>
          <h3 className={styles.categoryTitle}>{section.label}</h3>
        </div>
        <p className={styles.categoryDescription}>{section.description}</p>
      </Link>

      <div className={styles.topPages}>
        {section.topPages.map((page) => (
          <Link key={page.to} to={page.to} className={styles.topPageLink}>
            <svg
              className={styles.linkIcon}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            {page.label}
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
      <header className={styles.hero}>
        <div className="container">
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>
              <span className={styles.titleGreen}>Grünerator</span> Dokumentation
            </h1>
            <p className={styles.heroSubtitle}>Alles, was du über die grüne KI wissen musst</p>
            <div className={styles.heroSearch}>
              <SearchBar />
            </div>
            <Link
              className={styles.heroLink}
              href="https://gruenerator.eu"
              target="_blank"
              rel="noopener noreferrer"
            >
              Zum Grünerator →
            </Link>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.tasksSection}>
          <div className="container">
            <div className={styles.categoriesIntro}>
              <h2 className={styles.sectionTitle}>Direkt loslegen</h2>
              <p className={styles.sectionSubtitle}>
                Die häufigsten Aufgaben — Schritt für Schritt erklärt
              </p>
            </div>
            <div className={styles.tasksGrid}>
              {QUICK_TASKS.map((task) => (
                <TaskCard key={task.to} task={task} />
              ))}
            </div>
          </div>
        </section>

        <section className={styles.categoriesSection}>
          <div className="container">
            <div className={styles.categoriesIntro}>
              <h2 className={styles.sectionTitle}>Alle Bereiche</h2>
              <p className={styles.sectionSubtitle}>
                Die Dokumentation folgt dem Aufbau des Grünerators
              </p>
            </div>
            <div className={styles.categoriesGrid}>
              {SECTIONS.map((s) => (
                <SectionCard key={s.id} section={s} />
              ))}
            </div>
            <div className={styles.extraRow}>
              <span className={styles.extraLabel}>Außerdem:</span>
              {Object.values(EXTRA_LINKS).map((link) => (
                <Link key={link.to} to={link.to} className={styles.extraLink}>
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
