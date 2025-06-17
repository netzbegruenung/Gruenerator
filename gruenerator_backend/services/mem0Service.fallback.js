// Fallback implementation of Mem0Service when the actual service is not available
class Mem0ServiceFallback {
  constructor() {
    this.baseURL = 'disabled';
    console.log('[Mem0ServiceFallback] Using fallback implementation - mem0 features disabled');
  }

  async healthCheck() {
    return {
      status: 'disabled',
      message: 'Mem0 service is disabled'
    };
  }

  async addMemory(messages, userId, metadata = null) {
    console.log('[Mem0ServiceFallback] addMemory called but mem0 is disabled - skipping');
    return {
      success: false,
      message: 'Mem0 service is disabled',
      data: null
    };
  }

  async getMemories(userId) {
    console.log('[Mem0ServiceFallback] getMemories called but mem0 is disabled - returning empty');
    return {
      success: true,
      data: { results: [] },
      message: 'Mem0 service is disabled - no memories available'
    };
  }

  async searchMemories(query, userId) {
    console.log('[Mem0ServiceFallback] searchMemories called but mem0 is disabled - returning empty');
    return {
      success: true,
      data: { results: [] },
      message: 'Mem0 service is disabled - no search results available'
    };
  }

  async deleteMemory(memoryId) {
    console.log('[Mem0ServiceFallback] deleteMemory called but mem0 is disabled - skipping');
    return {
      success: false,
      message: 'Mem0 service is disabled - cannot delete memory'
    };
  }
}

// Singleton instance
const mem0ServiceFallback = new Mem0ServiceFallback();

module.exports = mem0ServiceFallback;