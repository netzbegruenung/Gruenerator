'use client';

import { Search, Globe, Image, Wrench, BookOpen, Sparkles, Server, Check } from 'lucide-react';
import { useAgentStore, MODEL_OPTIONS, type ToolKey, type ModelOption } from '../stores/chatStore';
import { Dropdown, DropdownItem, ToggleSwitch } from './ui/Dropdown';
import { cn } from '../lib/utils';

const MODEL_ICONS: Record<ModelOption['icon'], typeof Sparkles> = {
  sparkles: Sparkles,
  server: Server,
};

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
    color: 'text-tool-research',
    bgColor: 'bg-tool-research-bg',
  },
  {
    key: 'search',
    icon: Search,
    label: 'Dokumente',
    description: 'Parteiprogramme & Positionen',
    color: 'text-tool-documents',
    bgColor: 'bg-tool-documents-bg',
  },
  {
    key: 'web',
    icon: Globe,
    label: 'Web',
    description: 'Aktuelle Nachrichten & Infos',
    color: 'text-tool-web',
    bgColor: 'bg-tool-web-bg',
  },
  {
    key: 'examples',
    icon: Image,
    label: 'Beispiele',
    description: 'Social-Media-Vorlagen',
    color: 'text-tool-examples',
    bgColor: 'bg-tool-examples-bg',
  },
];

export function ToolToggles() {
  const enabledTools = useAgentStore((s) => s.enabledTools);
  const toggleTool = useAgentStore((s) => s.toggleTool);
  const selectedModel = useAgentStore((s) => s.selectedModel);
  const setSelectedModel = useAgentStore((s) => s.setSelectedModel);
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
      <div className="md:hidden">
        <div className="border-t border-border my-1" />
        {MODEL_OPTIONS.map((model) => {
          const ModelIcon = MODEL_ICONS[model.icon];
          return (
            <DropdownItem
              key={model.id}
              icon={<ModelIcon className="h-4 w-4 text-foreground-muted" />}
              label={model.name}
              description={model.description}
              selected={selectedModel === model.id}
              onClick={() => setSelectedModel(model.id)}
              trailing={
                selectedModel === model.id ? (
                  <Check className="h-4 w-4 text-secondary-600" />
                ) : undefined
              }
            />
          );
        })}
      </div>
    </Dropdown>
  );
}
