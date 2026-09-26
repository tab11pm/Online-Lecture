const retryDelays = [5_000, 15_000, 30_000];

export function nextRetryDelay(previousRetries: number): number | undefined {
  return retryDelays[previousRetries];
}
