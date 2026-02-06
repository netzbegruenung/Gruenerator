'use client';

import { Sparkles, Server, Check } from 'lucide-react';
import { useAgentStore, PROVIDER_OPTIONS, Provider } from '@/lib/store';
import { Dropdown, DropdownItem } from '@/components/ui/dropdown';

const PROVIDER_ICONS: Record<Provider, typeof Sparkles> = {
  mistral: Sparkles,
  litellm: Server,
};

export function ModelSelector() {
  const { selectedProvider, setSelectedProvider } = useAgentStore();
  const currentProvider = PROVIDER_OPTIONS.find((p) => p.id === selectedProvider);
  const Icon = PROVIDER_ICONS[selectedProvider] || Sparkles;

  return (
    <Dropdown
      trigger={
        <>
          <Icon className="h-4 w-4" />
          <span>{currentProvider?.name || 'Mistral AI'}</span>
        </>
      }
      footer={
        <p className="text-xs text-foreground-muted">
          Modell: <span className="font-mono">{currentProvider?.model}</span>
        </p>
      }
    >
      {PROVIDER_OPTIONS.map((provider) => {
        const ProviderIcon = PROVIDER_ICONS[provider.id];
        return (
          <DropdownItem
            key={provider.id}
            icon={<ProviderIcon className="h-4 w-4 text-foreground-muted" />}
            label={provider.name}
            description={provider.description}
            selected={selectedProvider === provider.id}
            onClick={() => setSelectedProvider(provider.id)}
            trailing={
              selectedProvider === provider.id && (
                <Check className="h-4 w-4 text-secondary-600" />
              )
            }
          />
        );
      })}
    </Dropdown>
  );
}
