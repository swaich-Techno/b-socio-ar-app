export type BillingPeriod = "TRIAL" | "MONTHLY" | "ANNUAL" | "MANUAL";
export type SubscriptionStatus =
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "PAYMENT_FAILED"
  | "GRACE_PERIOD"
  | "SUSPENDED"
  | "CANCELLED"
  | "EXPIRED"
  | "MANUALLY_ACTIVATED";
export type OverageBehavior = "HARD_LIMIT" | "SOFT_LIMIT";
export type CouponType =
  | "PERCENTAGE"
  | "FIXED_AMOUNT"
  | "TRIAL_EXTENSION"
  | "REQUEST_CREDITS"
  | "ONE_TIME"
  | "RECURRING";

export interface PlanLimits {
  monthlyRequests: number;
  yearlyPooledRequests?: number;
  companyAdmins: number;
  dispatchUsers: number;
  branches: number;
  retentionDays: number;
}

export interface UsageSnapshot {
  includedRequests: number;
  requestsUsed: number;
  addOnRequests: number;
  manualAdjustment: number;
}

export interface SubscriptionLifecycle {
  status: SubscriptionStatus;
  trialEnd?: Date | string | null;
  currentPeriodEnd: Date | string;
  gracePeriodEnd?: Date | string | null;
  cancelAtPeriodEnd?: boolean;
}

