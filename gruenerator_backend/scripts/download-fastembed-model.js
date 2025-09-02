#!/usr/bin/env node

import { FlagEmbedding, EmbeddingModel } from 'fastembed';
import path from 'path';
import fs from 'fs';

/**
 * Script to pre-download FastEmbed models during npm install
 * This ensures models are available when the application starts
 */
async function downloadModel() {
  const cacheDir = path.resolve(process.cwd(), 'fastembed_cache');
  const modelName = EmbeddingModel.MLE5Large;
  
  try {
    console.log(`[FastEmbed Download] Starting download of model: ${modelName}`);
    console.log(`[FastEmbed Download] Cache directory: ${cacheDir}`);
    
    // Ensure cache directory exists
    if (!fs.existsSync(cacheDir)) {
      console.log(`[FastEmbed Download] Creating cache directory...`);
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    
    // Initialize model - this will trigger download if not present
    console.log(`[FastEmbed Download] Initializing model (this will download if needed)...`);
    const model = await FlagEmbedding.init({
      model: modelName,
      maxLength: 512,
      showDownloadProgress: true,
      cacheDir: cacheDir
    });
    
    console.log(`[FastEmbed Download] ✅ Model downloaded and initialized successfully!`);
    console.log(`[FastEmbed Download] Model cached in: ${cacheDir}`);
    
    // Clean up
    if (model && model.dispose) {
      model.dispose();
    }
    
  } catch (error) {
    console.error(`[FastEmbed Download] ❌ Failed to download model:`, error.message);
    
    // Try fallback model
    try {
      console.log(`[FastEmbed Download] Attempting fallback model: ${EmbeddingModel.BGESmallENV15}`);
      
      const fallbackModel = await FlagEmbedding.init({
        model: EmbeddingModel.BGESmallENV15,
        maxLength: 512,
        showDownloadProgress: true,
        cacheDir: cacheDir
      });
      
      console.log(`[FastEmbed Download] ✅ Fallback model downloaded successfully!`);
      
      // Clean up
      if (fallbackModel && fallbackModel.dispose) {
        fallbackModel.dispose();
      }
      
    } catch (fallbackError) {
      console.error(`[FastEmbed Download] ❌ Fallback model download also failed:`, fallbackError.message);
      console.log(`[FastEmbed Download] Models will be downloaded at runtime instead.`);
    }
  }
}

// Run the download
downloadModel().catch(error => {
  console.error(`[FastEmbed Download] Unexpected error:`, error);
  process.exit(1);
});