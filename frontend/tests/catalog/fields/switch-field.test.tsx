import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useForm } from "react-hook-form";
import type { Resolver } from "react-hook-form";
import { z } from "zod";

import { SwitchField } from "@/components/catalog/run-form/fields/switch-field";
import type { FieldDescriptor } from "@/lib/catalog/schema-form";

const streamField: FieldDescriptor = {
  name: "stream",
  label: "Stream responses",
  help: "Emit tokens as they're generated instead of waiting for the full reply.",
  control: "switch",
  required: true,
};

/**
 * `SwitchField` is `Controller`-based (see the component's own header
 * comment), so this harness passes `control` rather than `register` --
 * still a real `useForm()` instance, never a mocked `Control`/`errors`
 * object.
 *
 * `alwaysInvalid` swaps in a `.refine` that only accepts `true`, so a
 * genuine `formState.errors` entry can be produced (a plain
 * `z.boolean()` never rejects either boolean value) without hand-crafting
 * an errors object.
 */
function Harness({
  onValid,
  alwaysInvalid = false,
}: {
  onValid?: (values: Record<string, unknown>) => void;
  alwaysInvalid?: boolean;
}) {
  const schema = alwaysInvalid
    ? z.object({ stream: z.boolean().refine((value) => value, "Streaming must be enabled") })
    : z.object({ stream: z.boolean() });
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<Record<string, unknown>>({
    // react-hook-form's `Resolver<T>` is invariant in `T` -- see
    // `text-field.test.tsx`'s harness for why this cast is needed.
    resolver: zodResolver(schema) as unknown as Resolver<Record<string, unknown>>,
    defaultValues: { stream: false },
  });

  return (
    <form onSubmit={handleSubmit((values) => onValid?.(values))}>
      <SwitchField field={streamField} control={control} errors={errors} />
      <button type="submit">Submit</button>
    </form>
  );
}

describe("SwitchField", () => {
  it("renders the label and help text", () => {
    render(<Harness />);

    expect(screen.getByText("Stream responses")).toBeInTheDocument();
    expect(
      screen.getByText("Emit tokens as they're generated instead of waiting for the full reply.")
    ).toBeInTheDocument();
  });

  it("renders the label beside the switch, not above it", () => {
    render(<Harness />);

    const label = screen.getByText("Stream responses");
    const row = label.parentElement;
    expect(row).toHaveClass("items-center", "justify-between");
    expect(row).toContainElement(screen.getByRole("switch"));
  });

  it("associates the label with the switch via a generated id", () => {
    render(<Harness />);

    // `Switch`'s `id` targets its hidden native `<input>`; Base UI's own
    // `useAriaLabelledBy` then wires the *visible* `role="switch"` element's
    // `aria-labelledby` to that same `<label htmlFor>`, so its accessible
    // name resolves correctly too (verified by reading
    // `@base-ui/react`'s `switch/root/SwitchRoot.js` -- see the component's
    // header comment).
    expect(screen.getByRole("switch", { name: "Stream responses" })).toBeInTheDocument();
  });

  it("shows no error and is not aria-invalid before submitting", () => {
    render(<Harness />);

    expect(screen.getByRole("switch")).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a validation error message after an invalid submit", async () => {
    const user = userEvent.setup();
    render(<Harness alwaysInvalid />);

    await user.click(screen.getByRole("button", { name: /submit/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Streaming must be enabled");

    const control = screen.getByRole("switch");
    expect(control).toHaveAttribute("aria-invalid", "true");
    expect(control).toHaveAttribute("aria-describedby", alert.id);
  });

  it("toggling the switch updates the form value", async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();
    render(<Harness onValid={onValid} />);

    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");

    await user.click(screen.getByRole("switch"));
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");

    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(onValid).toHaveBeenCalledWith({ stream: true });
  });
});
