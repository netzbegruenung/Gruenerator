const { parentPort } = require('worker_threads');
const { Anthropic } = require('@anthropic-ai/sdk');
require('dotenv').config();

class ConcurrentRequestManager {
  constructor() {
    this.queue = [];
    this.activeRequests = new Set();
    this.maxConcurrentRequests = 25;  // Erhöht auf 25 gleichzeitige Anfragen
    this.rateLimit = {
      requests: new Map(),
      maxRequests: 500,   // Erhöht auf 500 Anfragen
      timeWindow: 60000   // Pro Minute (60000 ms)
    };
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000, // Basis-Verzögerung in Millisekunden
      maxDelay: 30000  // Maximale Verzögerung in Millisekunden
    };
  }

  async add(data) {
    return new Promise((resolve, reject) => {
      const request = { data, resolve, reject };
      this.queue.push(request);
      this.processQueue();
    });
  }

  async processQueue() {
    // Wenn zu viele aktive Requests, warte
    if (this.activeRequests.size >= this.maxConcurrentRequests) {
      return;
    }

    // Verarbeite alle wartenden Anfragen
    while (this.queue.length > 0 && this.activeRequests.size < this.maxConcurrentRequests) {
      if (!this.checkRateLimit()) {
        // Warte und versuche später erneut
        setTimeout(() => this.processQueue(), 100);
        return;
      }

      const request = this.queue.shift();
      const requestId = Date.now() + Math.random();
      this.activeRequests.add(requestId);

      this.processRequest(request, requestId)
        .finally(() => {
          this.activeRequests.delete(requestId);
          this.processQueue(); // Verarbeite weitere Anfragen
        });
    }
  }

  async processRequest(request, requestId) {
    let retryCount = 0;
    
    while (true) {
      try {
        const result = await processAIRequest(request.data);
        request.resolve(result);
        return;
      } catch (error) {
        if (this.shouldRetry(error, retryCount)) {
          const delay = this.calculateBackoff(retryCount);
          console.log(`Retry ${retryCount + 1} nach ${delay}ms für Request ${requestId}`);
          await this.wait(delay);
          retryCount++;
        } else {
          request.reject(error);
          return;
        }
      }
    }
  }

  checkRateLimit() {
    const now = Date.now();
    const windowStart = now - this.rateLimit.timeWindow;
    
    // Bereinige alte Einträge
    for (const [timestamp] of this.rateLimit.requests) {
      if (timestamp < windowStart) {
        this.rateLimit.requests.delete(timestamp);
      }
    }

    if (this.rateLimit.requests.size >= this.rateLimit.maxRequests) {
      return false;
    }

    this.rateLimit.requests.set(now, true);
    return true;
  }

  shouldRetry(error, retryCount) {
    // Definiere retry-würdige Fehler
    const retryableErrors = [
      'rate_limit',
      'timeout',
      'network_error',
      'internal_server_error',
      '429',
      '500',
      '503'
    ];

    return (
      retryCount < this.retryConfig.maxRetries &&
      retryableErrors.some(errType => 
        error.message.toLowerCase().includes(errType.toLowerCase()) ||
        error.status === parseInt(errType)
      )
    );
  }

  calculateBackoff(retryCount) {
    // Exponentieller Backoff mit Jitter
    const exponentialDelay = Math.min(
      this.retryConfig.maxDelay,
      this.retryConfig.baseDelay * Math.pow(2, retryCount)
    );
    
    // Füge zufälligen Jitter hinzu (±25%)
    const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
    return Math.floor(exponentialDelay + jitter);
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

const requestManager = new ConcurrentRequestManager();
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY
});

async function processAIRequest(data, retryCount = 0) {
  const maxRetries = 3;
  const { type, prompt, options = {}, systemPrompt, messages } = data;
  
  try {
    const defaultConfig = {
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 4000,
      temperature: 0.3
    };

    // Typ-spezifische Konfigurationen
    const typeConfigs = {
      'presse': {
        system: "Du bist ein erfahrener Pressesprecher...",
        temperature: 0.4
      },
      'social': {
        system: "Du bist ein Social Media Manager...",
        temperature: 0.5
      },
      'rede': {
        system: "Du bist ein Redenschreiber...",
        temperature: 0.3
      },
      'antragsversteher': {
        system: "Du bist ein Experte für politische Anträge...",
        temperature: 0.2
      },
      'wahlprogramm': {
        system: "Du bist ein Experte für Wahlprogramme...",
        temperature: 0.2
      },
      'text_adjustment': {
        system: "Du bist ein Experte für Textoptimierung...",
        temperature: 0.3
      }
    };

    // Kombiniere Default-Config mit Typ-spezifischer Config und benutzerdefinierten Optionen
    let requestConfig = {
      ...defaultConfig,
      ...(typeConfigs[type] || {}),
      ...options,
      system: systemPrompt || (typeConfigs[type]?.system || defaultConfig.system)
    };

    if (messages) {
      requestConfig.messages = messages;
    } else if (prompt) {
      requestConfig.messages = [{
        role: "user",
        content: prompt
      }];
    }

    // Spezielle Behandlung für bestimmte Typen
    if (type === 'antragsversteher' && options.betas) {
      requestConfig.betas = options.betas;
    }

    const response = await anthropic.messages.create(requestConfig);

    if (response?.content?.length > 0) {
      const textContent = response.content
        .filter(item => item.type === 'text')
        .map(item => item.text)
        .join('');
      
      return {
        success: true,
        result: textContent,
        type: type // Typ zurückgeben für besseres Tracking
      };
    }

    throw new Error('Ungültiges Antwortformat von der API');
  } catch (error) {
    console.error(`AI Worker Error (${type}):`, error.message);
    
    if (retryCount < maxRetries && (
      error.message.includes('rate_limit') ||
      error.message.includes('timeout') ||
      error.status === 429
    )) {
      const delay = Math.pow(2, retryCount) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      return processAIRequest(data, retryCount + 1);
    }
    
    throw error;
  }
}

parentPort.on('message', async (data) => {
  try {
    const result = await requestManager.add(data);
    parentPort.postMessage(result);
  } catch (error) {
    parentPort.postMessage({
      success: false,
      error: error.message
    });
  }
});