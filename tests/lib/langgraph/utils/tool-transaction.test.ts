import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  createToolExecutionTransaction,
  rollbackToolExecutionTransaction,
} from '@/lib/domains/agent/utils/tool-transaction';

describe('tool-transaction', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tool-transaction-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('restores original file content after rollback', async () => {
    const filePath = path.join(tempDir, 'a.txt');
    await fs.writeFile(filePath, 'before', 'utf-8');

    const transaction = await createToolExecutionTransaction(
      [{ arguments: { path: 'a.txt' } }],
      tempDir
    );
    expect(transaction).not.toBeNull();

    await fs.writeFile(filePath, 'after', 'utf-8');
    const rollbackResult = await rollbackToolExecutionTransaction(transaction!);
    const content = await fs.readFile(filePath, 'utf-8');

    expect(rollbackResult.errors).toHaveLength(0);
    expect(content).toBe('before');
  });

  it('deletes newly created file when snapshot said file did not exist', async () => {
    const transaction = await createToolExecutionTransaction(
      [{ arguments: { path: 'new-file.txt' } }],
      tempDir
    );
    expect(transaction).not.toBeNull();

    const createdPath = path.join(tempDir, 'new-file.txt');
    await fs.writeFile(createdPath, 'created', 'utf-8');

    await rollbackToolExecutionTransaction(transaction!);
    const exists = await fs
      .access(createdPath)
      .then(() => true)
      .catch(() => false);

    expect(exists).toBe(false);
  });
});
