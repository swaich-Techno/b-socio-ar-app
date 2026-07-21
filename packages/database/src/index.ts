import mongoose, { type Mongoose } from "mongoose";

type MongoCache = { connection: Mongoose | null; promise: Promise<Mongoose> | null; uri?: string };

const globalWithMongo = globalThis as typeof globalThis & { __bsocioMongo?: MongoCache };
const cache = globalWithMongo.__bsocioMongo ?? { connection: null, promise: null };
globalWithMongo.__bsocioMongo = cache;

export async function connectDatabase(uri: string, databaseName = "bsocio_ar"): Promise<Mongoose> {
  if (!uri) throw new Error("MONGODB_URI is not configured");
  if (cache.connection && cache.uri === uri) return cache.connection;
  if (!cache.promise || cache.uri !== uri) {
    cache.uri = uri;
    cache.promise = mongoose.connect(uri, {
      dbName: databaseName,
      serverSelectionTimeoutMS: 10_000,
      maxPoolSize: 20,
      minPoolSize: 0,
      autoIndex: process.env.NODE_ENV !== "production",
    });
  }
  try {
    cache.connection = await cache.promise;
    return cache.connection;
  } catch (error) {
    cache.promise = null;
    cache.connection = null;
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (cache.connection) await mongoose.disconnect();
  cache.connection = null;
  cache.promise = null;
  cache.uri = undefined;
}

export function asObjectId(value: string): mongoose.Types.ObjectId {
  if (!mongoose.isValidObjectId(value)) throw new Error("Invalid MongoDB ObjectId");
  return new mongoose.Types.ObjectId(value);
}

export { mongoose };
