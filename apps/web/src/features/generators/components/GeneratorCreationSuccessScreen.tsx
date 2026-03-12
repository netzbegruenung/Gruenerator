import { memo, useMemo } from 'react';
import { FaCheckCircle } from 'react-icons/fa';
import { Link } from 'react-router-dom';

interface GeneratorCreationSuccessScreenProps {
  name: string;
  slug: string;
  onRestart: () => void;
  onClose?: () => void;
}

const GeneratorCreationSuccessScreen: React.FC<GeneratorCreationSuccessScreenProps> = memo(
  ({ name, slug, onRestart, onClose }) => {
    const generatorPath = useMemo(() => `/gruenerator/${slug}`, [slug]);

    return (
      <div className="flex flex-col items-center justify-center text-center px-md py-xl mt-lg rounded-lg bg-background-alt border border-grey-200 dark:border-grey-700 shadow-md">
        <FaCheckCircle className="text-[4rem] text-[var(--klee)] mb-lg" />
        <h1 className="text-foreground-heading text-2xl mb-sm">Erfolg!</h1>
        <p className="text-lg text-foreground mb-xl max-w-[500px]">
          Dein Grünerator &quot;<strong className="text-primary-600 font-semibold">{name}</strong>
          &quot; wurde erfolgreich erstellt.
        </p>
        <div className="flex flex-col gap-md w-full max-w-[350px] sm:flex-row sm:justify-center">
          <Link to={generatorPath} className="button button-primary button-large">
            Zum Grünerator
          </Link>
          <button
            type="button"
            onClick={onRestart}
            className="button button-secondary button-large"
          >
            Weiteren erstellen
          </button>
          {onClose && (
            <button type="button" onClick={onClose} className="button button-tertiary button-large">
              Zur Übersicht
            </button>
          )}
        </div>
      </div>
    );
  }
);

GeneratorCreationSuccessScreen.displayName = 'GeneratorCreationSuccessScreen';

export default GeneratorCreationSuccessScreen;
