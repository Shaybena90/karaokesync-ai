import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { JobStatusBadge, ReportStatusBadge } from "./StatusBadge";
import { Field, Input } from "./ui/form";
import { Ltr } from "./ui/misc";

describe("components", () => {
  it("renders Hebrew status labels", () => {
    render(<><JobStatusBadge status="running" /><JobStatusBadge status="succeeded" /><ReportStatusBadge status="draft" /></>);
    expect(screen.getByText("בתהליך")).toBeInTheDocument();
    expect(screen.getByText("הושלם")).toBeInTheDocument();
    expect(screen.getByText("טיוטה")).toBeInTheDocument();
  });
  it("links field label and error for accessibility", () => {
    render(<Field label="מספר תיק" error="שדה חובה" required><Input /></Field>);
    const input = screen.getByLabelText(/מספר תיק/);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("שדה חובה");
  });
  it("isolates technical identifiers as LTR", () => {
    render(<Ltr>192.168.10.23</Ltr>);
    expect(screen.getByText("192.168.10.23")).toHaveAttribute("dir", "ltr");
  });
});
