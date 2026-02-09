'use client';

import { Sparkles, Zap, Eye, Server, Check } from 'lucide-react';
import { useAgentStore, MODEL_OPTIONS, type ModelOption } from '../stores/chatStore';
import { Dropdown, DropdownItem } from './ui/Dropdown';

const MODEL_ICONS: Record<ModelOption['icon'], typeof Sparkles> = {
  sparkles: Sparkles,
  zap: Zap,
  eye: Eye,
  server: Server,
};

export function ModelSelector() {
  const { selectedModel, setSelectedModel } = useAgentStore();
  const currentModel = MODEL_OPTIONS.find((m) => m.id === selectedModel);
  const Icon = currentModel ? MODEL_ICONS[currentModel.icon] : Sparkles;

  return (
    <Dropdown
      align="left"
      showChevron={false}
      trigger={
        <>
          <Icon className="h-4 w-4" />
          <span>{currentModel?.name || 'Mistral Large'}</span>
        </>
      }
      footer={
        <p className="text-xs text-foreground-muted">
          Modell: <span className="font-mono">{currentModel?.model}</span>
        </p>
      }
    >
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
              selectedModel === model.id && (
                <Check className="h-4 w-4 text-secondary-600" />
              )
            }
          />
        );
      })}
    </Dropdown>
  );
}
