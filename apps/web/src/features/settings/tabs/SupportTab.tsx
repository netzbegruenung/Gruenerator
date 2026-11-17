import { SettingsRowLayout } from '../components/SettingsRow';
import SettingsSection from '../components/SettingsSection';

const LINK_CLASS = 'text-sm font-medium text-primary-600 hover:underline dark:text-primary-400';

const SupportTab = () => (
  <SettingsSection
    title="Hilfe bekommen"
    description="Fragen zum Grünerator oder Unterstützung nötig? Diese Wege stehen dir offen."
  >
    <SettingsRowLayout
      id="support.kontakt"
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
    </SettingsRowLayout>

    <SettingsRowLayout
      title="E-Mail (Österreich)"
      description="Nutzer*innen aus Österreich können sich direkt per E-Mail an uns wenden:"
    >
      <a href="mailto:info@moritz-waechter.de" className={LINK_CLASS}>
        info@moritz-waechter.de
      </a>
    </SettingsRowLayout>
  </SettingsSection>
);

export default SupportTab;
