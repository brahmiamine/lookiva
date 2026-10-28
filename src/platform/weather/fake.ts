import type { Weather } from './port';

export class FakeWeather implements Weather {
  async forecast(): Promise<unknown | null> {
    return null;
  }
}
