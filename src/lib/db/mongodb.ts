// ─────────────────────────────────────────────────────────────────────────────
// MongoDB — production-grade singleton connection for Next.js
//
// Uses the global._mongoose cache pattern to survive hot-reloads in
// development without opening a new connection on every module load.
// ─────────────────────────────────────────────────────────────────────────────

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI as string;

if (!MONGODB_URI) {
  throw new Error(
    'Please define the MONGODB_URI environment variable in .env.local'
  );
}

/** Cache shape stored in the Node.js global object */
interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

// Extend the global namespace so TypeScript doesn't complain
declare global {
  // eslint-disable-next-line no-var
  var _mongoose: MongooseCache | undefined;
}

const cache: MongooseCache = global._mongoose ?? { conn: null, promise: null };
global._mongoose = cache;

/** Retry logic: attempt connection up to `maxAttempts` times with exp backoff */
async function connectWithRetry(
  uri: string,
  maxAttempts = 3
): Promise<typeof mongoose> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[MongoDB] Connection attempt ${attempt}/${maxAttempts}…`);

      const connection = await mongoose.connect(uri, {
        bufferCommands: false,
      });

      console.log('[MongoDB] Connected successfully.');
      return connection;
    } catch (err) {
      lastError = err;
      const delay = Math.pow(2, attempt) * 500; // 1s, 2s, 4s
      console.warn(`[MongoDB] Attempt ${attempt} failed. Retrying in ${delay}ms…`, err);

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  console.error('[MongoDB] All connection attempts exhausted.');
  throw lastError;
}

/**
 * Returns a cached Mongoose connection.
 * Call this at the top of any API route handler or server action.
 */
export async function connectDB(): Promise<typeof mongoose> {
  // Return existing connection immediately
  if (cache.conn) {
    return cache.conn;
  }

  // Reuse an in-flight connection promise (avoids parallel connect races)
  if (!cache.promise) {
    cache.promise = connectWithRetry(MONGODB_URI).then((conn) => {
      // ── Connection event logging ─────────────────────────────
      conn.connection.on('connected', () =>
        console.log('[MongoDB] Event: connected')
      );
      conn.connection.on('disconnected', () =>
        console.log('[MongoDB] Event: disconnected')
      );
      conn.connection.on('error', (err: Error) =>
        console.error('[MongoDB] Connection error:', err)
      );

      return conn;
    });
  }

  try {
    cache.conn = await cache.promise;
  } catch (err) {
    // Reset promise so next call can retry fresh
    cache.promise = null;
    throw err;
  }

  return cache.conn;
}

export default connectDB;
