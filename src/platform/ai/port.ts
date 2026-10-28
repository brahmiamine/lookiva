export interface Ai {
  complete(prompt: string): Promise<string>;
}
