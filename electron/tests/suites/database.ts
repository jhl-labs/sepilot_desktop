import { TestResult, TestSuiteResult } from '../../ipc/handlers/test-runner';
import { logger } from '../../services/logger';
import { databaseService } from '../../services/database';
import { vectorDBService } from '../../services/vectordb';

/**
 * Database & VectorDB 테스트 스위트
 *
 * 데이터베이스 연결 및 기본 작업을 검증합니다.
 */
export class DatabaseTestSuite {
  /**
   * 전체 테스트 실행
   */
  async run(): Promise<TestSuiteResult> {
    const startTime = Date.now();
    const tests: TestResult[] = [];

    logger.info('Running database tests...');

    // SQLite Database 테스트
    tests.push(await this.testDatabaseConnection());
    tests.push(await this.testDatabaseRead());
    tests.push(await this.testDatabaseWrite());
    tests.push(await this.testConversationTable());
    tests.push(await this.testMessageTable());

    // VectorDB 테스트
    tests.push(await this.testVectorDBConnection());
    tests.push(await this.testVectorDBCollections());

    const duration = Date.now() - startTime;
    const passed = tests.filter((t) => t.status === 'pass').length;
    const failed = tests.filter((t) => t.status === 'fail').length;
    const skipped = tests.filter((t) => t.status === 'skip').length;

    const result: TestSuiteResult = {
      id: 'database',
      name: 'Database & VectorDB Tests',
      tests,
      summary: {
        total: tests.length,
        passed,
        failed,
        skipped,
        duration,
      },
      timestamp: Date.now(),
    };

    logger.info(`Database tests completed: ${passed}/${tests.length} passed in ${duration}ms`);
    return result;
  }

