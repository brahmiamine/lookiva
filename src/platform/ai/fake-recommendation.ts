import type { AiRerankRequest, AiRerankResponse, OptionalRecommendationAI } from './recommendation';

export type FakeRecoAiMode = 'ok' | 'reverse' | 'garbage' | 'foreign' | 'throw' | 'hang';
/** No network. `reverse` re-orders the candidates; `garbage`/`foreign` return unusable output (also an invented foreign id). */
export class FakeRecommendationAi implements OptionalRecommendationAI {
  calls = 0;
  lastRequest: AiRerankRequest | null = null;
  constructor(public mode: FakeRecoAiMode = 'reverse') {}

  async rerank(req: AiRerankRequest, opts: { signal: AbortSignal }): Promise<AiRerankResponse> {
    this.calls++;
    this.lastRequest = structuredClone(req);
    const ids = req.candidates.map((c) => c.garmentIds);
    switch (this.mode) {
      case 'throw': throw new Error('fake ai failure');
      case 'hang': return new Promise((_, rej) => opts.signal.addEventListener('abort', () => rej(new Error('aborted'))));
      case 'garbage': return { ranking: 'nope' as unknown as string[][] };
      case 'foreign': return { ranking: [['00000000-0000-4000-8000-0000000000ff'], ...ids] };
      case 'ok': return { ranking: ids };
      default: return { ranking: [...ids].reverse() };
    }
  }
}
