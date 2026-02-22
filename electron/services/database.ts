import initSqlJs, { Database } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { Conversation, Message, Activity } from '../../types';
import { Persona } from '../../types/persona';
import { ScheduledTask, ExecutionRecord, ExecutionHistoryQuery } from '../../types/scheduler';

class DatabaseService {
  private db: Database | null = null;
  private dbPath: string = '';
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private firstDirtyAt = 0;
  private hasDirtyChanges = false;

  private readonly saveDebounceMs = 300;
  private readonly maxSaveDelayMs = 1000;
  private readonly maxSearchMessageRows = 2000;
  private readonly maxMatchedMessagesPerConversation = 20;

  async initialize() {
    const userDataPath = app.getPath('userData');

    // Ensure userData directory exists
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }

    this.dbPath = path.join(userDataPath, 'sepilot.db');

    console.log('[Database] Initializing database at:', this.dbPath);

    const SQL = await initSqlJs({
      locateFile: (file) => {
        // In production, the wasm file should be in the app's resources
        // In development, use node_modules from project root
        const isDev = !app.isPackaged;

        if (isDev) {
          // Development: use node_modules from project root
          return path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file);
        } else {
          // Production: WASM file is bundled in node_modules by electron-builder
          // Try multiple possible locations
          const possiblePaths = [
            path.join(
              process.resourcesPath,
              'app.asar.unpacked',
              'node_modules',
              'sql.js',
              'dist',
              file
            ),
            path.join(process.resourcesPath, 'app', 'node_modules', 'sql.js', 'dist', file),
            path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', file),
          ];

          for (const testPath of possiblePaths) {
            if (fs.existsSync(testPath)) {
              console.log('[Database] Found WASM file at:', testPath);
              return testPath;
            }
          }

          // Fallback to default
          console.warn('[Database] WASM file not found, using default path');
          return path.join(
            process.resourcesPath,
            'app.asar.unpacked',
            'node_modules',
            'sql.js',
            'dist',
            file
          );
        }
      },
    });

    // Load existing database or create new one
    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
    }

    this.createTables();
    this.saveDatabase(true);
  }

  /**
   * 대기 중인 변경사항을 즉시 디스크에 기록합니다.
   * 스케줄러 등 외부 서비스에서 DB 쓰기 직후 즉각 반영이 필요할 때 사용합니다.
   */
  flushNow(): void {
    this.saveDatabase(true);
  }

  private flushDatabaseToDisk() {
    if (!this.db || !this.hasDirtyChanges) {
      return;
    }

    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
    this.hasDirtyChanges = false;
    this.firstDirtyAt = 0;
  }

  private saveDatabase(immediate = false) {
    if (!this.db) {
      return;
    }

    this.hasDirtyChanges = true;

    if (immediate) {
      if (this.saveTimeout) {
        clearTimeout(this.saveTimeout);
        this.saveTimeout = null;
      }
      this.flushDatabaseToDisk();
      return;
    }

    const now = Date.now();
    if (!this.firstDirtyAt) {
      this.firstDirtyAt = now;
    }

    const elapsed = now - this.firstDirtyAt;
    const delay = elapsed >= this.maxSaveDelayMs ? 0 : this.saveDebounceMs;

    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = null;
      this.flushDatabaseToDisk();
    }, delay);
  }

  private parseChatSettings(
    chatSettingsJson: string | null
  ): Conversation['chatSettings'] | undefined {
    if (!chatSettingsJson) {
      return undefined;
    }

    try {
      return JSON.parse(chatSettingsJson);
    } catch (error) {
      console.error('Failed to parse chatSettings:', error);
      return undefined;
    }
  }

  private parseJsonField<T>(value: unknown, fieldName: string): T | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    try {
      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`Failed to parse ${fieldName}:`, error);
      return undefined;
    }
  }

  private mapConversationRow(row: readonly unknown[]): Conversation {
    return {
      id: row[0] as string,
      title: row[1] as string,
      created_at: row[2] as number,
      updated_at: row[3] as number,
      chatSettings: this.parseChatSettings((row[4] as string | null) ?? null),
    };
  }

  private mapMessageRow(row: readonly unknown[]): Message {
    return {
      id: row[0] as string,
      conversation_id: row[1] as string,
      role: row[2] as Message['role'],
      content: row[3] as string,
      created_at: row[4] as number,
      tool_calls: this.parseJsonField(row[5], 'tool_calls'),
      tool_results: this.parseJsonField(row[6], 'tool_results'),
      images: this.parseJsonField(row[7], 'images'),
      referenced_documents: this.parseJsonField(row[8], 'referenced_documents'),
    };
  }

  private escapeLikeQuery(value: string): string {
    return value.replace(/[\\%_]/g, (match) => `\\${match}`);
  }

  private appendMatchedMessage(
    resultMap: Map<string, { conversation: Conversation; matchedMessages: Message[] }>,
    conversation: Conversation,
    message: Message
  ) {
    const existing = resultMap.get(conversation.id);
    if (existing) {
      if (existing.matchedMessages.length < this.maxMatchedMessagesPerConversation) {
        existing.matchedMessages.push(message);
      }
      return;
    }

    resultMap.set(conversation.id, {
      conversation,
      matchedMessages: [message],
    });
  }

  /**
   * Get database instance (for health checks and tests)
   */
  getDatabase(): Database {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }

  private createTables() {
    if (!this.db) throw new Error('Database not initialized');

    // Conversations table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        chatSettings TEXT
      )
    `);

    // Messages table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        tool_calls TEXT,
        tool_results TEXT,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      )
    `);

    // Settings table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    // Activities table (도구 실행 이력 - 컨텍스트와 분리)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS activities (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        tool_args TEXT NOT NULL,
        result TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        duration_ms INTEGER,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      )
    `);

    // Personas table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS personas (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        systemPrompt TEXT NOT NULL,
        avatar TEXT,
        color TEXT,
        isBuiltin INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // Skills table (Skills 마켓플레이스 시스템)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        manifest TEXT NOT NULL,
        source TEXT NOT NULL,
        local_path TEXT NOT NULL,
        installed_at INTEGER NOT NULL,
        enabled INTEGER DEFAULT 1,
        usage_count INTEGER DEFAULT 0,
        last_used_at INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);

    // Skill usage history table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS skill_usage_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        skill_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        activated_at INTEGER NOT NULL,
        context_pattern TEXT,
        FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      )
    `);

    // Message Subscription Config table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS message_subscription_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        config TEXT NOT NULL
      )
    `);

    // Processed Message Hashes table (중복 방지 및 통계)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS processed_message_hashes (
        hash TEXT PRIMARY KEY,
        conversation_id TEXT,
        processed_at INTEGER NOT NULL,
        type TEXT NOT NULL,
        source TEXT NOT NULL
      )
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversation
      ON messages(conversation_id, created_at DESC)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_activities_conversation
      ON activities(conversation_id, created_at DESC)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_skills_enabled
      ON skills(enabled)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_skill_usage_skill_id
      ON skill_usage_history(skill_id, activated_at DESC)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_processed_hashes_time
      ON processed_message_hashes(processed_at DESC)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_skill_usage_conversation_id
      ON skill_usage_history(conversation_id, activated_at DESC)
    `);

    // Scheduler tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        schedule_config TEXT NOT NULL,
        prompt TEXT NOT NULL,
        thinking_mode TEXT NOT NULL,
        enable_rag INTEGER NOT NULL DEFAULT 0,
        enable_tools INTEGER NOT NULL DEFAULT 0,
        allowed_tools TEXT,
        result_handlers TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_executed_at INTEGER,
        next_execution_at INTEGER
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_enabled
      ON scheduled_tasks(enabled)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_next_execution
      ON scheduled_tasks(next_execution_at)
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scheduler_execution_history (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        task_name TEXT NOT NULL,
        status TEXT NOT NULL,
        trigger TEXT,
        attempt_count INTEGER,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        duration INTEGER,
        result_summary TEXT,
        error_message TEXT,
        conversation_id TEXT,
        saved_file_path TEXT,
        notification_sent INTEGER,
        tools_executed TEXT,
        tools_blocked TEXT
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_execution_history_task_id
      ON scheduler_execution_history(task_id)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_execution_history_started_at
      ON scheduler_execution_history(started_at DESC)
    `);

    // Add columns if they don't exist (for migration)
    try {
      this.db.exec('ALTER TABLE messages ADD COLUMN tool_calls TEXT');
    } catch (error) {
      // Ignore errors if columns already exist
    }
    try {
      this.db.exec('ALTER TABLE messages ADD COLUMN tool_results TEXT');
    } catch (error) {
      // Ignore errors if columns already exist
    }
    try {
      this.db.exec('ALTER TABLE messages ADD COLUMN images TEXT');
    } catch (error) {
      // Ignore errors if columns already exist
    }
    try {
      this.db.exec('ALTER TABLE messages ADD COLUMN referenced_documents TEXT');
    } catch (error) {
      // Ignore errors if columns already exist
    }
    try {
      this.db.exec('ALTER TABLE conversations ADD COLUMN chatSettings TEXT');
    } catch (error) {
      // Ignore errors if columns already exist
    }
    try {
      this.db.exec('ALTER TABLE scheduler_execution_history ADD COLUMN trigger TEXT');
    } catch (error) {
      // Ignore errors if columns already exist
    }
    try {
      this.db.exec('ALTER TABLE scheduler_execution_history ADD COLUMN attempt_count INTEGER');
    } catch (error) {
      // Ignore errors if columns already exist
    }

    console.log('[Database] Tables created successfully');
  }

  // Conversations
  saveConversation(conversation: Conversation): void {
    if (!this.db) throw new Error('Database not initialized');

    const chatSettingsJson = conversation.chatSettings
      ? JSON.stringify(conversation.chatSettings)
      : null;

    this.db.run(
      `INSERT OR REPLACE INTO conversations (id, title, created_at, updated_at, chatSettings)
       VALUES (?, ?, ?, ?, ?)`,
      [
        conversation.id,
        conversation.title,
        conversation.created_at,
        conversation.updated_at,
        chatSettingsJson,
      ]
    );

    this.saveDatabase();
  }

  saveConversationsBulk(conversations: Conversation[]): void {
    if (!this.db) throw new Error('Database not initialized');
    if (!conversations.length) {
      return;
    }

    try {
      this.db.run('BEGIN TRANSACTION');

      for (const conversation of conversations) {
        const chatSettingsJson = conversation.chatSettings
          ? JSON.stringify(conversation.chatSettings)
          : null;

        this.db.run(
          `INSERT OR REPLACE INTO conversations (id, title, created_at, updated_at, chatSettings)
           VALUES (?, ?, ?, ?, ?)`,
          [
            conversation.id,
            conversation.title,
            conversation.created_at,
            conversation.updated_at,
            chatSettingsJson,
          ]
        );
      }

      this.db.run('COMMIT');
      this.saveDatabase();
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    }
  }

  getAllConversations(): Conversation[] {
    if (!this.db) throw new Error('Database not initialized');

    const result = this.db.exec(`
      SELECT id, title, created_at, updated_at, chatSettings
      FROM conversations
      ORDER BY updated_at DESC
    `);

    if (result.length === 0) return [];

    return result[0].values.map((row) => this.mapConversationRow(row));
  }

  getConversation(id: string): Conversation | null {
    if (!this.db) throw new Error('Database not initialized');

    const result = this.db.exec(
      `SELECT id, title, created_at, updated_at, chatSettings
       FROM conversations
       WHERE id = ?`,
      [id]
    );

    if (result.length === 0 || result[0].values.length === 0) return null;

    return this.mapConversationRow(result[0].values[0]);
  }

  deleteConversation(id: string): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run('DELETE FROM conversations WHERE id = ?', [id]);
    this.saveDatabase();
  }

  updateConversationTitle(id: string, title: string): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run(`UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?`, [
      title,
      Date.now(),
      id,
    ]);

    this.saveDatabase();
  }

  // Messages
  saveMessage(message: Message): void {
    if (!this.db) throw new Error('Database not initialized');

    console.log('[Database] Saving message:', {
      id: message.id,
      role: message.role,
      hasImages: !!message.images,
      imageCount: message.images?.length || 0,
    });

    if (message.images && message.images.length > 0) {
      console.log(
        '[Database] Message images:',
        message.images.map((img) => ({
          id: img.id,
          filename: img.filename,
          hasBase64: !!img.base64,
          base64Length: img.base64?.length || 0,
        }))
      );
    }

    this.db.run(
      `INSERT OR REPLACE INTO messages (id, conversation_id, role, content, created_at, tool_calls, tool_results, images, referenced_documents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        message.id,
        message.conversation_id ?? '',
        message.role,
        message.content,
        message.created_at,
        message.tool_calls ? JSON.stringify(message.tool_calls) : null,
        message.tool_results ? JSON.stringify(message.tool_results) : null,
        message.images ? JSON.stringify(message.images) : null,
        message.referenced_documents ? JSON.stringify(message.referenced_documents) : null,
      ]
    );

    this.saveDatabase();
  }

  saveMessagesBulk(messages: Message[]): void {
    if (!this.db) throw new Error('Database not initialized');
    if (!messages.length) {
      return;
    }

    try {
      this.db.run('BEGIN TRANSACTION');

      for (const message of messages) {
        this.db.run(
          `INSERT OR REPLACE INTO messages (id, conversation_id, role, content, created_at, tool_calls, tool_results, images, referenced_documents)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            message.id,
            message.conversation_id ?? '',
            message.role,
            message.content,
            message.created_at,
            message.tool_calls ? JSON.stringify(message.tool_calls) : null,
            message.tool_results ? JSON.stringify(message.tool_results) : null,
            message.images ? JSON.stringify(message.images) : null,
            message.referenced_documents ? JSON.stringify(message.referenced_documents) : null,
          ]
        );
      }

      this.db.run('COMMIT');
      this.saveDatabase();
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    }
  }

  getMessages(conversationId: string): Message[] {
    if (!this.db) throw new Error('Database not initialized');

    const result = this.db.exec(
      `SELECT id, conversation_id, role, content, created_at, tool_calls, tool_results, images, referenced_documents
       FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at ASC`,
      [conversationId]
    );

    if (result.length === 0) return [];

    const messages: Message[] = [];
    for (const row of result[0].values) {
      const message = this.mapMessageRow(row);

      if (message.images && message.images.length > 0) {
        console.log('[Database] Loading message with images:', {
          id: message.id,
          role: message.role,
          imageCount: message.images.length,
          images: message.images.map((img) => ({
            id: img.id,
            filename: img.filename,
            hasBase64: !!img.base64,
            base64Length: img.base64?.length || 0,
          })),
        });
      }

      messages.push(message);
    }

    console.log('[Database] Loaded messages:', {
      conversationId,
      count: messages.length,
      messagesWithImages: messages.filter((m) => m.images && m.images.length > 0).length,
    });

    return messages;
  }

  searchConversations(
    query: string
  ): Array<{ conversation: Conversation; matchedMessages: Message[] }> {
    if (!this.db) throw new Error('Database not initialized');

    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return [];
    }

    const searchPattern = `%${this.escapeLikeQuery(normalizedQuery)}%`;
    const resultMap = new Map<string, { conversation: Conversation; matchedMessages: Message[] }>();

    const titleMatches = this.db.exec(
      `SELECT id, title, created_at, updated_at, chatSettings
       FROM conversations
       WHERE LOWER(title) LIKE ? ESCAPE '\\'
       ORDER BY updated_at DESC`,
      [searchPattern]
    );

    if (titleMatches.length > 0) {
      for (const row of titleMatches[0].values) {
        const conversation = this.mapConversationRow(row);
        resultMap.set(conversation.id, {
          conversation,
          matchedMessages: [],
        });
      }
    }

    const messageMatches = this.db.exec(
      `SELECT c.id, c.title, c.created_at, c.updated_at, c.chatSettings,
              m.id, m.conversation_id, m.role, m.content, m.created_at, m.tool_calls, m.tool_results, m.images, m.referenced_documents
       FROM messages m
       INNER JOIN conversations c ON c.id = m.conversation_id
       WHERE LOWER(m.content) LIKE ? ESCAPE '\\'
       ORDER BY c.updated_at DESC, m.created_at DESC
       LIMIT ?`,
      [searchPattern, this.maxSearchMessageRows]
    );

    if (messageMatches.length > 0) {
      for (const row of messageMatches[0].values) {
        const conversation = this.mapConversationRow([row[0], row[1], row[2], row[3], row[4]]);
        const message = this.mapMessageRow([
          row[5],
          row[6],
          row[7],
          row[8],
          row[9],
          row[10],
          row[11],
          row[12],
          row[13],
        ]);
        this.appendMatchedMessage(resultMap, conversation, message);
      }
    }

    const results = Array.from(resultMap.values());
    results.sort((a, b) => {
      const aTitleMatch = a.conversation.title.toLowerCase().includes(normalizedQuery) ? 1 : 0;
      const bTitleMatch = b.conversation.title.toLowerCase().includes(normalizedQuery) ? 1 : 0;

      if (aTitleMatch !== bTitleMatch) {
        return bTitleMatch - aTitleMatch;
      }

      if (a.matchedMessages.length !== b.matchedMessages.length) {
        return b.matchedMessages.length - a.matchedMessages.length;
      }

      return b.conversation.updated_at - a.conversation.updated_at;
    });

    return results;
  }

  deleteMessage(id: string): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run('DELETE FROM messages WHERE id = ?', [id]);
    this.saveDatabase();
  }

  deleteConversationMessages(conversationId: string): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run('DELETE FROM messages WHERE conversation_id = ?', [conversationId]);
    this.saveDatabase();
  }

  /**
   * Replace all messages in a conversation with new messages (atomic operation)
   * Used for conversation compression
   */
  replaceConversationMessages(conversationId: string, newMessages: Message[]): void {
    if (!this.db) throw new Error('Database not initialized');

    console.log('[Database] Replacing messages for conversation:', {
      conversationId,
      oldCount: this.getMessages(conversationId).length,
      newCount: newMessages.length,
    });

    // Use transaction for atomic operation
    try {
      this.db.run('BEGIN TRANSACTION');

      // Delete existing messages
      this.db.run('DELETE FROM messages WHERE conversation_id = ?', [conversationId]);

      // Insert new messages
      for (const message of newMessages) {
        this.db.run(
          `INSERT INTO messages (id, conversation_id, role, content, created_at, tool_calls, tool_results, images, referenced_documents)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            message.id,
            message.conversation_id ?? conversationId,
            message.role,
            message.content,
            message.created_at,
            message.tool_calls ? JSON.stringify(message.tool_calls) : null,
            message.tool_results ? JSON.stringify(message.tool_results) : null,
            message.images ? JSON.stringify(message.images) : null,
            message.referenced_documents ? JSON.stringify(message.referenced_documents) : null,
          ]
        );
      }

      this.db.run('COMMIT');
      this.saveDatabase();

      console.log('[Database] Successfully replaced messages');
    } catch (error) {
      console.error('[Database] Failed to replace messages:', error);
      this.db.run('ROLLBACK');
      throw error;
    }
  }

  // Settings
  getSetting(key: string): string | null {
    if (!this.db) throw new Error('Database not initialized');

    const result = this.db.exec('SELECT value FROM settings WHERE key = ?', [key]);

    if (result.length === 0 || result[0].values.length === 0) return null;

    return result[0].values[0][0] as string;
  }

  getAllSettings(): Record<string, string> {
    if (!this.db) throw new Error('Database not initialized');

    const result = this.db.exec('SELECT key, value FROM settings');

    if (result.length === 0 || result[0].values.length === 0) return {};

    const settings: Record<string, string> = {};
    result[0].values.forEach((row) => {
      settings[row[0] as string] = row[1] as string;
    });

    return settings;
  }

  setSetting(key: string, value: string): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [key, value]);

    this.saveDatabase();
  }

  updateSetting(key: string, value: string | null): void {
    if (!this.db) throw new Error('Database not initialized');

    if (value === null) {
      this.deleteSetting(key);
    } else {
      this.setSetting(key, value);
    }
  }

  deleteSetting(key: string): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run('DELETE FROM settings WHERE key = ?', [key]);
    this.saveDatabase();
  }

  // Activities (도구 실행 이력)
  saveActivity(activity: Activity): void {
    if (!this.db) throw new Error('Database not initialized');

    console.log('[Database] Saving activity:', {
      id: activity.id,
      tool_name: activity.tool_name,
      status: activity.status,
    });

    this.db.run(
      `INSERT OR REPLACE INTO activities (id, conversation_id, tool_name, tool_args, result, status, created_at, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        activity.id,
        activity.conversation_id,
        activity.tool_name,
        JSON.stringify(activity.tool_args),
        activity.result,
        activity.status,
        activity.created_at,
        activity.duration_ms ?? null,
      ]
    );

    this.saveDatabase();
  }

  getActivities(conversationId: string): Activity[] {
    if (!this.db) throw new Error('Database not initialized');

    const result = this.db.exec(
      `SELECT id, conversation_id, tool_name, tool_args, result, status, created_at, duration_ms
       FROM activities
       WHERE conversation_id = ?
       ORDER BY created_at ASC`,
      [conversationId]
    );

    if (result.length === 0) return [];

    const activities: Activity[] = [];
    for (const row of result[0].values) {
      activities.push({
        id: row[0] as string,
        conversation_id: row[1] as string,
        tool_name: row[2] as string,
        tool_args: JSON.parse(row[3] as string),
        result: row[4] as string,
        status: row[5] as 'success' | 'error',
        created_at: row[6] as number,
        duration_ms: row[7] as number | undefined,
      });
    }

    console.log('[Database] Loaded activities:', {
      conversationId,
      count: activities.length,
    });

    return activities;
  }

  deleteActivity(id: string): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run('DELETE FROM activities WHERE id = ?', [id]);
    this.saveDatabase();
  }

  // 특정 conversation의 모든 activities 삭제
  deleteActivitiesByConversation(conversationId: string): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run('DELETE FROM activities WHERE conversation_id = ?', [conversationId]);
    this.saveDatabase();
  }

  // Persona Operations
  getAllPersonas(): Persona[] {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM personas ORDER BY created_at ASC');
    const personas: Persona[] = [];

    while (stmt.step()) {
      const row = stmt.getAsObject();
      personas.push({
        id: row.id as string,
        name: row.name as string,
        description: row.description as string,
        systemPrompt: row.systemPrompt as string,
        avatar: row.avatar as string | undefined,
        color: row.color as string | undefined,
        isBuiltin: (row.isBuiltin as number) === 1,
        created_at: row.created_at as number,
        updated_at: row.updated_at as number,
      });
    }
    stmt.free();

    return personas;
  }

  savePersona(persona: Persona) {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run(
      `INSERT OR REPLACE INTO personas
       (id, name, description, systemPrompt, avatar, color, isBuiltin, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        persona.id,
        persona.name,
        persona.description,
        persona.systemPrompt,
        persona.avatar || null,
        persona.color || null,
        persona.isBuiltin ? 1 : 0,
        persona.created_at,
        persona.updated_at,
      ]
    );

    this.saveDatabase();
  }

  updatePersona(persona: Persona) {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run(
      `UPDATE personas
       SET name = ?, description = ?, systemPrompt = ?, avatar = ?, color = ?, updated_at = ?
       WHERE id = ? AND isBuiltin = 0`,
      [
        persona.name,
        persona.description,
        persona.systemPrompt,
        persona.avatar || null,
        persona.color || null,
        persona.updated_at,
        persona.id,
      ]
    );

    this.saveDatabase();
  }

  deletePersona(id: string) {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run('DELETE FROM personas WHERE id = ? AND isBuiltin = 0', [id]);
    this.saveDatabase();
  }

  // Scheduled Tasks Operations
  saveScheduledTask(task: ScheduledTask) {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run(
      `INSERT OR REPLACE INTO scheduled_tasks
       (id, name, description, enabled, schedule_config, prompt, thinking_mode,
        enable_rag, enable_tools, allowed_tools, result_handlers, created_at,
        updated_at, last_executed_at, next_execution_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task.id,
        task.name,
        task.description || null,
        task.enabled ? 1 : 0,
        JSON.stringify(task.schedule),
        task.prompt,
        task.thinkingMode,
        task.enableRAG ? 1 : 0,
        task.enableTools ? 1 : 0,
        JSON.stringify(task.allowedTools),
        JSON.stringify(task.resultHandlers),
        task.created_at,
        task.updated_at,
        task.lastExecutedAt || null,
        task.nextExecutionAt || null,
      ]
    );

    this.saveDatabase();
  }

  getAllScheduledTasks(): ScheduledTask[] {
    if (!this.db) throw new Error('Database not initialized');

    const result = this.db.exec(`
      SELECT id, name, description, enabled, schedule_config, prompt, thinking_mode,
             enable_rag, enable_tools, allowed_tools, result_handlers, created_at,
             updated_at, last_executed_at, next_execution_at
      FROM scheduled_tasks
      ORDER BY created_at DESC
    `);

    if (result.length === 0) return [];

    const tasks: ScheduledTask[] = [];
    for (const row of result[0].values) {
      tasks.push({
        id: row[0] as string,
        name: row[1] as string,
        description: (row[2] as string | null) || undefined,
        enabled: (row[3] as number) === 1,
        schedule: JSON.parse(row[4] as string),
        prompt: row[5] as string,
        thinkingMode: row[6] as any,
        enableRAG: (row[7] as number) === 1,
        enableTools: (row[8] as number) === 1,
        allowedTools: JSON.parse(row[9] as string),
        resultHandlers: JSON.parse(row[10] as string),
        created_at: row[11] as number,
        updated_at: row[12] as number,
        lastExecutedAt: (row[13] as number | null) || undefined,
        nextExecutionAt: (row[14] as number | null) || undefined,
      });
    }

    return tasks;
  }

  getScheduledTask(id: string): ScheduledTask | null {
    if (!this.db) throw new Error('Database not initialized');

    const result = this.db.exec(
      `SELECT id, name, description, enabled, schedule_config, prompt, thinking_mode,
              enable_rag, enable_tools, allowed_tools, result_handlers, created_at,
              updated_at, last_executed_at, next_execution_at
       FROM scheduled_tasks
       WHERE id = ?`,
      [id]
    );

    if (result.length === 0 || result[0].values.length === 0) return null;

    const row = result[0].values[0];
    return {
      id: row[0] as string,
      name: row[1] as string,
      description: (row[2] as string | null) || undefined,
      enabled: (row[3] as number) === 1,
      schedule: JSON.parse(row[4] as string),
      prompt: row[5] as string,
      thinkingMode: row[6] as any,
      enableRAG: (row[7] as number) === 1,
      enableTools: (row[8] as number) === 1,
      allowedTools: JSON.parse(row[9] as string),
      resultHandlers: JSON.parse(row[10] as string),
      created_at: row[11] as number,
      updated_at: row[12] as number,
      lastExecutedAt: (row[13] as number | null) || undefined,
      nextExecutionAt: (row[14] as number | null) || undefined,
    };
  }

  deleteScheduledTask(id: string) {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run('DELETE FROM scheduled_tasks WHERE id = ?', [id]);
    this.saveDatabase();
  }

  updateScheduledTask(id: string, updates: Partial<ScheduledTask>) {
    if (!this.db) throw new Error('Database not initialized');

    const task = this.getScheduledTask(id);
    if (!task) throw new Error(`Task not found: ${id}`);

    const updatedTask: ScheduledTask = {
      ...task,
      ...updates,
      updated_at: Date.now(),
    };

    this.saveScheduledTask(updatedTask);
  }

  // Scheduler Execution History Operations
  saveExecutionRecord(record: ExecutionRecord) {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run(
      `INSERT OR REPLACE INTO scheduler_execution_history
       (id, task_id, task_name, status, trigger, attempt_count, started_at, completed_at, duration,
        result_summary, error_message, conversation_id, saved_file_path,
        notification_sent, tools_executed, tools_blocked)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.taskId,
        record.taskName,
        record.status,
        record.trigger || null,
        record.attemptCount || null,
        record.startedAt,
        record.completedAt || null,
        record.duration || null,
        record.resultSummary || null,
        record.errorMessage || null,
        record.conversationId || null,
        record.savedFilePath || null,
        record.notificationSent ? 1 : null,
        record.toolsExecuted ? JSON.stringify(record.toolsExecuted) : null,
        record.toolsBlocked ? JSON.stringify(record.toolsBlocked) : null,
      ]
    );

    this.saveDatabase();
  }

  getExecutionHistory(taskId?: string, filters?: ExecutionHistoryQuery): ExecutionRecord[] {
    if (!this.db) throw new Error('Database not initialized');

    const requestedLimit = Number(filters?.limit ?? 50);
    const normalizedLimit = Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 50;
    const limit = Math.min(Math.max(1, normalizedLimit), 500);

    let sql = `
      SELECT id, task_id, task_name, status, trigger, attempt_count, started_at, completed_at, duration,
             result_summary, error_message, conversation_id, saved_file_path,
             notification_sent, tools_executed, tools_blocked
      FROM scheduler_execution_history
    `;

    const params: any[] = [];
    const whereClauses: string[] = [];
    if (taskId) {
      whereClauses.push('task_id = ?');
      params.push(taskId);
    }

    if (filters?.status) {
      whereClauses.push('status = ?');
      params.push(filters.status);
    }

    if (filters?.trigger) {
      whereClauses.push('trigger = ?');
      params.push(filters.trigger);
    }

    if (typeof filters?.startedAfter === 'number') {
      whereClauses.push('started_at >= ?');
      params.push(filters.startedAfter);
    }

    if (typeof filters?.startedBefore === 'number') {
      whereClauses.push('started_at <= ?');
      params.push(filters.startedBefore);
    }

    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    sql += ' ORDER BY started_at DESC LIMIT ?';
    params.push(limit);

    const result = this.db.exec(sql, params);

    if (result.length === 0) return [];

    const records: ExecutionRecord[] = [];
    for (const row of result[0].values) {
      records.push({
        id: row[0] as string,
        taskId: row[1] as string,
        taskName: row[2] as string,
        status: row[3] as any,
        trigger: (row[4] as any) || undefined,
        attemptCount: (row[5] as number | null) || undefined,
        startedAt: row[6] as number,
        completedAt: (row[7] as number | null) || undefined,
        duration: (row[8] as number | null) || undefined,
        resultSummary: (row[9] as string | null) || undefined,
        errorMessage: (row[10] as string | null) || undefined,
        conversationId: (row[11] as string | null) || undefined,
        savedFilePath: (row[12] as string | null) || undefined,
        notificationSent: (row[13] as number | null) === 1 || undefined,
        toolsExecuted: row[14] ? JSON.parse(row[14] as string) : undefined,
        toolsBlocked: row[15] ? JSON.parse(row[15] as string) : undefined,
      });
    }

    return records;
  }

  // ===== Message Subscription =====

  getMessageSubscriptionConfig():
    | import('../../types/message-subscription').MessageSubscriptionConfig
    | null {
    if (!this.db) throw new Error('Database not initialized');

    const result = this.db.exec('SELECT config FROM message_subscription_config WHERE id = 1');

    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    const configJson = result[0].values[0][0] as string;
    return JSON.parse(configJson);
  }

  saveMessageSubscriptionConfig(
    config: import('../../types/message-subscription').MessageSubscriptionConfig
  ): void {
    if (!this.db) throw new Error('Database not initialized');

    const configJson = JSON.stringify(config);

    // Insert or replace
    this.db.run('INSERT OR REPLACE INTO message_subscription_config (id, config) VALUES (1, ?)', [
      configJson,
    ]);

    this.saveDatabase();
  }

  recordProcessedHash(hash: string, conversationId: string, type: string, source: string): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run(
      'INSERT OR REPLACE INTO processed_message_hashes (hash, conversation_id, processed_at, type, source) VALUES (?, ?, ?, ?, ?)',
      [hash, conversationId, Date.now(), type, source]
    );

    this.saveDatabase();
  }

  isHashProcessed(hash: string): boolean {
    if (!this.db) throw new Error('Database not initialized');

    const result = this.db.exec('SELECT hash FROM processed_message_hashes WHERE hash = ?', [hash]);

    return result.length > 0 && result[0].values.length > 0;
  }

  cleanupOldHashes(days: number = 7): number {
    if (!this.db) throw new Error('Database not initialized');

    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;

    const result = this.db.exec('DELETE FROM processed_message_hashes WHERE processed_at < ?', [
      cutoffTime,
    ]);

    this.saveDatabase();

    // 삭제된 행 수 반환 (변경 사항이 있으면 1, 없으면 0)
    return result.length > 0 ? 1 : 0;
  }

  // Utility
  close() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }

    if (this.db) {
      this.saveDatabase(true);
      this.db.close();
      this.db = null;
      console.log('[Database] Closed');
    }
  }
}

// Singleton instance
export const databaseService = new DatabaseService();
