import type { ReactNode } from 'react';
import Footer from '@theme-original/DocItem/Footer';
import type FooterType from '@theme/DocItem/Footer';
import type { WrapperProps } from '@docusaurus/types';
import { useDoc } from '@docusaurus/plugin-content-docs/client';
import styles from './styles.module.css';

type Props = WrapperProps<typeof FooterType>;

const LAENDER: Record<string, string> = {
  de: 'Deutschland',
  at: 'Österreich',
};

export default function FooterWrapper(props: Props): ReactNode {
  const { laender } = useDoc().frontMatter as { laender?: string[] };

  return (
    <>
      {laender && laender.length > 0 && (
        <p className={styles.laender}>
          Gilt für: {laender.map((code) => LAENDER[code] ?? code).join(', ')}
        </p>
      )}
      <Footer {...props} />
    </>
  );
}
