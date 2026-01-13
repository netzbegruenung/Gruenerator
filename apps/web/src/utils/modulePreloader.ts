/**
 * Advanced Module Preloader
 * Provides intelligent module and resource preloading capabilities
 * with priority-based loading, caching, and performance monitoring
 */

// Priority levels
type PriorityLevel = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW' | 'IDLE';

// Priority map type
interface PriorityMap {
  CRITICAL: number;
  HIGH: number;
  NORMAL: number;
  LOW: number;
  IDLE: number;
}

// Module definition for batch preloading
interface ModuleDefinition {
  name: string;
  importFn: () => Promise<unknown>;
  priority: PriorityLevel;
}

// Preload options
interface PreloadOptions {
  waitForCritical?: boolean;
  maxConcurrent?: number;
}

// User preferences for intelligent preloading
interface UserPreferences {
  frequentlyUsed?: string[];
  betaFeatures?: Record<string, boolean>;
}

// Performance metrics
interface PreloaderMetrics {
  cachedModules: string[];
  loadingModules: string[];
  loadTimes: Record<string, number>;
  totalCached: number;
  totalLoading: number;
}

// Navigator connection interface (for slow connection detection)
interface NetworkInformation {
  effectiveType?: string;
  saveData?: boolean;
}

// Extend Navigator interface
declare global {
  interface Navigator {
    connection?: NetworkInformation;
  }

  interface Window {
    scheduler?: {
      postTask: (callback: () => void, options?: { priority?: string }) => void;
    };
  }
}

class ModulePreloader {
  // Class properties with types
  private cache: Map<string, unknown>;
  private loadingPromises: Map<string, Promise<unknown>>;
  private loadTimes: Map<string, number>;
  private priorities: PriorityMap;
  private isSlowConnection: boolean;

  constructor() {
    this.cache = new Map();
    this.loadingPromises = new Map();
    this.loadTimes = new Map();
    this.priorities = {
      CRITICAL: 0,
      HIGH: 1,
      NORMAL: 2,
      LOW: 3,
      IDLE: 4
    };
    // Connection awareness
    this.isSlowConnection = this._detectSlowConnection();
  }

  /**
   * Detect slow connection to adjust preloading behavior
   */
  private _detectSlowConnection(): boolean {
    if (typeof navigator === 'undefined' || !navigator.connection) return false;

    const connection = navigator.connection;
    // Consider connection slow if effective type is slow or save-data is enabled
    return connection.effectiveType === 'slow-2g' ||
           connection.effectiveType === '2g' ||
           connection.saveData === true;
  }

  /**
   * Preload a module with priority-based scheduling
   * @param name - Module name for caching
   * @param importFn - Dynamic import function
   * @param priority - Priority level (CRITICAL, HIGH, NORMAL, LOW, IDLE)
   * @param options - Additional options
   * @returns Promise resolving to the module
   */
  async preloadModule(
    name: string,
    importFn: () => Promise<unknown>,
    priority: PriorityLevel = 'NORMAL',
    options: Record<string, unknown> = {}
  ): Promise<unknown> {
    // Return cached module if available
    if (this.cache.has(name)) {
      return this.cache.get(name);
    }

    // Return existing loading promise if in progress
    if (this.loadingPromises.has(name)) {
      return this.loadingPromises.get(name);
    }

    // Create loading promise
    const loadingPromise = this._scheduleLoad(name, importFn, priority, options);
    this.loadingPromises.set(name, loadingPromise);

    try {
      const module = await loadingPromise;
      this.cache.set(name, module);
      this.loadingPromises.delete(name);
      return module;
    } catch (error) {
      this.loadingPromises.delete(name);
      throw error;
    }
  }

  /**
   * Schedule module loading based on priority and connection
   */
  private _scheduleLoad(
    name: string,
    importFn: () => Promise<unknown>,
    priority: PriorityLevel,
    options: Record<string, unknown>
  ): Promise<unknown> {
    const startTime = performance.now();

    // Adjust behavior for slow connections
    if (this.isSlowConnection && priority !== 'CRITICAL' && priority !== 'HIGH') {
      return Promise.resolve(null);
    }

    const loadFn = async (): Promise<unknown> => {
      try {
        const module = await importFn();

        const endTime = performance.now();
        this.loadTimes.set(name, endTime - startTime);

        return module;
      } catch (error) {
        throw error;
      }
    };

    // Schedule based on priority with connection awareness
    switch (priority) {
      case 'CRITICAL':
        return loadFn(); // Load immediately

      case 'HIGH':
        return new Promise(resolve => {
          // Use scheduler if available, otherwise setTimeout
          if (typeof window !== 'undefined' && window.scheduler?.postTask) {
            window.scheduler.postTask(() => resolve(loadFn()), { priority: 'user-blocking' });
          } else {
            setTimeout(() => resolve(loadFn()), this.isSlowConnection ? 500 : 0);
          }
        });

      case 'NORMAL':
        return new Promise<unknown>(resolve => {
          const delay = this.isSlowConnection ? 2000 : 100;
          if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
            (window as unknown as { requestIdleCallback(callback: () => void, options?: { timeout?: number }): void }).requestIdleCallback(() => resolve(loadFn()), { timeout: delay * 10 });
          } else if (typeof window !== 'undefined' && (window as unknown as { scheduler?: { postTask(callback: () => void, options?: { priority?: string }): void } }).scheduler?.postTask) {
            (window as unknown as { scheduler: { postTask(callback: () => void, options?: { priority?: string }): void } }).scheduler.postTask(() => resolve(loadFn()), { priority: 'user-visible' });
          } else {
            setTimeout(() => resolve(loadFn()), delay);
          }
        });

      case 'LOW':
      case 'IDLE':
        if (this.isSlowConnection) {
          // Skip low priority loading on slow connections
          return Promise.resolve(null);
        }
        return new Promise<unknown>(resolve => {
          const delay = priority === 'LOW' ? 1000 : 3000;
          if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
            (window as unknown as { requestIdleCallback(callback: () => void, options?: { timeout?: number }): void }).requestIdleCallback(() => resolve(loadFn()), { timeout: delay * 3 });
          } else {
            setTimeout(() => resolve(loadFn()), delay);
          }
        });

