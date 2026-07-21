import { useEffect, useState } from 'react';

/**
 * Derives the EditorTopBar connection status from the collaboration state,
 * delaying the "disconnected" signal by 5s so brief reconnects don't flash
 * an error at the user.
 */
export function useDelayedConnectionStatus(
  isConnected: boolean,
  isLocalLoaded: boolean
): 'disconnected' | 'offline-cached' | undefined {
  const [showDisconnected, setShowDisconnected] = useState(false);

  useEffect(() => {
    if (isConnected) {
      setShowDisconnected(false);
      return;
    }
    const timer = setTimeout(() => setShowDisconnected(true), 5000);
    return () => clearTimeout(timer);
  }, [isConnected]);

  return showDisconnected ? (isLocalLoaded ? 'offline-cached' : 'disconnected') : undefined;
}
