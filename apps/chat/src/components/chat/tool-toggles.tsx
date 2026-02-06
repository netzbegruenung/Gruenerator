'use client';

import { Search, Globe, User, Image, Wrench, BookOpen } from 'lucide-react';
import { useAgentStore, type ToolKey } from '@/lib/store';
import { Dropdown, DropdownItem, ToggleSwitch } from '@/components/ui/dropdown';
import { cn } from '@/lib/utils';

interface ToolConfig {
  key: ToolKey;
  icon: typeof Search;
  label: string;
  description: string;
  color: string;
  bgColor: string;
}

const TOOL_CONFIGS: ToolConfig[] = [
  {
    key: 'research',
    icon: BookOpen,
    label: 'Recherche',
    description: 'Strukturierte Multi-Quellen-Suche',
    color: 'text-indigo-600 dark:text-indigo-400',
    bgColor: 'bg-indigo-100 dark:bg-indigo-900/30',
  },
  {
    key: 'search',
    icon: Search,
    label: 'Dokumente',
    description: 'Parteiprogramme & Positionen',
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
  },
  {
    key: 'web',
    icon: Globe,
    label: 'Web',
    description: 'Aktuelle Nachrichten & Infos',
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
  },
  {
    key: 'person',
    icon: User,
    label: 'Personen',
    description: 'Grüne Politiker*innen',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
  },
  {
    key: 'examples',
    icon: Image,
    label: 'Beispiele',
    description: 'Social-Media-Vorlagen',
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
  },
];

export function ToolToggles() {
  const { enabledTools, toggleTool } = useAgentStore();
  const enabledCount = Object.values(enabledTools).filter(Boolean).length;

  return (
    <Dropdown
      width="w-72"
      trigger={
        <>
          <Wrench className="h-4 w-4" />
          <span>Tools</span>
        </>
      }
      badge={
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-secondary-100 px-1.5 text-xs font-medium text-secondary-700 dark:bg-secondary-800 dark:text-secondary-200">
          {enabledCount}
        </span>
      }
      footer={
        <p className="text-xs text-foreground-muted">
          {enabledCount === 0
            ? 'Keine Tools aktiv – KI antwortet aus Wissen'
            : `${enabledCount} von ${TOOL_CONFIGS.length} Tools aktiv`}
        </p>
      }
    >
      {TOOL_CONFIGS.map((tool) => {
        const Icon = tool.icon;
        const isEnabled = enabledTools[tool.key];

        return (
          <DropdownItem
            key={tool.key}
            icon={
              <Icon
                className={cn(
                  'h-4 w-4 transition-colors',
                  isEnabled ? tool.color : 'text-gray-400 dark:text-gray-500'
                )}
              />
            }
            iconClassName={cn(
              'transition-colors',
              isEnabled ? tool.bgColor : 'bg-gray-100 dark:bg-white/5'
            )}
            label={tool.label}
            description={tool.description}
            onClick={() => toggleTool(tool.key)}
            trailing={<ToggleSwitch enabled={isEnabled} />}
          />
        );
      })}
    </Dropdown>
  );
}
