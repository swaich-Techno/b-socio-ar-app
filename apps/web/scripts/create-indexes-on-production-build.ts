import { disconnectDatabase } from "@bsocio/database";
import { ensureDatabaseIndexes } from "../lib/database-indexes";

async function main() {
  if (process.env.VERCEL_ENV !== "production") {
    console.log("Skipping database indexes outside a Vercel production build.");
    return;
  }

  await ensureDatabaseIndexes();
}

main()
  .catch((error) => {
    console.error("Production index migration failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
