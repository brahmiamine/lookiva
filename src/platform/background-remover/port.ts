/** Removes the background of a garment photo. Only a LOCAL adapter exists; a cloud one needs CLOUD_BACKGROUND_REMOVAL consent + audit (not built). */
export interface BackgroundRemover {
  /** Returns a PNG with transparency. Throws when it cannot process the image. */
  remove(image: Uint8Array): Promise<Uint8Array>;
}
