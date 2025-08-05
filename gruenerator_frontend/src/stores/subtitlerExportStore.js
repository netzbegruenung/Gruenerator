import { create } from 'zustand';

// Constants for export states
export const EXPORT_STATUS = {
  IDLE: 'idle',
  STARTING: 'starting', 
  EXPORTING: 'exporting',
  COMPLETE: 'complete',
  ERROR: 'error'
};

// Constants for polling configuration
const POLLING_CONFIG = {
  INITIAL_INTERVAL: 2000, // 2 seconds initially
  EXTENDED_INTERVAL: 5000, // 5 seconds after extended time
  EXTENDED_TIME_THRESHOLD: 30000, // Switch to slower polling after 30s
  MAX_RETRY_COUNT: 3,
  RETRY_DELAY_BASE: 1000, // Base delay for exponential backoff
};

// Dynamically set baseURL based on environment
const isDevelopment = import.meta.env.VITE_APP_ENV === 'development';
const baseURL = isDevelopment ? 'http://localhost:3001/api' : `${window.location.origin}/api`;

const initialState = {
  // Export state
  status: EXPORT_STATUS.IDLE,
  progress: 0, // 0-100
  exportToken: null,
  error: null,
  timeRemaining: null,
  
  // Internal polling state
  pollingInterval: null,
  pollingStartTime: null,
  retryCount: 0,
  lastSuccessfulPoll: null,
  
  // Export parameters (stored for retry purposes)
  exportParams: null,
  
  // Reference counting for multiple subscribers
  subscriberCount: 0,
};

