import { chunkArray, runPromisesInBatches } from '@/lib/utils/batch';

describe('batch utils', () => {
  describe('chunkArray', () => {
    it('should split an array into fixed-size chunks', () => {
      expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('should normalize chunk size to at least 1 and floor decimals', () => {
      expect(chunkArray([1, 2, 3], 0)).toEqual([[1], [2], [3]]);
      expect(chunkArray([1, 2, 3, 4], 2.9)).toEqual([[1, 2], [3, 4]]);
      expect(chunkArray([1, 2], -10)).toEqual([[1], [2]]);
    });
  });

  describe('runPromisesInBatches', () => {
    it('should process items in batch windows and preserve result order', async () => {
      const started: number[] = [];

      const resultPromise = runPromisesInBatches([1, 2, 3, 4], 2, async (item) => {
        started.push(item);
        await new Promise((resolve) => setTimeout(resolve, 20));
        return item * 10;
      });

      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(started).toEqual([1, 2]);

      const results = await resultPromise;

      expect(started).toEqual([1, 2, 3, 4]);
      expect(results).toEqual([
        { status: 'fulfilled', value: 10 },
        { status: 'fulfilled', value: 20 },
        { status: 'fulfilled', value: 30 },
        { status: 'fulfilled', value: 40 },
      ]);
    });

    it('should collect rejected promises without throwing', async () => {
      const results = await runPromisesInBatches([1, 2, 3], 2, async (item) => {
        if (item === 2) {
          throw new Error('failed-item');
        }
        return item;
      });

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ status: 'fulfilled', value: 1 });
      expect(results[1].status).toBe('rejected');
      expect(results[1]).toMatchObject({
        status: 'rejected',
        reason: expect.objectContaining({ message: 'failed-item' }),
      });
      expect(results[2]).toEqual({ status: 'fulfilled', value: 3 });
    });
  });
});
