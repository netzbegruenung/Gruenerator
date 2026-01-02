import type { ReactNode, CSSProperties, ComponentType, MouseEvent, KeyboardEvent } from 'react';

/**
 * Base props shared by most UI components
 */
export interface BaseComponentProps {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/**
 * Common size variants
 */
export type Size = 'small' | 'medium' | 'large';

/**
 * Button and action element variants
 */
export type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';

/**
 * Icon component props
 */
export interface IconProps {
  size?: number | string;
  color?: string;
  className?: string;
}

/**
 * Generic icon component type
 */
export type IconComponent = ComponentType<IconProps>;

/**
 * Click handler with element type
 */
export type ClickHandler<T = HTMLButtonElement> = (event: MouseEvent<T>) => void;

/**
 * Keyboard handler
 */
export type KeyHandler<T = HTMLElement> = (event: KeyboardEvent<T>) => void;

/**
 * Loading state props
 */
export interface LoadingProps {
  isLoading?: boolean;
  loadingText?: string;
}

/**
 * Disabled state props
 */
export interface DisabledProps {
  disabled?: boolean;
  disabledReason?: string;
}

/**
 * Common form field props
 */
export interface BaseFieldProps {
  name: string;
  label?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * API response wrapper (matches backend pattern)
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Pagination props
 */
export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/**
 * Toast/notification types
 */
export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}