      default:
        return loadFn();
    }
  }

  /**
   * Preload multiple modules in parallel
   * @param modules - Array of {name, importFn, priority} objects
   * @param options - Loading options
   * @returns Promise resolving when all modules are loaded
   */
  async preloadModules(modules: ModuleDefinition[], options: PreloadOptions = {}): Promise<void> {
    const { waitForCritical = true, maxConcurrent = 6 } = options;

    // Separate critical modules
    const criticalModules = modules.filter(m => m.priority === 'CRITICAL');
    const otherModules = modules.filter(m => m.priority !== 'CRITICAL');

    // Load critical modules first if requested
    if (waitForCritical && criticalModules.length > 0) {
      await Promise.all(
        criticalModules.map(({ name, importFn, priority }) =>
          this.preloadModule(name, importFn, priority)
        )
      );
    }

    // Load other modules with concurrency control
    if (otherModules.length > 0) {
      const chunks = this._chunkArray(otherModules, maxConcurrent);

      for (const chunk of chunks) {
        await Promise.all(
          chunk.map(({ name, importFn, priority }) =>
            this.preloadModule(name, importFn, priority).catch(() => {
              // Module preload failed - silently continue
            })
          )
        );
      }
    }
  }

  /**
   * Get a cached module
   * @param name - Module name
   * @returns Cached module or null
   */
  getCachedModule(name: string): unknown {
    return this.cache.get(name) || null;
  }

  /**
   * Check if a module is loading
   * @param name - Module name
   * @returns True if loading
   */
  isLoading(name: string): boolean {
    return this.loadingPromises.has(name);
  }

  /**
   * Clear cache and loading promises
   */
  clear(): void {
    this.cache.clear();
    this.loadingPromises.clear();
    this.loadTimes.clear();
  }

  /**
   * Get performance metrics
   * @returns Performance data
   */
  getMetrics(): PreloaderMetrics {
    return {
      cachedModules: Array.from(this.cache.keys()),
      loadingModules: Array.from(this.loadingPromises.keys()),
      loadTimes: Object.fromEntries(this.loadTimes),
      totalCached: this.cache.size,
      totalLoading: this.loadingPromises.size
    };
  }

  /**
   * Utility: Chunk array into smaller arrays
   */
  private _chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Preload based on user interaction patterns
   * @param currentRoute - Current route/page
   * @param userPreferences - User preferences and history
   */
  async intelligentPreload(currentRoute: string, userPreferences: UserPreferences = {}): Promise<void> {
    const { frequentlyUsed = [], betaFeatures = {} } = userPreferences;

    // Define route-based preloading strategies
    const preloadStrategies: Record<string, ModuleDefinition[]> = {
      '/profile': [
        { name: 'ProfileInfoTab', importFn: () => import('../features/auth/components/profile/ProfileInfoTab'), priority: 'CRITICAL' },
        { name: 'GroupsManagementTab', importFn: () => import('../features/auth/components/profile/tabs/GroupsManagement'), priority: 'NORMAL' },
        ...(betaFeatures.customGenerators ? [{ name: 'CustomGeneratorsTab', importFn: () => import('../features/auth/components/profile/CustomGeneratorsTab'), priority: 'LOW' as PriorityLevel }] : []),
      ],
      '/': [
        { name: 'PresseSocialGenerator', importFn: () => import('../features/texte/presse/PresseSocialGenerator'), priority: 'HIGH' },
        { name: 'UniversalTextGenerator', importFn: () => import('../features/texte/universal/UniversalTextGenerator'), priority: 'NORMAL' }
      ]
    };

    const modulesToPreload = preloadStrategies[currentRoute] || [];

    // Add frequently used modules with higher priority
    frequentlyUsed.forEach(moduleName => {
      const existingModule = modulesToPreload.find(m => m.name === moduleName);
      if (existingModule && existingModule.priority !== 'CRITICAL') {
        existingModule.priority = 'HIGH';
      }
    });

    if (modulesToPreload.length > 0) {
      await this.preloadModules(modulesToPreload, {
        waitForCritical: true,
        maxConcurrent: 4
      });
    }
  }
}

// Create a global instance
const modulePreloader = new ModulePreloader();

// Export both the class and the global instance
export { ModulePreloader, modulePreloader };

// Default export is the global instance
export default modulePreloader;
