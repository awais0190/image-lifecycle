// ─────────────────────────────────────────────────────────────────────────────
// MongoDB — singleton connection for Next.js
//
// Graceful: if MONGODB_URI is missing or the connection fails, connectDB()
// returns null instead of throwing. Call sites must check the return value
// before using the DB — the app continues to run without MongoDB.
// ─────────────────────────────────────────────────────────────────────────────

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI as string | undefined;

interface MongooseCache {
  conn:    typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var _mongoose: MongooseCache | undefined;
}

const cache: MongooseCache = global._mongoose ?? { conn: null, promise: null };
global._mongoose = cache;

/** Attempt connection up to `maxAttempts` times with exponential backoff. */
async function connectWithRetry(
  uri: string,
  maxAttempts = 3
): Promise<typeof mongoose> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[MongoDB] Connection attempt ${attempt}/${maxAttempts}…`);
      const connection = await mongoose.connect(uri, { bufferCommands: false });
      console.log('[MongoDB] Connected successfully.');
      return connection;
    } catch (err) {
      lastError = err;
      const delay = Math.pow(2, attempt) * 500; // 1s → 2s → 4s
      console.warn(`[MongoDB] Attempt ${attempt} failed. Retrying in ${delay}ms…`);
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Returns a cached Mongoose connection, or null if unavailable.
 * NEVER throws — callers must check for null before using the DB.
 */
export async function connectDB(): Promise<typeof mongoose | null> {
  if (!MONGODB_URI) {
    console.warn('[MongoDB] MONGODB_URI is not set — running without database.');
    return null;
  }

  // Return existing live connection
  if (cache.conn) return cache.conn;

  // Reuse in-flight promise to avoid parallel connect races
  if (!cache.promise) {
    cache.promise = connectWithRetry(MONGODB_URI).then((conn) => {
      conn.connection.on('disconnected', () => {
        console.warn('[MongoDB] Disconnected — clearing cache.');
        cache.conn    = null;
        cache.promise = null;
      });
      conn.connection.on('error', (err: Error) => {
        console.error('[MongoDB] Connection error:', err.message);
      });
      return conn;
    });
  }

  try {
    cache.conn = await cache.promise;
    return cache.conn;
  } catch (err) {
    cache.promise = null;
    console.error('[MongoDB] All connection attempts failed — running without database.', err);
    return null;
  }
}

/** True if a live connection exists right now (synchronous, no await). */
export function isDBConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export default connectDB;
