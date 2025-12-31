let embedder = null;

export async function initEmbedder() {
  if (embedder) {
    return embedder;
  }

  try {
    // Dynamischer Import für fastembed
    const { EmbeddingModel, FlagEmbedding } = await import('fastembed');

    embedder = await FlagEmbedding.init({
      model: EmbeddingModel.BGESmallENV15
    });

    console.error('[Embeddings] FastEmbed initialisiert');
    return embedder;
  } catch (error) {
    console.error('[Embeddings] Fehler bei Initialisierung:', error.message);
    throw error;
  }
}

export async function generateEmbedding(text) {
  const model = await initEmbedder();

  // FastEmbed gibt einen AsyncGenerator zurück
  const embeddings = [];
  for await (const embedding of model.embed([text])) {
    embeddings.push(embedding);
  }

  if (embeddings.length === 0) {
    throw new Error('Keine Embedding generiert');
  }

  return Array.from(embeddings[0]);
}

export async function generateEmbeddings(texts) {
  const model = await initEmbedder();

  const embeddings = [];
  for await (const embedding of model.embed(texts)) {
    embeddings.push(Array.from(embedding));
  }

  return embeddings;
}
