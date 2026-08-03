import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import { verifyLoginPassword } from "@/lib/auth";

describe("administrator credential rotation", () => {
  it("prefers the configured bootstrap hash over an existing database hash", async () => {
    const storedHash = await bcrypt.hash("previous-password", 4);
    const bootstrapHash = await bcrypt.hash("rotated-password", 4);

    await expect(verifyLoginPassword("rotated-password", storedHash, bootstrapHash)).resolves.toBe("bootstrap");
    await expect(verifyLoginPassword("previous-password", storedHash, bootstrapHash)).resolves.toBeNull();
  });

  it("uses the database hash when no bootstrap credential is configured", async () => {
    const storedHash = await bcrypt.hash("team-member-password", 4);

    await expect(verifyLoginPassword("team-member-password", storedHash)).resolves.toBe("stored");
    await expect(verifyLoginPassword("incorrect-password", storedHash)).resolves.toBeNull();
  });
});
