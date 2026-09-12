import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useForm } from "react-hook-form";
import type { Resolver } from "react-hook-form";
import { z } from "zod";

import { NumberField } from "@/components/catalog/run-form/fields/number-field";
import type { FieldDescriptor } from "@/lib/catalog/schema-form";

const temperatureField: FieldDescriptor = {
  name: "temperature",
  label: "Temperature",
  help: "Sampling temperature.",
  control: "number",
  min: 0,
  max: 2,
  step: 0.1,
  required: true,
};

/**
 * Mirrors `text-field.test.tsx`'s harness. The zod schema mirrors what
 * `compileForm` (`lib/catalog/schema-form.ts`) would build for a bounded
 * number field, so an out-of-range submit produces a genuine
 * `formState.errors` entry rather than a hand-crafted one.
 */
function Harness({ onValid }: { onValid?: (values: Record<string, unknown>) => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Record<string, unknown>>({
    // See text-field.test.tsx's harness for why this cast is needed --
    // react-hook-form's `Resolver<T>` is invariant in `T`.
    resolver: zodResolver(
      z.object({
        temperature: z.number().min(0, "Must be at least 0").max(2, "Must be at most 2"),
      }),
    ) as unknown as Resolver<Record<string, unknown>>,
    defaultValues: { temperature: 1 },
  });

  return (
    // noValidate: the native `min`/`max` attributes this component sets are
    // for browser spinner/affordance purposes (per its own header comment),
    // not to have the browser's own constraint-validation UI intercept
    // submission ahead of react-hook-form's resolver -- without it, jsdom
    // (like real browsers) blocks the submit event entirely for an
    // out-of-range value and the zod-driven error below never gets a
    // chance to run.
    <form noValidate onSubmit={handleSubmit((values) => onValid?.(values))}>
      <NumberField field={temperatureField} register={register} errors={errors} />
      <button type="submit">Submit</button>
    </form>
  );
}

describe("NumberField", () => {
  it("renders the label and help text", () => {
    render(<Harness />);

    expect(screen.getByText("Temperature")).toBeInTheDocument();
    expect(screen.getByText("Sampling temperature.")).toBeInTheDocument();
  });

  it("renders a number input associated with the label, with native min/max/step", () => {
    render(<Harness />);

    const input = screen.getByLabelText("Temperature");
    expect(input).toHaveAttribute("type", "number");
    expect(input).toHaveAttribute("min", "0");
    expect(input).toHaveAttribute("max", "2");
    expect(input).toHaveAttribute("step", "0.1");
  });

  it("shows a validation error message after an invalid submit", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByLabelText("Temperature");
    await user.clear(input);
    await user.type(input, "5");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Must be at most 2");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", alert.id);
  });

  it("updates the form value (as a number) as the user types", async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();
    render(<Harness onValid={onValid} />);

    const input = screen.getByLabelText("Temperature");
    await user.clear(input);
    await user.type(input, "1.5");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(onValid).toHaveBeenCalledWith({ temperature: 1.5 });
  });
});
