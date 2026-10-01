export interface HttpFetcher {
  get(url: string): Promise<string>;
}
