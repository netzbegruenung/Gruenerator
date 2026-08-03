import type { ReactNode } from 'react';
import Footer from '@theme-original/Footer';
import type FooterType from '@theme/Footer';
import type { WrapperProps } from '@docusaurus/types';
import { useColorMode, type ColorMode } from '@docusaurus/theme-common';
import styles from './styles.module.css';

// theme-common exports ColorMode but not the nullable choice type;
// null = follow the system preference.
type ColorModeChoice = ColorMode | null;

type Props = WrapperProps<typeof FooterType>;

const CHOICES: { value: ColorModeChoice; label: string }[] = [
  { value: 'light', label: 'Hell' },
  { value: 'dark', label: 'Dunkel' },
  { value: null, label: 'System' },
];

function ColorModeSelect(): ReactNode {
  const { colorModeChoice, setColorMode } = useColorMode();

  return (
    <div className={styles.themeBar}>
      <span className={styles.themeLabel}>Darstellung:</span>
      <div className={styles.themeGroup} role="group" aria-label="Darstellung wählen">
        {CHOICES.map((choice) => (
          <button
            key={choice.label}
            type="button"
            className={styles.themeButton}
            aria-pressed={colorModeChoice === choice.value}
            onClick={() => setColorMode(choice.value)}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function FooterWrapper(props: Props): ReactNode {
  return (
    <>
      <Footer {...props} />
      <ColorModeSelect />
    </>
  );
}
