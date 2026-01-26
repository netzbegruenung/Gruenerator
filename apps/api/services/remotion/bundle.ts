/**
 * Remotion Bundle Service
 *
 * Manages bundling of Remotion compositions for rendering
 */

import { bundle } from '@remotion/bundler';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import fs from 'fs/promises';
import { createLogger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const log = createLogger('remotion-bundle');

const ENTRY_POINT = path.resolve(__dirname, './index.js');
export const BUNDLE_CACHE_DIR = path.resolve(__dirname, '../../uploads/remotion-bundle');
const PUBLIC_DIR = path.resolve(__dirname, '../../public'); // Contains fonts directory

let cachedBundleLocation: string | null = null;
let bundlePromise: Promise<string> | null = null;

async function webpackOverride(config: any): Promise<any> {
  return {
    ...config,
    resolve: {
      ...config.resolve,
      alias: {
        ...config.resolve?.alias,
      },
    },
  };
}

async function ensureBundleDir(): Promise<void> {
  try {
    await fs.mkdir(BUNDLE_CACHE_DIR, { recursive: true });
  } catch (error: any) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

export async function createBundle(): Promise<string> {
  if (cachedBundleLocation) {
    try {
      await fs.access(cachedBundleLocation);
      log.debug('Using cached bundle:', cachedBundleLocation);
      return cachedBundleLocation;
    } catch {
      log.info('Cached bundle not found, creating new one');
      cachedBundleLocation = null;
    }
  }

  if (bundlePromise) {
    log.debug('Bundle creation already in progress, waiting...');
    return bundlePromise;
  }

  bundlePromise = (async () => {
    try {
      await ensureBundleDir();

      log.info('Creating Remotion bundle...');
      const startTime = Date.now();

      const bundleLocation = await bundle({
        entryPoint: ENTRY_POINT,
        webpackOverride,
        outDir: BUNDLE_CACHE_DIR,
        publicPath: './',
        publicDir: PUBLIC_DIR, // Include fonts and other static assets
      });

      const duration = Date.now() - startTime;
      log.info(`Remotion bundle created in ${duration}ms: ${bundleLocation}`);

      cachedBundleLocation = bundleLocation;
      return bundleLocation;
    } catch (error: any) {
      log.error('Failed to create Remotion bundle:', error.message);
      throw error;
    } finally {
      bundlePromise = null;
    }
  })();

  return bundlePromise;
}

export async function getBundle(): Promise<string> {
  return createBundle();
}

export async function invalidateBundle(): Promise<void> {
  log.info('Invalidating Remotion bundle cache');
  cachedBundleLocation = null;

  try {
    await fs.rm(BUNDLE_CACHE_DIR, { recursive: true, force: true });
    log.debug('Bundle cache directory removed');
  } catch (error: any) {
    log.warn('Failed to remove bundle cache:', error.message);
  }
}

export async function initializeBundle(): Promise<void> {
  try {
    log.info('Pre-warming Remotion bundle...');
    await createBundle();
    log.info('Remotion bundle ready');
  } catch (error: any) {
    log.error('Failed to pre-warm bundle:', error.message);
  }
}
