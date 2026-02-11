'use client';

import { Search, Globe, Image, Wrench, BookOpen } from 'lucide-react';
import { useAgentStore, type ToolKey } from '../stores/chatStore';
import { Dropdown, DropdownItem, ToggleSwitch } from './ui/Dropdown';
import { cn } from '../lib/utils';

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
    color: 'text-tool-indigo',
    bgColor: 'bg-tool-indigo-bg',
  },
  {
    key: 'search',
    icon: Search,
    label: 'Dokumente',
    description: 'Parteiprogramme & Positionen',
    color: 'text-tool-emerald',
    bgColor: 'bg-tool-emerald-bg',
  },
  {
    key: 'web',
    icon: Globe,
    label: 'Web',
    description: 'Aktuelle Nachrichten & Infos',
    color: 'text-tool-orange',
    bgColor: 'bg-tool-orange-bg',
  },
  {
    key: 'examples',
    icon: Image,
    label: 'Beispiele',
    description: 'Social-Media-Vorlagen',
    color: 'text-tool-purple',
    bgColor: 'bg-tool-purple-bg',
  },
];

export function ToolToggles() {
  const { enabledTools, toggleTool } = useAgentStore();
  const enabledCount = Object.values(enabledTools).filter(Boolean).length;

  return (
    <Dropdown
      align="left"
      direction="up"
      width="w-72"
      showChevron={false}
      trigger={<Wrench className="h-4 w-4" />}
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
                  isEnabled ? tool.color : 'text-muted-disabled'
                )}
              />
            }
            iconClassName={cn('transition-colors', isEnabled ? tool.bgColor : 'bg-surface')}
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
