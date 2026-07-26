"use client";

import { usePathname } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";

export function AdminLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/admin/login" || pathname === "/admin/forgot-password") return children;
  return <DashboardShell admin>{children}</DashboardShell>;
}
