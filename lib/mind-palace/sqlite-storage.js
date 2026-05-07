// SQLite storage implementation for Mind Palace (runs in Electron main process)
// Uses sql.js (WASM SQLite) — no native dependencies.
import fs from 'fs';
import path from 'path';
const DIMS = 3072;
const BYTES_PER_EMBEDDING = DIMS * 4; // Float32 = 4 bytes
export class SqliteStorage {
    constructor(rootDir) {
        this.db = null;
        this.rootDir = rootDir;
        this.dbPath = path.join(rootDir, 'db', 'mind-palace.sqlite');
        this.imagesDir = path.join(rootDir, 'images');
    }
    async initialize() {
        // Ensure directories exist
        fs.mkdirSync(path.join(this.rootDir, 'db'), { recursive: true });
        fs.mkdirSync(this.imagesDir, { recursive: true });
        // Dynamic import sql.js
        const initSqlJsModule = await import('sql.js');
        const initFn = initSqlJsModule.default || initSqlJsModule;
        const SQL = await initFn();
        // Load existing DB or create new
        if (fs.existsSync(this.dbPath)) {
            const fileBuffer = fs.readFileSync(this.dbPath);
            this.db = new SQL.Database(fileBuffer);
        }
        else {
            this.db = new SQL.Database();
        }
        this.db.run(`
      CREATE TABLE IF NOT EXISTS memories (
        id              TEXT PRIMARY KEY,
        timestamp       INTEGER NOT NULL,
        embedding       BLOB NOT NULL,
        transcription   TEXT,
        screenshot_path TEXT,
        focus_regions   TEXT,
        connection_state TEXT,
        embed_text      TEXT NOT NULL,
        embed_model     TEXT NOT NULL DEFAULT 'gemini-embedding-2-preview',
        created_at      INTEGER NOT NULL
      )
    `);
        this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_memories_timestamp ON memories(timestamp)
    `);
        this.persist();
    }
    persist() {
        if (!this.db)
            return;
        const data = this.db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(this.dbPath, buffer);
    }
    getImageDir(timestamp) {
        const date = new Date(timestamp);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return path.join(this.imagesDir, String(year), month, day);
    }
    async storeMemory(payload) {
        if (!this.db)
            throw new Error('Database not initialized');
        const imageDir = this.getImageDir(payload.timestamp);
        fs.mkdirSync(imageDir, { recursive: true });
        // Write screenshot to disk
        let screenshotPath = null;
        if (payload.screenshotBase64) {
            const filename = `${payload.timestamp}.jpg`;
            const fullPath = path.join(imageDir, filename);
            fs.writeFileSync(fullPath, Buffer.from(payload.screenshotBase64, 'base64'));
            screenshotPath = path.relative(this.rootDir, fullPath);
        }
        // Write focus region images
        const focusRegions = [];
        for (let i = 0; i < payload.focusRegions.length; i++) {
            const fr = payload.focusRegions[i];
            const filename = `${payload.timestamp}_focus_${i}.png`;
            const fullPath = path.join(imageDir, filename);
            fs.writeFileSync(fullPath, Buffer.from(fr.base64, 'base64'));
            focusRegions.push({
                boxId: fr.boxId,
                path: path.relative(this.rootDir, fullPath),
            });
        }
        // Convert embedding array to binary blob
        const embeddingFloat32 = new Float32Array(payload.embedding);
        const embeddingBlob = Buffer.from(embeddingFloat32.buffer);
        this.db.run(`INSERT OR REPLACE INTO memories
        (id, timestamp, embedding, transcription, screenshot_path, focus_regions,
         connection_state, embed_text, embed_model, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            payload.id,
            payload.timestamp,
            embeddingBlob,
            payload.transcription,
            screenshotPath,
            JSON.stringify(focusRegions),
            payload.connectionState,
            payload.embedText,
            payload.embedModel,
            Date.now(),
        ]);
        this.persist();
    }
    async getMemory(id) {
        if (!this.db)
            throw new Error('Database not initialized');
        const stmt = this.db.prepare('SELECT * FROM memories WHERE id = ?');
        stmt.bind([id]);
        if (!stmt.step()) {
            stmt.free();
            return null;
        }
        const row = stmt.getAsObject();
        stmt.free();
        return this.rowToRecord(row);
    }
    async searchByKeyword(query, limit) {
        if (!this.db)
            throw new Error('Database not initialized');
        // Simple LIKE-based keyword search
        const words = query.toLowerCase().split(/\s+/).filter(Boolean);
        if (words.length === 0)
            return [];
        const conditions = words.map(() => 'LOWER(embed_text) LIKE ?');
        const params = words.map(w => `%${w}%`);
        const sql = `SELECT id, timestamp, transcription, screenshot_path, focus_regions, embed_text
                 FROM memories
                 WHERE ${conditions.join(' AND ')}
                 ORDER BY timestamp DESC
                 LIMIT ?`;
        const stmt = this.db.prepare(sql);
        stmt.bind([...params, limit]);
        const results = [];
        while (stmt.step()) {
            const row = stmt.getAsObject();
            results.push({
                id: row.id,
                timestamp: row.timestamp,
                transcription: row.transcription,
                screenshotPath: row.screenshot_path,
                focusRegions: JSON.parse(row.focus_regions || '[]'),
                embedText: row.embed_text,
                similarity: 1.0, // keyword match, no similarity score
            });
        }
        stmt.free();
        return results;
    }
    async getStats() {
        if (!this.db)
            throw new Error('Database not initialized');
        const countResult = this.db.exec('SELECT COUNT(*) as cnt FROM memories');
        const totalMemories = countResult[0]?.values[0]?.[0] || 0;
        const timeResult = this.db.exec('SELECT MIN(timestamp), MAX(timestamp) FROM memories');
        const oldest = timeResult[0]?.values[0]?.[0];
        const newest = timeResult[0]?.values[0]?.[1];
        // Get DB file size
        let storageBytesDb = 0;
        try {
            storageBytesDb = fs.statSync(this.dbPath).size;
        }
        catch { }
        // Get images dir size (rough estimate)
        let storageBytesImages = 0;
        try {
            storageBytesImages = this.getDirSize(this.imagesDir);
        }
        catch { }
        return { totalMemories, storageBytesDb, storageBytesImages, oldestTimestamp: oldest, newestTimestamp: newest };
    }
    getDirSize(dir) {
        if (!fs.existsSync(dir))
            return 0;
        let total = 0;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                total += this.getDirSize(fullPath);
            }
            else {
                total += fs.statSync(fullPath).size;
            }
        }
        return total;
    }
    async getRecent(limit) {
        if (!this.db)
            throw new Error('Database not initialized');
        const stmt = this.db.prepare('SELECT id, timestamp, embedding FROM memories ORDER BY timestamp DESC LIMIT ?');
        stmt.bind([limit]);
        const records = [];
        while (stmt.step()) {
            const row = stmt.getAsObject();
            const embBuf = row.embedding;
            records.push({
                id: row.id,
                timestamp: row.timestamp,
                embedding: new Float32Array(embBuf.buffer, embBuf.byteOffset, DIMS),
            });
        }
        stmt.free();
        return records;
    }
    async getAllEmbeddings() {
        if (!this.db)
            throw new Error('Database not initialized');
        const stmt = this.db.prepare('SELECT id, timestamp, embedding FROM memories ORDER BY timestamp ASC');
        const records = [];
        while (stmt.step()) {
            const row = stmt.getAsObject();
            const embBuf = row.embedding;
            // Copy embedding data to avoid referencing sql.js internal buffer
            const embCopy = new Float32Array(DIMS);
            const srcView = new Float32Array(embBuf.buffer, embBuf.byteOffset, DIMS);
            embCopy.set(srcView);
            records.push({
                id: row.id,
                timestamp: row.timestamp,
                embedding: embCopy,
            });
        }
        stmt.free();
        return records;
    }
    async getAllMetadata() {
        if (!this.db)
            throw new Error('Database not initialized');
        const stmt = this.db.prepare(`SELECT id, timestamp, transcription, embed_text, connection_state,
              screenshot_path, focus_regions
       FROM memories ORDER BY timestamp ASC`);
        const results = [];
        while (stmt.step()) {
            const row = stmt.getAsObject();
            results.push({
                id: row.id,
                timestamp: row.timestamp,
                transcription: row.transcription,
                embedText: row.embed_text,
                connectionState: row.connection_state,
                hasScreenshot: row.screenshot_path != null,
                hasFocusRegions: JSON.parse(row.focus_regions || '[]').length > 0,
            });
        }
        stmt.free();
        return results;
    }
    async deleteMemory(id) {
        if (!this.db)
            throw new Error('Database not initialized');
        // Get paths before deleting
        const memory = await this.getMemory(id);
        if (!memory)
            return;
        // Delete image files
        if (memory.screenshotPath) {
            const fullPath = path.join(this.rootDir, memory.screenshotPath);
            try {
                fs.unlinkSync(fullPath);
            }
            catch { }
        }
        for (const fr of memory.focusRegions) {
            const fullPath = path.join(this.rootDir, fr.path);
            try {
                fs.unlinkSync(fullPath);
            }
            catch { }
        }
        this.db.run('DELETE FROM memories WHERE id = ?', [id]);
        this.persist();
    }
    loadImage(relativePath) {
        const fullPath = path.join(this.rootDir, relativePath);
        try {
            return fs.readFileSync(fullPath).toString('base64');
        }
        catch {
            return null;
        }
    }
    close() {
        if (this.db) {
            this.persist();
            this.db.close();
            this.db = null;
        }
    }
    rowToRecord(row) {
        const embBuf = row.embedding;
        const embCopy = new Float32Array(DIMS);
        const srcView = new Float32Array(embBuf.buffer, embBuf.byteOffset, DIMS);
        embCopy.set(srcView);
        return {
            id: row.id,
            timestamp: row.timestamp,
            embedding: embCopy,
            transcription: row.transcription,
            screenshotPath: row.screenshot_path,
            focusRegions: JSON.parse(row.focus_regions || '[]'),
            connectionState: row.connection_state,
            embedText: row.embed_text,
            embedModel: row.embed_model,
            createdAt: row.created_at,
        };
    }
}
