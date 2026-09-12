import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BackendUrlField } from "@/components/settings/backend-url-field";

/**
 * `BackendUrlField` is a controlled component (value/onChange only) — it
 * does not own its own state. To exercise real typing behavior (each
 * keystroke producing a new value), tests that type into the field wrap it
 * in a small stateful harness that feeds `onChange` back into `value`,
 * while also recording every call through a spy.
 */
function ControlledHarness({
  initialValue = "",
  onChangeSpy,
}: {
  initialValue?: string;
  onChangeSpy: (value: string) => void;
}) {
  const [value, setValue] = React.useState(initialValue);
  return (
    <BackendUrlField
      value={value}
      onChange={(next) => {
        onChangeSpy(next);
        setValue(next);
      }}
    />
  );
}

describe("BackendUrlField", () => {
  it("renders with an initial value", () => {
    render(<BackendUrlField value="https://api.example.com" onChange={vi.fn()} />);

    const input = screen.getByLabelText(/custom backend url/i);
    expect(input).toHaveValue("https://api.example.com");
  });

  it("calls onChange with each raw keystroke as the user types", async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(<ControlledHarness onChangeSpy={onChangeSpy} />);

    const input = screen.getByLabelText(/custom backend url/i);
    await user.type(input, "https://x.com");

    // Not debounced: at least one onChange call per typed character.
    expect(onChangeSpy.mock.calls.length).toBeGreaterThanOrEqual("https://x.com".length);
    expect(onChangeSpy).toHaveBeenLastCalledWith("https://x.com");
  });

  it("passes through raw values without trimming or transforming them", async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(<ControlledHarness onChangeSpy={onChangeSpy} />);

    const input = screen.getByLabelText(/custom backend url/i);
    await user.type(input, "  ftp://x  ");

    // The component must not strip whitespace or otherwise rewrite the
    // value itself — that normalization belongs to the schema on read.
    expect(onChangeSpy).toHaveBeenLastCalledWith("  ftp://x  ");
  });

  it("shows a validation message for a non-http(s) value (ftp://)", () => {
    render(<BackendUrlField value="ftp://example.com" onChange={vi.fn()} />);

    const input = screen.getByLabelText(/custom backend url/i);
    expect(screen.getByText(/must be an http\(s\) url/i)).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("shows a validation message for a non-URL value", () => {
    render(<BackendUrlField value="not a url" onChange={vi.fn()} />);

    const input = screen.getByLabelText(/custom backend url/i);
    expect(screen.getByText(/must be an http\(s\) url/i)).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("shows no error for a valid https URL", () => {
    render(<BackendUrlField value="https://api.example.com" onChange={vi.fn()} />);

    const input = screen.getByLabelText(/custom backend url/i);
    expect(screen.queryByText(/must be an http\(s\) url/i)).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute("aria-invalid", "true");
  });

  it("shows no error for an empty value", () => {
    render(<BackendUrlField value="" onChange={vi.fn()} />);

    const input = screen.getByLabelText(/custom backend url/i);
    expect(screen.queryByText(/must be an http\(s\) url/i)).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute("aria-invalid", "true");
  });
});
