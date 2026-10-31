import type { HocuspocusProvider } from '@hocuspocus/provider';

interface CollabUnavailableProps {
  provider: HocuspocusProvider | null;
}

/** Shown instead of an editor that has neither a server sync nor a local copy. */
export function CollabUnavailable({ provider }: CollabUnavailableProps) {
  return (
    <div role="status" className="flex flex-1 items-center justify-center p-md">
      <div className="z-10 max-w-sm text-center">
        <h2 className="text-base font-semibold text-foreground-heading mb-sm">
          Keine Verbindung zum Server
        </h2>
        <p className="text-sm text-grey-500 mb-md">
          Der Inhalt liegt auf diesem Gerät noch nicht vor. Sobald die Verbindung wieder steht,
          öffnet er sich von selbst.
        </p>
        <button
          type="button"
          onClick={() => void provider?.connect()}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 border-none cursor-pointer transition-colors"
        >
          Erneut verbinden
        </button>
      </div>
    </div>
  );
}
