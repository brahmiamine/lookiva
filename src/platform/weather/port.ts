export interface Weather {
  // Signature refined in phase 06.
  forecast(q: { lat: number; lon: number; timezone: string; from: Date; to: Date }): Promise<unknown | null>;
}
