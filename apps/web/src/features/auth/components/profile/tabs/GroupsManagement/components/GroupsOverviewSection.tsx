import { motion } from 'motion/react';
import { memo } from 'react';
import { HiChatAlt2, HiDocumentText, HiLightBulb, HiPlus, HiUserGroup } from 'react-icons/hi';

import HelpTooltip from '../../../../../../../components/common/HelpTooltip';
import { Button } from '../../../../../../../components/ui/button';
import { Card } from '../../../../../../../components/ui/card';

interface Group {
  id: string;
  name: string;
  isAdmin?: boolean;
}

interface TabIndexConfig {
  createGroupButton?: number;
}

interface GroupsOverviewSectionProps {
  userGroups: Group[] | null | undefined;
  isCreatingGroup: boolean;
  onCreateNew: () => void;
  tabIndex: TabIndexConfig;
}

const FEATURES = [
  {
    icon: HiDocumentText,
    label: 'Anweisungen teilen',
    desc: 'Gemeinsame Vorgaben für Anträge und Social Media',
  },
  { icon: HiLightBulb, label: 'Wissen teilen', desc: 'Wissensbausteine für das gesamte Team' },
  {
    icon: HiChatAlt2,
    label: 'Einheitlich kommunizieren',
    desc: 'Konsistente Texte und Formulierungen',
  },
  {
    icon: HiUserGroup,
    label: 'Zusammenarbeiten',
    desc: 'Kolleg*innen per Einladungslink hinzufügen',
  },
] as const;

const MOTION_CONFIG = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.3 },
} as const;

const GroupsOverviewSection = memo(
  ({
    userGroups,
    isCreatingGroup,
    onCreateNew,
    tabIndex,
  }: GroupsOverviewSectionProps): React.ReactElement => {
    const groupCount = userGroups?.length ?? 0;

    return (
      <motion.div
        className="flex flex-col gap-lg"
        initial={MOTION_CONFIG.initial}
        animate={MOTION_CONFIG.animate}
        transition={MOTION_CONFIG.transition}
      >
        <div>
          <div className="flex items-center gap-xs mb-xs">
            <h2 className="text-2xl font-bold text-grey-800 dark:text-grey-100">
              Zusammen sind wir stärker!
            </h2>
            <HelpTooltip>
              <p>
                Mit Gruppen kannst du Anweisungen und Wissen mit anderen teilen und gemeinsam
                nutzen.
              </p>
              <p>
                <strong>Tipp:</strong> Erstelle eine Gruppe für deinen Verband oder dein Team und
                lade andere über den Join-Link ein.
              </p>
            </HelpTooltip>
          </div>

          <p className="text-base text-grey-600 dark:text-grey-400 mb-lg">
            Arbeite gemeinsam mit deinem Team an Texten und Materialien.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-md mb-lg">
            {FEATURES.map(({ icon: Icon, label, desc }) => (
              <Card key={label} className="flex items-start gap-md p-lg">
                <div className="shrink-0 flex items-center justify-center size-12 rounded-lg bg-primary-500/10">
                  <Icon className="text-2xl text-primary-500" />
                </div>
                <div className="flex flex-col gap-xs min-w-0">
                  <span className="text-base font-semibold text-grey-800 dark:text-grey-200">
                    {label}
                  </span>
                  <span className="text-sm text-grey-500 dark:text-grey-400 leading-normal">
                    {desc}
                  </span>
                </div>
              </Card>
            ))}
          </div>

          <div className="flex flex-col items-center gap-sm">
            <p className="text-sm text-grey-500">
              {groupCount > 0
                ? `Du bist in ${groupCount} Gruppe${groupCount > 1 ? 'n' : ''}. Wähle eine aus oder erstelle eine neue.`
                : 'Erstelle jetzt deine erste Gruppe!'}
            </p>
            <Button
              onClick={onCreateNew}
              disabled={isCreatingGroup}
              tabIndex={tabIndex.createGroupButton}
              aria-label="Neue Gruppe erstellen"
            >
              <HiPlus />
              {isCreatingGroup ? 'Wird erstellt...' : 'Neue Gruppe erstellen'}
            </Button>
          </div>
        </div>
      </motion.div>
    );
  }
);

GroupsOverviewSection.displayName = 'GroupsOverviewSection';

export default GroupsOverviewSection;
