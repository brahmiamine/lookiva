import sharp from 'sharp';
import type { BackgroundRemover } from './port';

/**
 * Deterministic local stand-in: near-white pixels (all channels >= threshold) become transparent. It is NOT a model;
 * a real local/cloud remover replaces it behind the same port.
 */
export class WhiteKeyRemover implements BackgroundRemover {
  constructor(private readonly threshold = 245) {}

  async remove(image: Uint8Array): Promise<Uint8Array> {
    const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 4) {
      if ((data[i] ?? 0) >= this.threshold && (data[i + 1] ?? 0) >= this.threshold && (data[i + 2] ?? 0) >= this.threshold) data[i + 3] = 0;
    }
    return sharp(data, { raw: info }).png().toBuffer();
  }
}
