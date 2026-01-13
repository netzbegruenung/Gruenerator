/**
 * Smart Debug Logger for Focus Loss Investigation
 * Prevents console spam with intelligent grouping and throttling
 */

// Logger interface for type safety
interface IDebugLogger {
  logOnce: (key: string, message: string, data?: unknown) => void;
  logRender: (componentName: string, throttle?: number, data?: unknown) => void;
  logRefChange: (componentName: string, refName: string, newRef: unknown) => void;
  logLifecycle: (componentName: string, event: string, data?: unknown) => void;
  startGroup: (label: string) => void;
  endGroup: () => void;
  logFocus: (componentName: string, event: string, fieldName: string) => void;
  reset: () => void;
}

class DebugLogger implements IDebugLogger {
  private renderCounts: Map<string, number>;
  private lastLogs: Map<string, string>;
  private componentRefs: Map<string, unknown>;

  constructor() {
    this.renderCounts = new Map();
    this.lastLogs = new Map();
    this.componentRefs = new Map();
  }

  /**
   * Log with deduplication - only logs if message changed
   */
  logOnce(key: string, message: string, data: unknown = null): void {
    const fullMessage = data ? `${message} ${JSON.stringify(data)}` : message;
    const lastMessage = this.lastLogs.get(key);

    if (lastMessage !== fullMessage) {
      console.log(`[DEBUG:${key}]`, message, data || '');
      this.lastLogs.set(key, fullMessage);
    }
  }

  /**
   * Log render with throttling - only logs every Nth render
   */
  logRender(componentName: string, throttle: number = 5, data: unknown = null): void {
    const count = (this.renderCounts.get(componentName) || 0) + 1;
    this.renderCounts.set(componentName, count);

    if (count % throttle === 0) {
      console.log(`[RENDER:${componentName}]`, `Render #${count}`, data || '');
    }
  }

  /**
   * Track component reference changes
   */
  logRefChange(componentName: string, refName: string, newRef: unknown): void {
    const key = `${componentName}:${refName}`;
    const oldRef = this.componentRefs.get(key);

    if (oldRef !== newRef) {
      console.warn(`[REF_CHANGE:${componentName}]`, `${refName} reference changed`, {
        changed: oldRef !== newRef,
        renderCount: this.renderCounts.get(componentName) || 0
      });
      this.componentRefs.set(key, newRef);
    }
  }

  /**
   * Log lifecycle events
   */
  logLifecycle(componentName: string, event: string, data: unknown = null): void {
    console.log(`[LIFECYCLE:${componentName}]`, event, data || '');
  }

  /**
   * Start a grouped log section
   */
  startGroup(label: string): void {
    console.group(`🔍 ${label}`);
  }

  /**
   * End a grouped log section
   */
  endGroup(): void {
    console.groupEnd();
  }

  /**
   * Log focus events
   */
  logFocus(componentName: string, event: string, fieldName: string): void {
    console.log(`[FOCUS:${componentName}]`, `${event} on ${fieldName}`, {
      activeElement: document.activeElement?.tagName,
      renderCount: this.renderCounts.get(componentName) || 0
    });
  }

  /**
   * Clear all tracking data
   */
  reset(): void {
    this.renderCounts.clear();
    this.lastLogs.clear();
    this.componentRefs.clear();
    console.log('[DEBUG] Logger reset');
  }
}

// No-op logger for production
const noopLogger: IDebugLogger = {
  logOnce: () => {},
  logRender: () => {},
  logRefChange: () => {},
  logLifecycle: () => {},
  startGroup: () => {},
  endGroup: () => {},
  logFocus: () => {},
  reset: () => {}
};

// Singleton instance
const debugLogger = new DebugLogger();

// Only enable in development
export const logger: IDebugLogger = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV ? debugLogger : noopLogger;

export default logger;
