/**
 * Advanced Module Preloader
 * Provides intelligent module and resource preloading capabilities
 * with priority-based loading, caching, and performance monitoring
 */

class ModulePreloader {
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
   * @private
   */
  _detectSlowConnection() {
    if (typeof navigator === 'undefined' || !navigator.connection) return false;
    
    const connection = navigator.connection;
    // Consider connection slow if effective type is slow or save-data is enabled
    return connection.effectiveType === 'slow-2g' || 
           connection.effectiveType === '2g' ||
           connection.saveData;
  }

  /**
   * Preload a module with priority-based scheduling
   * @param {string} name - Module name for caching
   * @param {Function} importFn - Dynamic import function
   * @param {string} priority - Priority level (CRITICAL, HIGH, NORMAL, LOW, IDLE)
   * @param {Object} options - Additional options
   * @returns {Promise} - Promise resolving to the module
   */
  async preloadModule(name, importFn, priority = 'NORMAL', options = {}) {
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
   * @private
   */
  _scheduleLoad(name, importFn, priority, options) {
    const startTime = performance.now();
    
    // Adjust behavior for slow connections
    if (this.isSlowConnection && priority !== 'CRITICAL' && priority !== 'HIGH') {
      return Promise.resolve(null);
    }
    
    const loadFn = async () => {
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
        return new Promise(resolve => {
          const delay = this.isSlowConnection ? 2000 : 100;
          if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
            window.requestIdleCallback(() => resolve(loadFn()), { timeout: delay * 10 });
          } else if (window.scheduler?.postTask) {
            window.scheduler.postTask(() => resolve(loadFn()), { priority: 'user-visible' });
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
        return new Promise(resolve => {
          const delay = priority === 'LOW' ? 1000 : 3000;
          if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
            window.requestIdleCallback(() => resolve(loadFn()), { timeout: delay * 3 });
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
   * @param {Array} modules - Array of {name, importFn, priority} objects
   * @param {Object} options - Loading options
   * @returns {Promise} - Promise resolving when all modules are loaded
   */
  async preloadModules(modules, options = {}) {
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
            this.preloadModule(name, importFn, priority).catch(err => {
              // Module preload failed
            })
          )
        );
      }
    }
  }

  /**
   * Get a cached module
   * @param {string} name - Module name
   * @returns {any} - Cached module or null
   */
  getCachedModule(name) {
    return this.cache.get(name) || null;
  }

  /**
   * Check if a module is loading
   * @param {string} name - Module name
   * @returns {boolean} - True if loading
   */
  isLoading(name) {
    return this.loadingPromises.has(name);
  }

  /**
   * Clear cache and loading promises
   */
  clear() {
    this.cache.clear();
    this.loadingPromises.clear();
    this.loadTimes.clear();
  }

  /**
   * Get performance metrics
   * @returns {Object} - Performance data
   */
  getMetrics() {
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
   * @private
   */
  _chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Preload based on user interaction patterns
   * @param {string} currentRoute - Current route/page
   * @param {Object} userPreferences - User preferences and history
   */
  async intelligentPreload(currentRoute, userPreferences = {}) {
    const { frequentlyUsed = [], betaFeatures = {} } = userPreferences;
    
    // Define route-based preloading strategies
    const preloadStrategies = {
      '/profile': [
        { name: 'ProfileInfoTab', importFn: () => import('../features/auth/components/profile/ProfileInfoTab'), priority: 'CRITICAL' },
        { name: 'LaborTab', importFn: () => import('../features/auth/components/profile/LaborTab'), priority: 'HIGH' },
        { name: 'GroupsManagementTab', importFn: () => import('../features/auth/components/profile/GroupsManagementTab'), priority: 'NORMAL' },
        ...(betaFeatures.customGenerators ? [{ name: 'CustomGeneratorsTab', importFn: () => import('../features/auth/components/profile/CustomGeneratorsTab'), priority: 'LOW' }] : []),
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