import { logger } from "../utils/logger.js";

// Dynamic import to handle @xenova/transformers loading
let embeddingPipeline: any;
let initPromise: Promise<void> | null = null;

export async function initEmbeddings(): Promise<void> {
  logger.info("Loading embedding model (first run downloads ~80MB)...");
  const { pipeline: pipelineFn } = await import("@xenova/transformers");
  embeddingPipeline = await pipelineFn("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  logger.info("Embedding model loaded (384 dimensions)");
}

export async function generateEmbedding(text: string): Promise<Float32Array> {
  if (!embeddingPipeline) {
    // Singleton promise prevents concurrent model downloads
    if (!initPromise) {
      initPromise = initEmbeddings().catch((err) => {
        initPromise = null; // Reset on failure so next call retries
        throw err;
      });
    }
    await initPromise;
  }

  const output = await embeddingPipeline(text, {
    pooling: "mean",
    normalize: true,
  });

  const result = new Float32Array(output.data);

  // Validate embedding dimensions
  if (result.length !== 384) {
    throw new Error(`Unexpected embedding dimension: ${result.length} (expected 384)`);
  }

  return result;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dotProduct / denom;
}
