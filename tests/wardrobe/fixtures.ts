import { crc32 } from 'node:zlib';
import sharp from 'sharp';

/** Left half red, right half blue, so orientation is observable. Optional GPS EXIF / orientation tag. */
export async function jpeg(w = 60, h = 40, o: { gps?: boolean; orientation?: number } = {}): Promise<Buffer> {
  const left = await sharp({ create: { width: w / 2, height: h, channels: 3, background: '#ff0000' } }).png().toBuffer();
  let p = sharp({ create: { width: w, height: h, channels: 3, background: '#0000ff' } }).composite([{ input: left, left: 0, top: 0 }]).jpeg();
  if (o.orientation) p = p.withMetadata({ orientation: o.orientation });
  if (o.gps) p = p.withExif({ IFD0: { Make: 'TestCam' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '48/1 51/1 30/1', GPSLongitudeRef: 'E', GPSLongitude: '2/1 21/1 7/1' } });
  return p.toBuffer();
}
export const png = (w = 30, h = 30) => sharp({ create: { width: w, height: h, channels: 4, background: '#ffffff' } }).png().toBuffer();
export const webp = (w = 30, h = 30) => sharp({ create: { width: w, height: h, channels: 3, background: '#00ff00' } }).webp().toBuffer();

/** A syntactically valid PNG header claiming 60000x60000 px (3.6 GP) followed by nothing: a decompression-bomb stand-in. */
export function pngBomb(): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const t = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(t));
    return Buffer.concat([len, t, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(60000, 0);
  ihdr.writeUInt32BE(60000, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IEND', Buffer.alloc(0))]);
}

export const heic = () => Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(32)]);
