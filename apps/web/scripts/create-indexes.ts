import { disconnectDatabase } from "@bsocio/database";
import { ensureDatabaseIndexes } from "../lib/database-indexes";

async function main() {
  await ensureDatabaseIndexes();
}

main()
  .catch((error) => { console.error("Index migration failed", error); process.exitCode = 1; })
  .finally(async () => { await disconnectDatabase(); });