  /**
   * Database 연결 테스트
   */
  private async testDatabaseConnection(): Promise<TestResult> {
    const startTime = Date.now();
    const testId = 'db-connection';

    try {
      if (!databaseService) {
        return {
          id: testId,
          name: 'Database Connection',
          status: 'fail',
          duration: Date.now() - startTime,
          message: 'Database service not initialized',
          timestamp: Date.now(),
        };
      }

      const db = databaseService.getDatabase();
      const result = db.prepare('SELECT 1 as test').get();

      if (!result || result.length === 0 || (result[0] as any).test !== 1) {
        return {
          id: testId,
          name: 'Database Connection',
          status: 'fail',
          duration: Date.now() - startTime,
          message: 'Database query failed',
          timestamp: Date.now(),
        };
      }

      return {
        id: testId,
        name: 'Database Connection',
        status: 'pass',
        duration: Date.now() - startTime,
        message: 'Database connection established',
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        id: testId,
        name: 'Database Connection',
        status: 'fail',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Database 읽기 테스트
   */
  private async testDatabaseRead(): Promise<TestResult> {
    const startTime = Date.now();
    const testId = 'db-read';

    try {
      const db = databaseService.getDatabase();
      const config = db.prepare('SELECT value FROM config WHERE key = ?').get(['app_config']) as unknown as
        | { value: string }
        | undefined;

      return {
        id: testId,
        name: 'Database Read Operation',
        status: 'pass',
        duration: Date.now() - startTime,
        message: config
          ? 'Configuration read successfully'
          : 'No configuration found (new install)',
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        id: testId,
        name: 'Database Read Operation',
        status: 'fail',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Database 쓰기 테스트 (테스트용 임시 데이터)
   */
  private async testDatabaseWrite(): Promise<TestResult> {
    const startTime = Date.now();
    const testId = 'db-write';

    try {
      const db = databaseService.getDatabase();
      const testKey = `test_${Date.now()}`;
      const testValue = JSON.stringify({ test: true, timestamp: Date.now() });

      // Write
      db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run([
        testKey,
        testValue
      ]);

      // Verify
      const result = db.prepare('SELECT value FROM config WHERE key = ?').get([testKey]) as unknown as
        | { value: string }
        | undefined;

      // Cleanup
      db.prepare('DELETE FROM config WHERE key = ?').run([testKey]);

      if (!result || result.value !== testValue) {
        return {
          id: testId,
          name: 'Database Write Operation',
          status: 'fail',
          duration: Date.now() - startTime,
          message: 'Write verification failed',
          timestamp: Date.now(),
        };
      }

      return {
        id: testId,
        name: 'Database Write Operation',
        status: 'pass',
        duration: Date.now() - startTime,
        message: 'Write and delete operations successful',
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        id: testId,
        name: 'Database Write Operation',
        status: 'fail',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Conversation 테이블 확인
   */
  private async testConversationTable(): Promise<TestResult> {
    const startTime = Date.now();
    const testId = 'db-conversation-table';

    try {
      const db = databaseService.getDatabase();
      const result = db
        .prepare(
          "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='conversations'"
        )
        .get();

      if (result.length === 0 || (result[0] as any).count === 0) {
        return {
          id: testId,
          name: 'Conversation Table',
          status: 'fail',
          duration: Date.now() - startTime,
          message: 'Conversations table does not exist',
          timestamp: Date.now(),
        };
      }

      // Count conversations
      const countResult = db.prepare('SELECT COUNT(*) as count FROM conversations').get();

      return {
        id: testId,
        name: 'Conversation Table',
        status: 'pass',
        duration: Date.now() - startTime,
        message: `Conversations table exists with ${(countResult[0] as any).count} record(s)`,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        id: testId,
        name: 'Conversation Table',
        status: 'fail',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Message 테이블 확인
   */
  private async testMessageTable(): Promise<TestResult> {
    const startTime = Date.now();
    const testId = 'db-message-table';

    try {
      const db = databaseService.getDatabase();
      const result = db
        .prepare(
          "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='messages'"
        )
        .get();

      if (result.length === 0 || (result[0] as any).count === 0) {
        return {
          id: testId,
          name: 'Message Table',
          status: 'fail',
          duration: Date.now() - startTime,
          message: 'Messages table does not exist',
          timestamp: Date.now(),
        };
      }

      // Count messages
      const countResult = db.prepare('SELECT COUNT(*) as count FROM messages').get();

      return {
        id: testId,
        name: 'Message Table',
        status: 'pass',
        duration: Date.now() - startTime,
        message: `Messages table exists with ${(countResult[0] as any).count} record(s)`,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        id: testId,
        name: 'Message Table',
        status: 'fail',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      };
    }
  }

  /**
   * VectorDB 연결 테스트
   */
  private async testVectorDBConnection(): Promise<TestResult> {
    const startTime = Date.now();
    const testId = 'vectordb-connection';

    try {
      if (!vectorDBService) {
        return {
          id: testId,
          name: 'VectorDB Connection',
          status: 'fail',
          duration: Date.now() - startTime,
          message: 'VectorDB service not initialized',
          timestamp: Date.now(),
        };
      }

      // VectorDB가 초기화되어 있는지 확인
      const collections = await vectorDBService.listCollections();

      return {
        id: testId,
        name: 'VectorDB Connection',
        status: 'pass',
        duration: Date.now() - startTime,
        message: 'VectorDB service is operational',
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        id: testId,
        name: 'VectorDB Connection',
        status: 'fail',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      };
    }
  }

  /**
   * VectorDB 컬렉션 확인
   */
  private async testVectorDBCollections(): Promise<TestResult> {
    const startTime = Date.now();
    const testId = 'vectordb-collections';

    try {
      const collections = await vectorDBService.listCollections();

      return {
        id: testId,
        name: 'VectorDB Collections',
        status: 'pass',
        duration: Date.now() - startTime,
        message: `Found ${collections.length} collection(s)${collections.length > 0 ? `: ${collections.join(', ')}` : ''}`,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        id: testId,
        name: 'VectorDB Collections',
        status: 'fail',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      };
    }
  }
}

// Singleton instance
export const databaseTestSuite = new DatabaseTestSuite();
