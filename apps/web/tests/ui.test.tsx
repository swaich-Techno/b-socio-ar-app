import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Progress } from "@bsocio/ui";
import HomePage from "@/app/page";

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
});
