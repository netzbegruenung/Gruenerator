/**
 * Tests for searchRetryStrategy
 * Run with: npx tsx apps/api/services/search/searchRetryStrategy.test.ts
 */

import { withRetry, isRecoverableError, CircuitBreaker } from './searchRetryStrategy.js';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => Promise<void> | void) {
  return Promise.resolve(fn())
    .then(() => {
      passed++;
      console.log(`  ✓ ${name}`);
    })
    .catch((err: any) => {
      failed++;
      console.error(`  ✗ ${name}: ${err.message}`);
    });
}

function expect(actual: any) {
  return {
    toBe(expected: any) {
      if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
  };
}

async function runTests() {
  console.log('searchRetryStrategy Tests');
  console.log('========================');

  // isRecoverableError
  console.log('\nisRecoverableError:');

  await test('Timeout is recoverable', () => {
    expect(isRecoverableError(new Error('Request timed out'))).toBe(true);
  });

  await test('ECONNREFUSED is recoverable', () => {
    expect(isRecoverableError(new Error('ECONNREFUSED'))).toBe(true);
  });

  await test('502 Bad Gateway is recoverable', () => {
    expect(isRecoverableError(new Error('502 Bad Gateway'))).toBe(true);
  });

  await test('404 Not Found is NOT recoverable', () => {
    expect(isRecoverableError(new Error('404 Not Found'))).toBe(false);
  });

  await test('401 Unauthorized is NOT recoverable', () => {
    expect(isRecoverableError(new Error('401 Unauthorized'))).toBe(false);
  });

  // withRetry
  console.log('\nwithRetry:');

  await test('Succeeds on first try', async () => {
    let calls = 0;
    const result = await withRetry(async () => { calls++; return 'ok'; }, { maxRetries: 2, delayMs: 10 });
    expect(result).toBe('ok');
    expect(calls).toBe(1);
  });

  await test('Retries on recoverable error and succeeds', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      if (calls === 1) throw new Error('Request timed out');
      return 'ok';
    }, { maxRetries: 1, delayMs: 10 });
    expect(result).toBe('ok');
    expect(calls).toBe(2);
  });

  await test('Does not retry on non-recoverable error', async () => {
    let calls = 0;
    try {
      await withRetry(async () => {
        calls++;
        throw new Error('404 Not Found');
      }, { maxRetries: 2, delayMs: 10 });
      throw new Error('Should have thrown');
    } catch (err: any) {
      expect(calls).toBe(1);
      expect(err.message).toBe('404 Not Found');
    }
  });

  await test('Exhausts retries on persistent recoverable error', async () => {
    let calls = 0;
    try {
      await withRetry(async () => {
        calls++;
        throw new Error('Request timed out');
      }, { maxRetries: 2, delayMs: 10 });
      throw new Error('Should have thrown');
    } catch {
      expect(calls).toBe(3); // 1 initial + 2 retries
    }
  });

  // CircuitBreaker
  console.log('\nCircuitBreaker:');

  await test('Starts closed', () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeMs: 1000 });
    expect(cb.isOpen()).toBe(false);
  });

  await test('Opens after threshold failures', () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeMs: 1000 });
    cb.recordFailure();
    expect(cb.isOpen()).toBe(false);
    cb.recordFailure();
    expect(cb.isOpen()).toBe(true);
  });

  await test('Resets on success', () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeMs: 1000 });
    cb.recordFailure();
    cb.recordSuccess();
    cb.recordFailure();
    expect(cb.isOpen()).toBe(false); // Reset by success, only 1 failure now
  });

  await test('Auto-resets after timeout', () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeMs: 50 });
    cb.recordFailure();
    expect(cb.isOpen()).toBe(true);
    // Wait for reset
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(cb.isOpen()).toBe(false);
        resolve();
      }, 60);
    });
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests();
