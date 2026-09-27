import { Button } from '@gruenerator/ui';
import { Link } from 'react-router-dom';

/**
 * Rezepte werden nicht mehr hier, sondern in der Agentura angelernt — dieser
 * Tab ist nur noch ein Wegweiser dorthin. Tab-Schlüssel und Beschriftung
 * (`texte-anlernen`, „Texte anlernen") bleiben bestehen, damit alte Deep-Links
 * (`/settings/texte-anlernen`) weiter funktionieren.
 */
const TexteAnlernenTab = () => (
  <section className="flex flex-col gap-sm rounded-xl border border-grey-200 p-md dark:border-grey-700">
    <h3 className="m-0 text-sm font-semibold text-foreground-heading">
      Rezepte sind in die Agentura umgezogen.
    </h3>
    <p className="m-0 text-sm text-grey-500 dark:text-grey-400">
      Lege eigene Rezepte jetzt direkt im Marktplatz an oder bearbeite bestehende.
    </p>
    <p className="m-0 text-sm text-grey-500 dark:text-grey-400">
      Angepasste Stile für mitgelieferte Rezepte (Presse, Instagram, …) findest du auf der
      jeweiligen Rezept-Seite in der Agentura.
    </p>
    <div>
      <Button asChild variant="brand">
        <Link to="/agentura?cat=meine">Zur Agentura</Link>
      </Button>
    </div>
  </section>
);

export default TexteAnlernenTab;
