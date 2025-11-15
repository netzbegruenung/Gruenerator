/**
 * Smart Debug Logger for Focus Loss Investigation
 * Prevents console spam with intelligent grouping and throttling
 */

class DebugLogger {
  constructor() {
    this.renderCounts = new Map();
    this.lastLogs = new Map();
    this.componentRefs = new Map();
  }

  /**
   * Log with deduplication - only logs if message changed
   */
  logOnce(key, message, data = null) {
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
  logRender(componentName, throttle = 5, data = null) {
    const count = (this.renderCounts.get(componentName) || 0) + 1;
    this.renderCounts.set(componentName, count);

    if (count % throttle === 0) {
      console.log(`[RENDER:${componentName}]`, `Render #${count}`, data || '');
    }
  }

  /**
   * Track component reference changes
   */
  logRefChange(componentName, refName, newRef) {
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
  logLifecycle(componentName, event, data = null) {
    console.log(`[LIFECYCLE:${componentName}]`, event, data || '');
  }

  /**
   * Start a grouped log section
   */
  startGroup(label) {
    console.group(`🔍 ${label}`);
  }

  /**
   * End a grouped log section
   */
  endGroup() {
    console.groupEnd();
  }

  /**
   * Log focus events
   */
  logFocus(componentName, event, fieldName) {
    console.log(`[FOCUS:${componentName}]`, `${event} on ${fieldName}`, {
      activeElement: document.activeElement?.tagName,
      renderCount: this.renderCounts.get(componentName) || 0
    });
  }

  /**
   * Clear all tracking data
   */
  reset() {
    this.renderCounts.clear();
    this.lastLogs.clear();
    this.componentRefs.clear();
    console.log('[DEBUG] Logger reset');
  }
}

// Singleton instance
const debugLogger = new DebugLogger();

// Only enable in development
export const logger = import.meta.env.DEV ? debugLogger : {
  logOnce: () => {},
  logRender: () => {},
  logRefChange: () => {},
  logLifecycle: () => {},
  startGroup: () => {},
  endGroup: () => {},
  logFocus: () => {},
  reset: () => {}
};

export default logger;
