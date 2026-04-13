import { useQueryClient } from '@tanstack/react-query';
import { memo, useCallback, useState } from 'react';
import { FiLink, FiCheck, FiLoader } from 'react-icons/fi';
import { SiGoogle, SiJira, SiConfluence } from 'react-icons/si';
import { VscAzure } from 'react-icons/vsc';

import {
  useConnectionStatus,
  useCreateSessionToken,
  useDisconnectProvider,
} from '../hooks/useConnections';

import type { ConnectionStatus } from '../lib/connectionsApi';
import type { IconType } from 'react-icons';

import { cn } from '@/utils/cn';

const NANGO_PUBLIC_URL =
  (import.meta.env.VITE_NANGO_PUBLIC_URL as string | undefined) ?? 'https://nango.gruenerator.eu';

interface ProviderIconConfig {
  icon: IconType;
  color: string;
  darkColor: string;
}

const PROVIDER_ICONS: Record<string, ProviderIconConfig> = {
  google: { icon: SiGoogle, color: 'text-[#4285F4]', darkColor: 'dark:text-[#8AB4F8]' },
  microsoft: { icon: VscAzure, color: 'text-[#00A4EF]', darkColor: 'dark:text-[#60C3F7]' },
  jira: { icon: SiJira, color: 'text-[#0052CC]', darkColor: 'dark:text-[#4C9AFF]' },
  confluence: { icon: SiConfluence, color: 'text-[#172B4D]', darkColor: 'dark:text-[#B3BAC5]' },
};

interface ProviderCardProps {
  provider: ConnectionStatus;
  onConnect: (providerKey: string) => void;
  onDisconnect: (providerKey: string) => void;
  isConnecting: boolean;
  isDisconnecting: boolean;
}

const ProviderCard = memo(
  ({ provider, onConnect, onDisconnect, isConnecting, isDisconnecting }: ProviderCardProps) => {
    const iconConfig = PROVIDER_ICONS[provider.provider];
    const Icon = iconConfig?.icon ?? FiLink;
    const isBusy = isConnecting || isDisconnecting;

    return (
      <div
        className={cn(
          'flex items-center justify-between p-md rounded-lg border bg-background-pure transition-colors',
          provider.connected
            ? 'border-primary-300 dark:border-primary-700'
            : 'border-grey-200 dark:border-grey-700'
        )}
      >
        <div className="flex items-center gap-md">
          <Icon
            className={cn(
              'w-5 h-5',
              iconConfig?.color ?? 'text-grey-500',
              iconConfig?.darkColor ?? ''
            )}
          />
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground-heading">{provider.label}</span>
            <span className="text-xs text-grey-400">{provider.services.join(', ')}</span>
          </div>
        </div>

        <div className="flex items-center gap-sm">
          {provider.connected && (
            <span className="flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400">
              <FiCheck size={12} />
              Verbunden
            </span>
          )}

          {provider.connected ? (
            <button
              type="button"
              onClick={() => onDisconnect(provider.provider)}
              disabled={isBusy}
              className={cn(
                'text-xs px-sm py-1 rounded-md cursor-pointer transition-colors',
                'bg-transparent border border-grey-300 dark:border-grey-600',
                'text-grey-500 hover:text-[var(--error-red)] hover:border-[var(--error-red)]',
                isBusy && 'opacity-50 cursor-not-allowed'
              )}
            >
              {isDisconnecting ? <FiLoader className="animate-spin" size={12} /> : 'Trennen'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onConnect(provider.provider)}
              disabled={isBusy}
              className={cn(
                'text-xs px-md py-1 rounded-md cursor-pointer transition-colors font-medium',
                'bg-primary-500 text-white hover:bg-primary-600 border-none',
                isBusy && 'opacity-50 cursor-not-allowed'
              )}
            >
              {isConnecting ? <FiLoader className="animate-spin" size={12} /> : 'Verbinden'}
            </button>
          )}
        </div>
      </div>
    );
  }
);
ProviderCard.displayName = 'ProviderCard';

interface ConnectedAccountsSectionProps {
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

const ConnectedAccountsSection = memo(({ onSuccess, onError }: ConnectedAccountsSectionProps) => {
  const { data: providers = [], isLoading } = useConnectionStatus();
  const createToken = useCreateSessionToken();
  const disconnect = useDisconnectProvider();
  const queryClient = useQueryClient();
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);

  const handleConnect = useCallback(
    async (providerKey: string) => {
      try {
        setConnectingProvider(providerKey);
        const token = await createToken.mutateAsync();
        const connectUrl = `${NANGO_PUBLIC_URL}/oauth/connect/${providerKey}?connect_session_token=${encodeURIComponent(token)}`;
        const popup = window.open(connectUrl, '_blank', 'width=600,height=700');

        if (popup) {
          const interval = setInterval(() => {
            if (popup.closed) {
              clearInterval(interval);
              void queryClient.invalidateQueries({ queryKey: ['connections', 'status'] });
            }
          }, 1000);
        }

        onSuccess?.(`OAuth-Flow für ${providerKey} gestartet`);
      } catch {
        onError?.('Verbindung konnte nicht gestartet werden');
      } finally {
        setConnectingProvider(null);
      }
    },
    [createToken, queryClient, onSuccess, onError]
  );

  const handleDisconnect = useCallback(
    async (providerKey: string) => {
      try {
        await disconnect.mutateAsync(providerKey);
        onSuccess?.('Verbindung getrennt');
      } catch {
        onError?.('Verbindung konnte nicht getrennt werden');
      }
    },
    [disconnect, onSuccess, onError]
  );

  return (
    <div className="mt-xl">
      <div className="flex items-center gap-sm mb-md">
        <FiLink className="w-6 h-6 text-foreground-heading" />
        <h2 className="text-xl font-semibold text-foreground-heading m-0">Verbundene Konten</h2>
        <span className="text-xs bg-secondary-100 text-secondary-700 px-sm py-0.5 rounded-full font-medium">
          Dev
        </span>
      </div>

      {isLoading && <p className="text-sm text-grey-400 text-center py-sm">Lade Verbindungen...</p>}

      {!isLoading && providers.length > 0 && (
        <div className="flex flex-col gap-sm">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.provider}
              provider={provider}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              isConnecting={connectingProvider === provider.provider}
              isDisconnecting={disconnect.isPending && disconnect.variables === provider.provider}
            />
          ))}
        </div>
      )}

      {!isLoading && providers.length === 0 && (
        <p className="text-sm text-grey-400 text-center py-md">
          Nango-Server nicht erreichbar. Stelle sicher, dass der Nango-Container läuft.
        </p>
      )}
    </div>
  );
});
ConnectedAccountsSection.displayName = 'ConnectedAccountsSection';

export default ConnectedAccountsSection;
