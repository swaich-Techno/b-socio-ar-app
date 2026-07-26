"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BadgeDollarSign,
  Bell,
  Box,
  BriefcaseBusiness,
  Building2,
  ChartNoAxesCombined,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  CreditCard,
  Cuboid,
  FileCheck2,
  FolderKanban,
  Gauge,
  Gem,
  HeartPulse,
  Images,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  PackageCheck,
  QrCode,
  ScanLine,
  Settings,
  ShoppingBag,
  Store,
  Utensils,
  UserRound,
  UsersRound,
  Warehouse,
  X,
} from "lucide-react";
import { Brand } from "@/components/brand";

const customerNav = [
  ["Overview", "/dashboard", LayoutDashboard],
  ["Business", "/dashboard/business", Building2],
  ["Demo project", "/dashboard/demo", FolderKanban],
  ["Products", "/dashboard/products", ShoppingBag],
  ["Uploads", "/dashboard/uploads", Images],
  ["3D generation", "/dashboard/3d-generation", Cuboid],
  ["Models", "/dashboard/models", Box],
  ["AR experiences", "/dashboard/ar-experiences", ScanLine],
  ["QR codes", "/dashboard/qr-codes", QrCode],
  ["Approval status", "/dashboard/approval-status", FileCheck2],
  ["Custom package", "/dashboard/custom-package", PackageCheck],
  ["Payments", "/dashboard/payments", CreditCard],
  ["Subscription & billing", "/dashboard/billing", BadgeDollarSign],
  ["Analytics", "/dashboard/analytics", ChartNoAxesCombined],
  ["Notifications", "/dashboard/notifications", Bell],
  ["Support", "/dashboard/support", CircleHelp],
  ["Profile", "/dashboard/profile", UserRound],
  ["Security", "/dashboard/security", LockKeyhole],
  ["Settings", "/dashboard/settings", Settings],
] as const;

const restaurantNav = [
  ["Restaurant tables", "/dashboard/restaurant/tables", Utensils],
  ["Restaurant menu", "/dashboard/restaurant/menu", ClipboardList],
  ["Order activity", "/dashboard/restaurant/orders", ShoppingBag],
  ["Restaurant analytics", "/dashboard/restaurant/analytics", ChartNoAxesCombined],
  ["Restaurant settings", "/dashboard/restaurant/settings", Store],
] as const;

const jewelleryNav = [
  ["Jewellery enquiries", "/dashboard/jewellery/enquiries", Gem],
  ["Enquiry analytics", "/dashboard/jewellery/analytics", ChartNoAxesCombined],
  ["Jewellery settings", "/dashboard/jewellery/settings", Store],
] as const;

const adminNav = [
  ["Overview", "/admin", Gauge],
  ["Customers", "/admin/customers", UsersRound],
  ["Businesses", "/admin/businesses", Building2],
  ["Demo projects", "/admin/demo-projects", FolderKanban],
  ["Products", "/admin/products", ShoppingBag],
  ["Uploads", "/admin/uploads", Images],
  ["3D job queue", "/admin/job-queue", Cuboid],
  ["Models", "/admin/models", Box],
  ["AR experiences", "/admin/ar-experiences", ScanLine],
  ["QR codes", "/admin/qr-codes", QrCode],
  ["Approval queue", "/admin/approval-queue", FileCheck2],
  ["Packages", "/admin/packages", PackageCheck],
  ["Payments", "/admin/payments", BadgeDollarSign],
  ["Subscriptions", "/admin/billing", CreditCard],
  ["Team members", "/admin/team-members", UsersRound],
  ["Support", "/admin/support", CircleHelp],
  ["Analytics", "/admin/analytics", ChartNoAxesCombined],
  ["Worker health", "/admin/worker-health", HeartPulse],
  ["Storage usage", "/admin/storage-usage", Warehouse],
  ["Audit logs", "/admin/audit-logs", Activity],
  ["Settings", "/admin/settings", Settings],
] as const;

const ADMIN_NAV_PERMISSIONS: Record<string, readonly string[]> = {
  SUPER_ADMIN: ["*"], ADMIN: ["*"],
  DEMO_REVIEWER: ["/admin", "/admin/demo-projects", "/admin/products", "/admin/uploads", "/admin/approval-queue"],
  THREE_D_REVIEWER: ["/admin", "/admin/products", "/admin/uploads", "/admin/job-queue", "/admin/models", "/admin/approval-queue", "/admin/worker-health", "/admin/storage-usage"],
  AR_PUBLISHER: ["/admin", "/admin/products", "/admin/models", "/admin/ar-experiences", "/admin/qr-codes"],
  SALES_MANAGER: ["/admin", "/admin/packages"], FINANCE_MANAGER: ["/admin", "/admin/payments", "/admin/billing"],
  SUPPORT_MANAGER: ["/admin", "/admin/customers", "/admin/businesses", "/admin/demo-projects", "/admin/products", "/admin/support"],
};

function groupItems<T extends readonly (readonly [string, string, LucideIcon])[]>(
  items: T,
  start: number,
  end?: number,
) {
  return items.slice(start, end);
}

