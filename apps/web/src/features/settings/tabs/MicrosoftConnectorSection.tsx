import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FiCheck, FiLoader } from 'react-icons/fi';

import { connectInPopup, unwrap } from '@/features/admin/connector-test/connectorTestApi';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/utils/cn';

const STATUS_KEY = ['connector-test-status'];

interface MicrosoftConnectorSectionProps {
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

/**
 * Microsoft 365 (OneDrive) über Nango — nur für Instanz-Admins, bis der Konnektor
 * für alle freigeschaltet ist. Dieselben Admin-Endpunkte wie die Testseite
 * (`/admin/connector-test`); der Server prüft die Rolle dort selbst.
 */
const MicrosoftConnectorSection = ({ onSuccess, onError }: MicrosoftConnectorSectionProps) => {
  const isInstanceAdmin = useAuthStore((s) => s.user?.is_admin === true);
  if (!isInstanceAdmin) return null;
  return <AdminCard onSuccess={onSuccess} onError={onError} />;
};

const AdminCard = ({ onSuccess, onError }: MicrosoftConnectorSectionProps) => {
  const queryClient = useQueryClient();
  const client = getContractsClient().connectorTest;
  const refresh = () => queryClient.invalidateQueries({ queryKey: STATUS_KEY });

  const { data, isLoading } = useQuery({
    queryKey: STATUS_KEY,
    queryFn: async () => unwrap(await client.status()),
  });
  const connected = data?.providers.find((p) => p.provider === 'microsoft')?.connected ?? false;

  const connect = useMutation({
    mutationFn: () => connectInPopup('microsoft'),
    onError: (err) => onError?.(err instanceof Error ? err.message : 'Verbinden fehlgeschlagen'),
    onSettled: refresh,
  });
  const disconnect = useMutation({
    mutationFn: async () => unwrap(await client.disconnect({ params: { provider: 'microsoft' } })),
    onSuccess: () => onSuccess?.('Microsoft 365 getrennt'),
    onError: () => onError?.('Verbindung konnte nicht getrennt werden'),
    onSettled: refresh,
  });
  const isBusy = connect.isPending || disconnect.isPending;

  return (
    <div className="mt-xl">
      <div className="flex items-center gap-sm mb-md">
        <h2 className="text-xl font-semibold text-foreground-heading m-0">Microsoft 365</h2>
        <span className="text-xs bg-secondary-100 text-secondary-700 px-sm py-0.5 rounded-full font-medium">
          Nur für Admins
        </span>
      </div>

      {isLoading ? (
        <p className="text-sm text-grey-400 text-center py-sm">Lade Verbindung...</p>
      ) : (
        <div
          className={cn(
            'flex items-center justify-between p-md rounded-lg border bg-background-pure transition-colors',
            connected
              ? 'border-primary-300 dark:border-primary-700'
              : 'border-grey-200 dark:border-grey-700'
          )}
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground-heading">Microsoft 365</span>
            <span className="text-xs text-grey-400">OneDrive</span>
          </div>

          <div className="flex items-center gap-sm">
            {connected && (
              <span className="flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400">
                <FiCheck size={12} />
                Verbunden
              </span>
            )}
            {connected ? (
              <button
                type="button"
                onClick={() => disconnect.mutate()}
                disabled={isBusy}
                className={cn(
                  'text-xs px-sm py-1 rounded-md cursor-pointer transition-colors',
                  'bg-transparent border border-grey-300 dark:border-grey-600',
                  'text-grey-500 hover:text-[var(--error-red)] hover:border-[var(--error-red)]',
                  isBusy && 'opacity-50 cursor-not-allowed'
                )}
              >
                {disconnect.isPending ? <FiLoader className="animate-spin" size={12} /> : 'Trennen'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => connect.mutate()}
                disabled={isBusy}
                className={cn(
                  'text-xs px-md py-1 rounded-md cursor-pointer transition-colors font-medium',
                  'bg-primary-500 text-white hover:bg-primary-600 border-none',
                  isBusy && 'opacity-50 cursor-not-allowed'
                )}
              >
                {connect.isPending ? <FiLoader className="animate-spin" size={12} /> : 'Verbinden'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MicrosoftConnectorSection;
