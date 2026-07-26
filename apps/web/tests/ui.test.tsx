import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Progress } from "@bsocio/ui";
import HomePage from "@/app/page";
import { LoginForm } from "@/components/auth-forms";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("public and shared UI", () => {
  it("renders the primary demo outcome and call to action", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Turn product photos");
    expect(screen.getAllByRole("link", { name: /start a demo|create your five-product demo/i }).length).toBeGreaterThan(0);
  });

  it("clamps accessible progress values", () => {
    render(<Progress value={130} label="Generating mesh" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("offers Google sign-in and administrator password recovery with accessible links", () => {
    render(<LoginForm admin googleEnabled />);
    expect(screen.getByRole("link", { name: /continue with google/i })).toHaveAttribute("href", "/api/auth/google/start?portal=admin");
    expect(screen.getByRole("link", { name: /forgot password/i })).toHaveAttribute("href", "/admin/forgot-password");
  });
});