export const useSubtitlerExportStore = create((set, get) => ({
  // Initialize with default state
  ...initialState,

  // Start export process
  startExport: async (subtitles, preferences = {}) => {
    console.log('[SubtitlerExportStore] Starting export with preferences:', preferences);
    
    const state = get();
    
    // Prevent multiple concurrent exports
    if (state.status === EXPORT_STATUS.STARTING || state.status === EXPORT_STATUS.EXPORTING) {
      console.warn('[SubtitlerExportStore] Export already in progress, ignoring duplicate request');
      return;
    }

    // Store export parameters for potential retry
    const exportParams = {
      subtitles,
      ...preferences
    };

    set({
      status: EXPORT_STATUS.STARTING,
      progress: 0,
      error: null,
      exportParams,
      retryCount: 0,
      pollingStartTime: Date.now(),
    });

    try {
      // Call the export API
      const response = await fetch(`${baseURL}/subtitler/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(exportParams),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Export request failed');
      }

      // Check content type to determine response type
      const contentType = response.headers.get('Content-Type');
      const exportToken = response.headers.get('X-Export-Token');
      
      console.log('[SubtitlerExportStore] Response headers:', {
        contentType,
        exportToken,
        contentLength: response.headers.get('Content-Length')
      });

      // Handle direct video stream download
      if (contentType && contentType.includes('video/')) {
        console.log('[SubtitlerExportStore] Handling direct video stream download');
        
        set({
          status: EXPORT_STATUS.EXPORTING,
          exportToken: exportToken || null,
        });

        // Process streaming download
        await get().handleStreamingDownload(response, exportParams);
        
      } else if (exportToken) {
        // Handle progress-tracked export
        console.log('[SubtitlerExportStore] Starting progress-tracked export with token:', exportToken);
        set({
          status: EXPORT_STATUS.EXPORTING,
          exportToken,
        });

        // Start polling for progress
        get().startPolling();
        
      } else {
        // Unexpected response
        console.warn('[SubtitlerExportStore] Unexpected response type');
        throw new Error('Unexpected response from export API');
      }

    } catch (error) {
      console.error('[SubtitlerExportStore] Export start failed:', error);
      set({
        status: EXPORT_STATUS.ERROR,
        error: error.message || 'Failed to start export',
      });
    }
  },

  // Start polling for progress updates
  startPolling: () => {
    const state = get();
    
    if (state.pollingInterval) {
      console.log('[SubtitlerExportStore] Polling already active');
      return;
    }

    if (!state.exportToken) {
      console.error('[SubtitlerExportStore] Cannot start polling without exportToken');
      return;
    }

    console.log('[SubtitlerExportStore] Starting progress polling');
    
    const poll = async () => {
      const currentState = get();
      
      // Stop polling if export is complete or error occurred
      if (currentState.status === EXPORT_STATUS.COMPLETE || 
          currentState.status === EXPORT_STATUS.ERROR ||
          currentState.status === EXPORT_STATUS.IDLE) {
        get().stopPolling();
        return;
      }

      try {
        const response = await fetch(`${baseURL}/subtitler/export-progress/${currentState.exportToken}`, {
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error(`Progress polling failed: ${response.status}`);
        }

        const progressData = await response.json();
        console.log('[SubtitlerExportStore] Progress update:', progressData);

        set({
          lastSuccessfulPoll: Date.now(),
          retryCount: 0, // Reset retry count on successful poll
        });

        if (progressData.status === 'exporting') {
          set({
            progress: progressData.progress || 0,
            timeRemaining: progressData.timeRemaining,
          });
        } else if (progressData.status === 'complete') {
          set({
            status: EXPORT_STATUS.COMPLETE,
            progress: 100,
          });
          get().stopPolling();
        } else if (progressData.status === 'error') {
          set({
            status: EXPORT_STATUS.ERROR,
            error: progressData.error || 'Export failed',
          });
          get().stopPolling();
        }

      } catch (error) {
        console.error('[SubtitlerExportStore] Polling error:', error);
        
        const currentState = get();
        const newRetryCount = currentState.retryCount + 1;

        if (newRetryCount <= POLLING_CONFIG.MAX_RETRY_COUNT) {
          console.log(`[SubtitlerExportStore] Retrying polling (${newRetryCount}/${POLLING_CONFIG.MAX_RETRY_COUNT})`);
          set({ retryCount: newRetryCount });
          
          // Use exponential backoff for retries
          const retryDelay = POLLING_CONFIG.RETRY_DELAY_BASE * Math.pow(2, newRetryCount - 1);
          setTimeout(() => {
            if (get().status === EXPORT_STATUS.EXPORTING) {
              poll();
            }
          }, retryDelay);
        } else {
          console.error('[SubtitlerExportStore] Max retries reached, stopping polling');
          set({
            status: EXPORT_STATUS.ERROR,
            error: 'Connection lost during export. Please try again.',
          });
          get().stopPolling();
        }
      }
    };

    // Calculate polling interval based on elapsed time
    const getPollingInterval = () => {
      const elapsed = Date.now() - (state.pollingStartTime || Date.now());
      return elapsed > POLLING_CONFIG.EXTENDED_TIME_THRESHOLD 
        ? POLLING_CONFIG.EXTENDED_INTERVAL 
        : POLLING_CONFIG.INITIAL_INTERVAL;
    };

    // Start initial poll immediately
    poll();

    // Set up recurring polling with adaptive interval
    const intervalId = setInterval(poll, getPollingInterval());
    
    set({ pollingInterval: intervalId });
  },

  // Stop polling
  stopPolling: () => {
    const state = get();
    if (state.pollingInterval) {
      console.log('[SubtitlerExportStore] Stopping progress polling');
      clearInterval(state.pollingInterval);
      set({ pollingInterval: null });
    }
  },

  // Subscribe to store (for reference counting)
  subscribe: () => {
    const state = get();
    const newCount = state.subscriberCount + 1;
    console.log(`[SubtitlerExportStore] Subscriber added (${newCount})`);
    set({ subscriberCount: newCount });

    // Return unsubscribe function
    return () => {
      const currentState = get();
      const newCount = Math.max(0, currentState.subscriberCount - 1);
      console.log(`[SubtitlerExportStore] Subscriber removed (${newCount})`);
      set({ subscriberCount: newCount });

      // Stop polling if no more subscribers
      if (newCount === 0) {
        get().stopPolling();
      }
    };
  },

  // Retry export (reuse stored parameters)
  retryExport: async () => {
    const state = get();
    if (!state.exportParams) {
      console.error('[SubtitlerExportStore] No export parameters stored for retry');
      return;
    }

    console.log('[SubtitlerExportStore] Retrying export');
    const { subtitles, ...preferences } = state.exportParams;
    await get().startExport(subtitles, preferences);
  },

  // Handle streaming download response
  handleStreamingDownload: async (response, exportParams) => {
    try {
      console.log('[SubtitlerExportStore] Processing streaming download');
      
      const contentLength = response.headers.get('Content-Length');
      const reader = response.body.getReader();
      
      let receivedLength = 0;
      const chunks = [];
      
      // Read stream with progress updates
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        chunks.push(value);
        receivedLength += value.length;
        
        // Update progress if content length is known
        if (contentLength) {
          const progress = Math.round((receivedLength / parseInt(contentLength)) * 100);
          set({ progress: Math.min(progress, 99) }); // Keep at 99% until complete
          console.log(`[SubtitlerExportStore] Streaming progress: ${progress}%`);
        }
      }
      
      // Create blob from chunks
      const blob = new Blob(chunks, { type: 'video/mp4' });
      
      // Trigger download
      await get().triggerBlobDownload(blob, exportParams);
      
      // Mark as complete
      set({
        status: EXPORT_STATUS.COMPLETE,
        progress: 100,
      });
      
      console.log('[SubtitlerExportStore] Streaming download completed successfully');
      
    } catch (error) {
      console.error('[SubtitlerExportStore] Streaming download failed:', error);
      set({
        status: EXPORT_STATUS.ERROR,
        error: error.message || 'Download failed',
      });
    }
  },

  // Trigger blob download
  triggerBlobDownload: async (blob, exportParams) => {
    try {
      const { uploadId } = exportParams;
      
      // Generate filename
      const baseFilename = `video_${uploadId}`;
      const filename = `${baseFilename}_gruenerator.mp4`;
      
      console.log(`[SubtitlerExportStore] Triggering download: ${filename}`);
      
      // Create download URL
      const url = window.URL.createObjectURL(blob);
      
      // Create and trigger download link
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up URL after delay
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 60000);
      
      console.log(`[SubtitlerExportStore] Download triggered successfully: ${filename}`);
      
    } catch (error) {
      console.error('[SubtitlerExportStore] Failed to trigger download:', error);
      throw new Error('Failed to start download');
    }
  },

  // Reset export state
  resetExport: () => {
    console.log('[SubtitlerExportStore] Resetting export state');
    
    // Stop any active polling
    get().stopPolling();
    
    set({
      ...initialState,
      subscriberCount: get().subscriberCount, // Preserve subscriber count
    });
  },

  // Error handling
  setError: (error) => {
    console.error('[SubtitlerExportStore] Setting error:', error);
    set({
      status: EXPORT_STATUS.ERROR,
      error: typeof error === 'string' ? error : error.message || 'An error occurred',
    });
    get().stopPolling();
  },

  // Manual progress update (for testing or special cases)
  updateProgress: (progress, timeRemaining = null) => {
    const state = get();
    if (state.status === EXPORT_STATUS.EXPORTING) {
      set({
        progress: Math.max(0, Math.min(100, progress)),
        timeRemaining,
      });
    }
  },

  // Get current export status (helper method)
  getExportStatus: () => {
    const state = get();
    return {
      status: state.status,
      progress: state.progress,
      error: state.error,
      isExporting: state.status === EXPORT_STATUS.EXPORTING,
      isComplete: state.status === EXPORT_STATUS.COMPLETE,
      hasError: state.status === EXPORT_STATUS.ERROR,
      timeRemaining: state.timeRemaining,
    };
  },

  // Check if export is in progress
  isExportInProgress: () => {
    const state = get();
    return state.status === EXPORT_STATUS.STARTING || state.status === EXPORT_STATUS.EXPORTING;
  },

  // Constants access
  EXPORT_STATUS,
}));

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    const store = useSubtitlerExportStore.getState();
    store.stopPolling();
  });
}

export default useSubtitlerExportStore;