export function DashboardShell({
  children,
  admin = false,
}: {
  children: React.ReactNode;
  admin?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("");
  const [businessCategory, setBusinessCategory] = useState("");
  const pathname = usePathname();
  const router = useRouter();
  const allowedAdminPaths = ADMIN_NAV_PERMISSIONS[role] ?? ["/admin"];
  const visibleAdminNav = adminNav.filter(([, href]) => allowedAdminPaths.includes("*") || allowedAdminPaths.includes(href));
  const category = businessCategory.toLowerCase();
  const commerceNav = /restaurant|cafe|café|food|bakery/.test(category)
    ? restaurantNav
    : /jewellery|jewelry/.test(category)
      ? jewelleryNav
      : [];
  const adminGroups = [
    { label: "Operations", items: visibleAdminNav.filter(([, href]) => ["/admin", "/admin/customers", "/admin/businesses", "/admin/demo-projects"].includes(href)) },
    { label: "Production", items: visibleAdminNav.filter(([, href]) => ["/admin/products", "/admin/uploads", "/admin/job-queue", "/admin/models", "/admin/ar-experiences", "/admin/qr-codes", "/admin/approval-queue"].includes(href)) },
    { label: "Commercial", items: visibleAdminNav.filter(([, href]) => ["/admin/packages", "/admin/payments", "/admin/billing"].includes(href)) },
    { label: "Administration", items: visibleAdminNav.filter(([, href]) => ["/admin/team-members", "/admin/support", "/admin/analytics", "/admin/worker-health", "/admin/storage-usage", "/admin/audit-logs", "/admin/settings"].includes(href)) },
  ].filter(({ items }) => items.length);
  const customerGroups = [
    { label: "Workspace", items: groupItems(customerNav, 0, 3) },
    { label: "Production", items: groupItems(customerNav, 3, 10) },
    ...(commerceNav.length ? [{ label: "Commerce", items: commerceNav }] : []),
    { label: "Commercial", items: groupItems(customerNav, 10, 14) },
    { label: "Account", items: groupItems(customerNav, 14) },
  ];
  const navGroups = admin ? adminGroups : customerGroups;
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  useEffect(() => {
    if (!admin) return;
    let cancelled = false;
    fetch("/api/auth/session", { cache: "no-store" }).then(async (response) => {
      const payload = await response.json() as { data?: { user?: { role?: string } } };
      if (!cancelled) setRole(payload.data?.user?.role ?? "");
    }).catch(() => { if (!cancelled) setRole(""); });
    return () => { cancelled = true; };
  }, [admin]);
  useEffect(() => {
    if (admin) return;
    let cancelled = false;
    fetch("/api/business", { cache: "no-store" }).then(async (response) => {
      const payload = await response.json() as { data?: { business?: { category?: string } } };
      if (!cancelled) setBusinessCategory(payload.data?.business?.category ?? "");
    }).catch(() => { if (!cancelled) setBusinessCategory(""); });
    return () => { cancelled = true; };
  }, [admin]);
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push(admin ? "/admin/login" : "/login");
    router.refresh();
  }
  return (
    <div className="app-shell">
      <header className="app-topbar">
        <button
          className="icon-button menu-button"
          type="button"
          aria-label="Open navigation"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <Menu size={22} />
        </button>
        <Brand />
        <div className="topbar-context">
          <span className="topbar-kicker">
            {admin ? "Operations" : "Demo workspace"}
          </span>
          <strong>{admin ? "Administrator" : "B Socio AR"}</strong>
        </div>
        <button
          className="button button-secondary topbar-action"
          onClick={logout}
        >
          Sign out
        </button>
      </header>
      {open ? (
        <button
          className="drawer-scrim"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <aside
        className={`app-sidebar ${open ? "is-open" : ""}`}
        aria-label={admin ? "Administrator navigation" : "Customer navigation"}
      >
        <div className="sidebar-head">
          <Brand />
          <button
            className="icon-button close-button"
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          >
            <X size={22} />
          </button>
        </div>
        <nav className="sidebar-nav" aria-label={admin ? "Platform sections" : "Workspace sections"}>
          {navGroups.map((group) => (
            <div className="sidebar-group" key={group.label}>
              <div className="sidebar-label">{group.label}</div>
              {group.items.map(([label, href, Icon]) => {
                const active =
                  href === (admin ? "/admin" : "/dashboard")
                    ? pathname === href
                    : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={active ? "active" : ""}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon size={18} />
                    <span>{label}</span>
                    {active ? (
                      <ChevronRight className="nav-arrow" size={16} />
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <BriefcaseBusiness size={18} />
          <div>
            <strong>{admin ? "Controlled release" : "Custom package"}</strong>
            <span>
              {admin ? "Review before publish" : "Prepared after demo approval"}
            </span>
          </div>
        </div>
      </aside>
      <main className="app-main" id="main-content">
        {children}
      </main>
      <nav className="mobile-bottom-nav" aria-label="Quick navigation">
        {(admin ? visibleAdminNav.slice(0, 4) : customerNav.slice(0, 4)).map(
          ([label, href, Icon]) => {
            const active =
              href === (admin ? "/admin" : "/dashboard")
                ? pathname === href
                : pathname.startsWith(href);
            return (
              <Link key={href} href={href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
                <Icon size={20} />
                <span>{label.split(" ")[0]}</span>
              </Link>
            );
          },
        )}
      </nav>
    </div>
  );
}
