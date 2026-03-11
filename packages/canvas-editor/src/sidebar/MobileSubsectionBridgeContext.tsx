import { createContext, useContext } from 'react';

export interface MobileSubsectionBridgeValue {
  active: boolean;
  activeSubsection: string | null;
  onSubsectionsChange: (subs: Array<{ id: string; label: string }>) => void;
  onActiveSubsectionChange: (id: string | null) => void;
}

const defaultValue: MobileSubsectionBridgeValue = {
  active: false,
  activeSubsection: null,
  onSubsectionsChange: () => {},
  onActiveSubsectionChange: () => {},
};

export const MobileSubsectionBridgeContext =
  createContext<MobileSubsectionBridgeValue>(defaultValue);

export function useMobileSubsectionBridge() {
  return useContext(MobileSubsectionBridgeContext);
}