export interface CouponInput {
  type: CouponType;
  discountValue: number;
  currency?: string | null;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function addYears(date: Date, years: number): Date {
  const result = new Date(date);
  const month = result.getUTCMonth();
  result.setUTCFullYear(result.getUTCFullYear() + years);
  if (result.getUTCMonth() !== month) result.setUTCDate(0);
  return result;
}

export function subscriptionHasAccess(lifecycle: SubscriptionLifecycle, now = new Date()): boolean {
  if (["ACTIVE", "MANUALLY_ACTIVATED"].includes(lifecycle.status)) {
    return new Date(lifecycle.currentPeriodEnd).getTime() > now.getTime();
  }
  if (lifecycle.status === "TRIALING") {
    return Boolean(lifecycle.trialEnd && new Date(lifecycle.trialEnd).getTime() > now.getTime());
  }
  if (["PAST_DUE", "PAYMENT_FAILED", "GRACE_PERIOD"].includes(lifecycle.status)) {
    return Boolean(lifecycle.gracePeriodEnd && new Date(lifecycle.gracePeriodEnd).getTime() > now.getTime());
  }
  if (lifecycle.status === "CANCELLED" && lifecycle.cancelAtPeriodEnd) {
    return new Date(lifecycle.currentPeriodEnd).getTime() > now.getTime();
  }
  return false;
}

export function lifecycleStatus(lifecycle: SubscriptionLifecycle, now = new Date()): SubscriptionStatus {
  if (lifecycle.status === "TRIALING" && (!lifecycle.trialEnd || new Date(lifecycle.trialEnd).getTime() <= now.getTime())) {
    return "EXPIRED";
  }
  if (
    ["PAST_DUE", "PAYMENT_FAILED", "GRACE_PERIOD"].includes(lifecycle.status) &&
    lifecycle.gracePeriodEnd &&
    new Date(lifecycle.gracePeriodEnd).getTime() <= now.getTime()
  ) {
    return "SUSPENDED";
  }
  if (
    ["ACTIVE", "MANUALLY_ACTIVATED", "CANCELLED"].includes(lifecycle.status) &&
    new Date(lifecycle.currentPeriodEnd).getTime() <= now.getTime()
  ) {
    return lifecycle.cancelAtPeriodEnd || lifecycle.status === "CANCELLED" ? "EXPIRED" : lifecycle.status;
  }
  return lifecycle.status;
}

export function totalEntitlement(usage: UsageSnapshot): number {
  return Math.max(0, usage.includedRequests + usage.addOnRequests + usage.manualAdjustment);
}

export function getRemainingRequestsFromUsage(usage: UsageSnapshot): number {
  return Math.max(0, totalEntitlement(usage) - usage.requestsUsed);
}

export function getOverageRequestsFromUsage(usage: UsageSnapshot): number {
  return Math.max(0, usage.requestsUsed - totalEntitlement(usage));
}

export function usagePercentage(usage: UsageSnapshot): number {
  const entitlement = totalEntitlement(usage);
  if (entitlement <= 0) return usage.requestsUsed > 0 ? 100 : 0;
  return Math.min(100, Math.round((usage.requestsUsed / entitlement) * 100));
}

export function usageWarningThreshold(percentage: number): 0 | 70 | 90 | 100 {
  if (percentage >= 100) return 100;
  if (percentage >= 90) return 90;
  if (percentage >= 70) return 70;
  return 0;
}

export function canConsumeRequest(input: {
  lifecycle: SubscriptionLifecycle;
  usage: UsageSnapshot;
  overageEnabled: boolean;
  overageBehavior: OverageBehavior;
  overageApproved: boolean;
  now?: Date;
}): { allowed: boolean; reason?: "SUBSCRIPTION_INACTIVE" | "REQUEST_LIMIT_REACHED"; overage: boolean } {
  if (!subscriptionHasAccess(input.lifecycle, input.now)) {
    return { allowed: false, reason: "SUBSCRIPTION_INACTIVE", overage: false };
  }
  if (getRemainingRequestsFromUsage(input.usage) > 0) return { allowed: true, overage: false };
  if (input.overageEnabled && input.overageBehavior === "SOFT_LIMIT" && input.overageApproved) {
    return { allowed: true, overage: true };
  }
  return { allowed: false, reason: "REQUEST_LIMIT_REACHED", overage: false };
}

export function featureEntitled(input: {
  lifecycle: SubscriptionLifecycle;
  featureFlags: Record<string, boolean>;
  manualFeatures?: string[];
  feature: string;
  now?: Date;
}): boolean {
  if (!subscriptionHasAccess(input.lifecycle, input.now)) return false;
  return input.manualFeatures?.includes(input.feature) === true || input.featureFlags[input.feature] === true;
}

export function downgradeCapacityBlockers(input: {
  current: { companyAdmins: number; dispatchUsers: number; branches: number };
  next: { companyAdmins: number; dispatchUsers: number; branches: number };
}): string[] {
  const blockers: string[] = [];
  if (input.current.companyAdmins > input.next.companyAdmins) {
    blockers.push(`${input.current.companyAdmins - input.next.companyAdmins} excess company admin(s)`);
  }
  if (input.current.dispatchUsers > input.next.dispatchUsers) {
    blockers.push(`${input.current.dispatchUsers - input.next.dispatchUsers} excess dispatch user(s)`);
  }
  if (input.current.branches > input.next.branches) {
    blockers.push(`${input.current.branches - input.next.branches} excess branch(es)`);
  }
  return blockers;
}

export function calculateCouponDiscount(
  coupon: CouponInput,
  subtotal: number,
  currency: string,
): { discount: number; requestCredits: number; trialDays: number } {
  if (coupon.currency && coupon.currency !== currency) return { discount: 0, requestCredits: 0, trialDays: 0 };
  if (coupon.type === "PERCENTAGE" || coupon.type === "ONE_TIME" || coupon.type === "RECURRING") {
    return {
      discount: coupon.type === "PERCENTAGE"
        ? Math.min(subtotal, Math.round((subtotal * Math.min(coupon.discountValue, 100)) / 100))
        : Math.min(subtotal, coupon.discountValue),
      requestCredits: 0,
      trialDays: 0,
    };
  }
  if (coupon.type === "FIXED_AMOUNT") {
    return { discount: Math.min(subtotal, coupon.discountValue), requestCredits: 0, trialDays: 0 };
  }
  if (coupon.type === "REQUEST_CREDITS") {
    return { discount: 0, requestCredits: Math.floor(coupon.discountValue), trialDays: 0 };
  }
  return { discount: 0, requestCredits: 0, trialDays: Math.floor(coupon.discountValue) };
}

export function billingPeriodEnd(start: Date, period: BillingPeriod, trialDays = 14): Date {
  if (period === "TRIAL") return addDays(start, trialDays);
  if (period === "ANNUAL") return addYears(start, 1);
  if (period === "MANUAL") return addMonths(start, 1);
  return addMonths(start, 1);
}

export function usageWindow(
  subscriptionStart: Date,
  subscriptionEnd: Date,
  period: BillingPeriod,
  now = new Date(),
  yearlyPooled = false,
): { start: Date; end: Date } {
  if (period !== "ANNUAL" || yearlyPooled) return { start: subscriptionStart, end: subscriptionEnd };
  let start = new Date(subscriptionStart);
  let end = addMonths(start, 1);
  while (end.getTime() <= now.getTime() && end.getTime() < subscriptionEnd.getTime()) {
    start = end;
    end = addMonths(start, 1);
  }
  return { start, end: new Date(Math.min(end.getTime(), subscriptionEnd.getTime())) };
}

export function proratedUpgradeAmount(input: {
  currentAmount: number;
  newAmount: number;
  periodStart: Date;
  periodEnd: Date;
  now?: Date;
}): number {
  const now = input.now ?? new Date();
  const full = Math.max(1, input.periodEnd.getTime() - input.periodStart.getTime());
  const remaining = Math.max(0, input.periodEnd.getTime() - now.getTime());
  return Math.max(0, Math.round((input.newAmount - input.currentAmount) * (remaining / full)));
}

export function countryToBillingRegion(country: string): string {
  const normalized = country.trim().toLowerCase();
  if (["india", "in"].includes(normalized)) return "INDIA";
  if (["united states", "united states of america", "usa", "us"].includes(normalized)) return "UNITED_STATES";
  if (["canada", "ca"].includes(normalized)) return "CANADA";
  if (["united kingdom", "uk", "great britain", "gb"].includes(normalized)) return "UNITED_KINGDOM";
  if (["united arab emirates", "uae", "saudi arabia", "qatar", "bahrain", "oman", "kuwait"].includes(normalized)) return "MIDDLE_EAST";
  if (
    ["austria", "belgium", "croatia", "cyprus", "estonia", "finland", "france", "germany", "greece", "ireland",
      "italy", "latvia", "lithuania", "luxembourg", "malta", "netherlands", "portugal", "slovakia", "slovenia", "spain"].includes(normalized)
  ) return "EUROPE";
  return "OTHER";
}
