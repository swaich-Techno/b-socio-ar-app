import { createHash } from "node:crypto";
import { AuditLog } from "@/models";

interface AuditInput {
  actorId?: string;
  businessId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  request?: Request;
  before?: unknown;
  after?: unknown;
  success?: boolean;
  reason?: string;
}

export async function writeAudit(input: AuditInput): Promise<void> {
  const ip = input.request?.headers.get("cf-connecting-ip") ?? input.request?.headers.get("x-forwarded-for") ?? "unknown";
  try {
    await AuditLog.create({
      actorId: input.actorId,
      businessId: input.businessId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      ipHash: createHash("sha256").update(ip).digest("hex"),
      userAgent: input.request?.headers.get("user-agent")?.slice(0, 500),
      before: input.before,
      after: input.after,
      success: input.success ?? true,
      reason: input.reason,
    });
  } catch (error) {
    console.error("Audit log write failed", error);
  }
}
