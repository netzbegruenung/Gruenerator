import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  Svg: React.ComponentType<React.ComponentProps<'svg'>>;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  /* {
    title: 'Schnell und Einfach',
    Svg: require('@site/static/img/undraw_docusaurus_mountain.svg').default,
    description: (
      <>
        Der Grünerator macht die Erstellung von politischen Dokumenten 
        einfach und effizient. Fokussiere dich auf deine Inhalte, 
        nicht auf die Formatierung.
      </>
    ),
  }, */
  /* {
    title: 'Grüne Wolke Integration',
    Svg: require('@site/static/img/undraw_docusaurus_tree.svg').default,
    description: (
      <>
        Verbinde den Grünerator mit der Grünen Wolke für automatisches 
        Speichern und nahtloses Teilen deiner generierten Dokumente 
        mit deinem Team.
      </>
    ),
  }, */
  /* {
    title: 'Für Grüne Politik',
    Svg: require('@site/static/img/undraw_docusaurus_react.svg').default,
    description: (
      <>
        Speziell entwickelt für grüne Organisationen und Politiker*innen. 
        Erstelle Anträge, Pressemitteilungen und Reden mit den 
        richtigen Vorlagen und Stilen.
      </>
    ),
  }, */
];

function Feature({title, Svg, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
