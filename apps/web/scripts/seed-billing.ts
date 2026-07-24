import { dbConnect } from "@/lib/db";
import { seedBillingDefaults } from "@/services/billing/seed";

async function main() {
  await dbConnect();
  const result = await seedBillingDefaults({ includeSamples: process.argv.includes("--samples") });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
