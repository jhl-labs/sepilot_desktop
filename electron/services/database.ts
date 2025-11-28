import initSqlJs, { Database } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { Conversation, Message, Activity } from '../../types';

class DatabaseService {
  private db: Database | null = null;
  private dbPath: string = '';

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
            path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'sql.js', 'dist', file),
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
          return path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'sql.js', 'dist', file);
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
    this.saveDatabase();
  }

  private saveDatabase() {
    if (!this.db) return;
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  private createTables() {
    if (!this.db) throw new Error('Database not initialized');

    // Conversations table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
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

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversation
      ON messages(conversation_id, created_at DESC)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_activities_conversation
      ON activities(conversation_id, created_at DESC)
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


    console.log('[Database] Tables created successfully');
  }

  // Conversations
  saveConversation(conversation: Conversation): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run(
      `INSERT OR REPLACE INTO conversations (id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
      [conversation.id, conversation.title, conversation.created_at, conversation.updated_at]
    );

    this.saveDatabase();
  }

  getAllConversations(): Conversation[] {
    if (!this.db) throw new Error('Database not initialized');

    const result = this.db.exec(`
      SELECT id, title, created_at, updated_at
      FROM conversations
      ORDER BY updated_at DESC
    `);

    if (result.length === 0) return [];

    const conversations: Conversation[] = [];
    for (const row of result[0].values) {
      conversations.push({
        id: row[0] as string,
        title: row[1] as string,
        created_at: row[2] as number,
        updated_at: row[3] as number,
      });
    }

    return conversations;
  }

  getConversation(id: string): Conversation | null {
    if (!this.db) throw new Error('Database not initialized');

    const result = this.db.exec(
      `SELECT id, title, created_at, updated_at
       FROM conversations
       WHERE id = ?`,
      [id]
    );

    if (result.length === 0 || result[0].values.length === 0) return null;

    const row = result[0].values[0];
    return {
      id: row[0] as string,
      title: row[1] as string,
      created_at: row[2] as number,
      updated_at: row[3] as number,
    };
  }

  deleteConversation(id: string): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run('DELETE FROM conversations WHERE id = ?', [id]);
    this.saveDatabase();
  }

  updateConversationTitle(id: string, title: string): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run(
      `UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?`,
      [title, Date.now(), id]
    );

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
      console.log('[Database] Message images:', message.images.map(img => ({
        id: img.id,
        filename: img.filename,
        hasBase64: !!img.base64,
        base64Length: img.base64?.length || 0,
      })));
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
      const message: Message = {
        id: row[0] as string,
        conversation_id: row[1] as string,
        role: row[2] as 'user' | 'assistant' | 'system',
        content: row[3] as string,
        created_at: row[4] as number,
        tool_calls: row[5] ? JSON.parse(row[5] as string) : undefined,
        tool_results: row[6] ? JSON.parse(row[6] as string) : undefined,
        images: row[7] ? JSON.parse(row[7] as string) : undefined,
        referenced_documents: row[8] ? JSON.parse(row[8] as string) : undefined,
      };

      if (message.images && message.images.length > 0) {
        console.log('[Database] Loading message with images:', {
          id: message.id,
          role: message.role,
          imageCount: message.images.length,
          images: message.images.map(img => ({
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
      messagesWithImages: messages.filter(m => m.images && m.images.length > 0).length,
    });

    return messages;
  }

  deleteMessage(id: string): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run('DELETE FROM messages WHERE id = ?', [id]);
    this.saveDatabase();
  }

  // Settings
  getSetting(key: string): string | null {
    if (!this.db) throw new Error('Database not initialized');

    const result = this.db.exec('SELECT value FROM settings WHERE key = ?', [key]);

    if (result.length === 0 || result[0].values.length === 0) return null;

    return result[0].values[0][0] as string;
  }

  setSetting(key: string, value: string): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run(
      `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`,
      [key, value]
    );

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

  // Utility
  close() {
    if (this.db) {
      this.saveDatabase();
      this.db.close();
      this.db = null;
      console.log('[Database] Closed');
    }
  }
}

// Singleton instance
export const databaseService = new DatabaseService();
