import { logger } from "../utils/logger.js";

// Dynamic import to handle @xenova/transformers loading
let pipeline: any;
let embeddingPipeline: any;

export async function initEmbeddings(): Promise<void> {
  logger.info("Loading embedding model (first run downloads ~80MB)...");
  const { pipeline: pipelineFn } = await import("@xenova/transformers");
  pipeline = pipelineFn;
  embeddingPipeline = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  logger.info("Embedding model loaded (384 dimensions)");
}

export async function generateEmbedding(text: string): Promise<Float32Array> {
  if (!embeddingPipeline) {
    await initEmbeddings();
  }

  const output = await embeddingPipeline(text, {
    pooling: "mean",
    normalize: true,
  });

  // output.data is a Float32Array of 384 dimensions
  return new Float32Array(output.data);
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
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
