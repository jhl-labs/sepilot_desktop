export function chunkArray<T>(items: readonly T[], chunkSize: number): T[][] {
  const safeChunkSize = Math.max(1, Math.floor(chunkSize));
  const chunks: T[][] = [];

  for (let i = 0; i < items.length; i += safeChunkSize) {
    chunks.push(items.slice(i, i + safeChunkSize));
  }

  return chunks;
}

export async function runPromisesInBatches<TInput, TResult>(
  items: readonly TInput[],
  batchSize: number,
  task: (item: TInput) => Promise<TResult>
): Promise<Array<PromiseSettledResult<TResult>>> {
  const settledResults: Array<PromiseSettledResult<TResult>> = [];

  for (const batch of chunkArray(items, batchSize)) {
    const batchResults = await Promise.allSettled(batch.map((item) => task(item)));
    settledResults.push(...batchResults);
  }

  return settledResults;
}
