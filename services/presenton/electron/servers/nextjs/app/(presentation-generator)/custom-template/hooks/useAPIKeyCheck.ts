import { useState, useEffect } from "react";

export const useAPIKeyCheck = () => {
  const [hasRequiredKey, setHasRequiredKey] = useState(false);
  const [isRequiredKeyLoading, setIsRequiredKeyLoading] = useState(true);

  useEffect(() => {
    const checkKey = async () => {
      try {
        let data;
        // Check if running in Electron environment
        if (typeof window !== 'undefined' && window.electron?.hasRequiredKey) {
          // Use Electron IPC handler
          data = await window.electron.hasRequiredKey();
        } else {
          // Fallback to API route for web-based deployments
          const res = await fetch("/api/has-required-key");
          data = await res.json();
        }
        setHasRequiredKey(Boolean(data.hasKey));
        setIsRequiredKeyLoading(false);
      } catch {
        setIsRequiredKeyLoading(false);
      }
    };
    
    checkKey();
  }, []);

  return { hasRequiredKey, isRequiredKeyLoading };
}; 