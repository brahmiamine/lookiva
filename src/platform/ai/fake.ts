import type { Ai } from './port';

export class FakeAi implements Ai {
  async complete(): Promise<string> {
    return 'fake completion';
  }
}
