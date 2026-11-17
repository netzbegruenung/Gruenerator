import { type ReactNode } from 'react';

import SettingsSection from '../components/SettingsSection';

const LINK_CLASS = 'font-medium text-primary-600 hover:underline dark:text-primary-400';

// Link rows rather than catalog rows: there is nothing to set here, only ways
// to reach us. Each row reads title + explanation on the left, the way on the right.
const SupportRow = ({
  title,
  description,
  settingsId,
  children,
}: {
  title: string;
  settingsId?: string;
  description: string;
  children: ReactNode;
}) => (
  <div
    data-settings-id={settingsId}
    className="flex min-h-14 scroll-mt-4 flex-wrap items-center justify-between gap-x-6 gap-y-1 py-3.5"
  >
    <div className="min-w-0 max-w-[64ch]">
      <p className="m-0 text-sm font-medium text-foreground">{title}</p>
      <p className="m-0 mt-0.5 text-xs text-grey-500 dark:text-grey-400">{description}</p>
    </div>
    <div className="shrink-0 text-sm">{children}</div>
  </div>
);

const SupportTab = () => (
  <SettingsSection
    title="Hilfe bekommen"
    description="Fragen zum Grünerator oder Unterstützung nötig? Diese Wege stehen dir offen."
  >
    <SupportRow
      settingsId="support.kontakt"
      title="Chat Begrünung"
      description="Der schnellste Weg: unser Support-Kanal im Chat Begrünung — Fragen stellen, Probleme melden, mit anderen Nutzer*innen austauschen."
    >
      <a
        href="https://chatbegruenung.de/channel/Gruenerator"
        target="_blank"
        rel="noopener noreferrer"
        className={LINK_CLASS}
      >
        → Zum Grünerator Support-Kanal
      </a>
    </SupportRow>

    <SupportRow
      title="E-Mail (Österreich)"
      description="Nutzer*innen aus Österreich können sich direkt per E-Mail an uns wenden:"
    >
      <a href="mailto:info@moritz-waechter.de" className={LINK_CLASS}>
        info@moritz-waechter.de
      </a>
    </SupportRow>
  </SettingsSection>
);

export default SupportTab;
