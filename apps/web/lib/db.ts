import { connectDatabase } from "@bsocio/database";
import { getMongoSettings } from "@/lib/env";

export async function dbConnect() {
  const { uri, databaseName } = getMongoSettings();
  return connectDatabase(uri, databaseName);
}
