/**
 * Optional re-ranking AI for outfit recommendations. PRIVACY CONTRACT: the request holds only opaque garment ids and
 * categorical attributes. Photos, names, notes, prices and any free text never leave the server (a test asserts the shape).
 */
export type AiGarment = { id: string; role: string; category: string; warmth: string; rain: string; windproof: string; breathability: string; layering: string; colors: string[]; styles: string[] };
export type AiRerankRequest = {
  context: { occasion: string; tempBand: string; rain: boolean; windy: boolean };
  garments: AiGarment[];
  /** Candidate compositions built by the rules; the AI may only order these. */
  candidates: { garmentIds: string[] }[];
};
/** Compositions best first, as garment id lists. Anything else is ignored by the caller. */
export type AiRerankResponse = { ranking: string[][] };

export interface OptionalRecommendationAI {
  rerank(req: AiRerankRequest, opts: { signal: AbortSignal }): Promise<AiRerankResponse>;
}
