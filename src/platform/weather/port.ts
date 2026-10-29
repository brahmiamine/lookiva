export type Reliability = 'HIGH' | 'MEDIUM' | 'LOW';
/** One normalized local hour of a day. precipProbability is 0..100. */
export type WeatherHour = { hour: number; tempC: number; feelsLikeC: number; precipProbability: number; windKph: number; reliability: Reliability };
export type WeatherQuery = { latitude: number; longitude: number; timezone: string; /** Local day, YYYY-MM-DD. */ date: string };
export type WeatherForecast = { provider: string; issuedAt: Date; hours: WeatherHour[] };

export interface WeatherProvider {
  /** Forecast of one local day. REJECTS when the provider fails or has nothing: callers never invent a forecast. */
  forecast(q: WeatherQuery): Promise<WeatherForecast>;
}
/** Kept for the platform bundle. */
export type Weather = WeatherProvider;
