/**
 * Bridge types shared between native RN components and DOM canvas editor.
 * All types must be JSON-serializable for Expo DOM component communication.
 */

// Re-export SidebarTabId values that map to canvas editor tabs
export type SidebarTabId =
  | 'background'
  | 'text'
  | 'elements'
  | 'alternatives'
  | 'share'
  | 'fontsize'
  | 'assets'
  | 'image'
  | 'position'
  | 'settings'
  | 'image-background';

export interface TabInfo {
  id: SidebarTabId;
  label: string;
  disabled: boolean;
}

export type FloatingModuleType =
  | 'text'
  | 'image'
  | 'shape'
  | 'icon'
  | 'illustration'
  | 'asset'
  | 'background'
  | 'balken'
  | 'frame';

export interface SelectedElementInfo {
  type: FloatingModuleType;
  id: string;
  fontSize?: number;
  opacity?: number;
  fill?: string;
  color?: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
}

export type ToolbarAction =
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'moveLayer'; direction: 'up' | 'down' }
  | { type: 'colorChange'; color: string }
  | { type: 'opacityChange'; opacity: number }
  | { type: 'fontSizeChange'; delta: number };
