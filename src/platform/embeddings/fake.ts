import { createHash } from 'node:crypto';
import type { Embeddings } from './port';

export class FakeEmbeddings implements Embeddings {
  readonly modelId = 'fake';
  readonly dimensions = 8;

  async embed(texts: string[]): Promise<number[][]> {
    // Deterministic: one byte of the SHA-256 per dimension, scaled to [0, 1].
    return texts.map((t) => Array.from(createHash('sha256').update(t).digest().subarray(0, this.dimensions), (b) => b / 255));
  }
}
