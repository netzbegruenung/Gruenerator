const SupportTab = () => (
  <div className="flex flex-col gap-lg text-sm leading-relaxed text-foreground">
    <p className="m-0 text-grey-500 dark:text-grey-400">
      Fragen zum Grünerator oder Unterstützung nötig? Diese Wege stehen dir offen.
    </p>

    <div className="flex flex-col gap-xs">
      <h3 className="m-0 text-sm font-medium text-foreground">Chat Begrünung</h3>
      <p className="m-0 text-grey-500 dark:text-grey-400">
        Der schnellste Weg: unser Support-Kanal im Chat Begrünung — Fragen stellen, Probleme melden,
        mit anderen Nutzer*innen austauschen.
      </p>
      <a
        href="https://chatbegruenung.de/channel/Gruenerator"
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-primary-600 hover:underline dark:text-primary-400"
      >
        → Zum Grünerator Support-Kanal
      </a>
    </div>

    <div className="flex flex-col gap-xs">
      <h3 className="m-0 text-sm font-medium text-foreground">E-Mail (Österreich)</h3>
      <p className="m-0 text-grey-500 dark:text-grey-400">
        Nutzer*innen aus Österreich können sich direkt per E-Mail an uns wenden:
      </p>
      <a
        href="mailto:info@moritz-waechter.de"
        className="font-medium text-primary-600 hover:underline dark:text-primary-400"
      >
        info@moritz-waechter.de
      </a>
    </div>
  </div>
);

export default SupportTab;
