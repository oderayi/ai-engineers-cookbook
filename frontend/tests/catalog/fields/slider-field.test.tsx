import { zodResolver } from "@hookform/resolvers/zod";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useForm } from "react-hook-form";
import type { Resolver } from "react-hook-form";
import { z } from "zod";

import { SliderField } from "@/components/catalog/run-form/fields/slider-field";
import type { FieldDescriptor } from "@/lib/catalog/schema-form";

const topKField: FieldDescriptor = {
  name: "topK",
  label: "Top K",
  help: "Number of candidates to sample from.",
  control: "slider",
  min: 1,
  max: 10,
  step: 1,
  default: 3,
  required: true,
};

/**
 * `SliderField` is `Controller`-based (see the component's own header
 * comment for why), so this harness passes `control` rather than
 * `register` -- still a real `useForm()` instance, never a mocked
 * `Control`/`errors` object.
 *
 * `alwaysInvalid` swaps in a zod lower bound (`min: 100`) that this field's
 * own 1-10 range can never satisfy: the slider UI itself can never drag out
 * of `field.min`/`field.max`, so the only way to exercise a genuine
 * `formState.errors` entry (without hand-crafting one) for the
 * error-rendering assertion is a validator that always rejects the value --
 * proving `SliderField` correctly displays whatever real error react-hook-form
 * hands it. The value-update test uses the normal (satisfiable) schema so a
 * real `onValid` submission proves the value round-trips through the form.
 */
function Harness({
  onValid,
  alwaysInvalid = false,
}: {
  onValid?: (values: Record<string, unknown>) => void;
  alwaysInvalid?: boolean;
}) {
  const schema = alwaysInvalid
    ? z.object({ topK: z.number().min(100, "Must be at least 100") })
    : z.object({ topK: z.number().min(1).max(10) });
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<Record<string, unknown>>({
    // See text-field.test.tsx's harness for why this cast is needed --
    // react-hook-form's `Resolver<T>` is invariant in `T`.
    resolver: zodResolver(schema) as unknown as Resolver<Record<string, unknown>>,
    defaultValues: { topK: 3 },
  });

  return (
    <form onSubmit={handleSubmit((values) => onValid?.(values))}>
      <SliderField field={topKField} control={control} errors={errors} />
      <button type="submit">Submit</button>
    </form>
  );
}

describe("SliderField", () => {
  it("renders the label, help text, and the current value next to the label", () => {
    render(<Harness />);

    expect(screen.getByText("Top K")).toBeInTheDocument();
    expect(screen.getByText("Number of candidates to sample from.")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders a slider respecting min/max/step as native attributes", () => {
    render(<Harness />);

    // The thumb's underlying <input type="range"> (the element with the
    // implicit "slider" role) sits under an ancestor Base UI keeps
    // `visibility: hidden` on until a real layout pass positions it --
    // jsdom never performs one, so `{ hidden: true }` is needed to find it
    // even though nothing here is actually inaccessible in a real browser.
    const slider = screen.getByRole("slider", { hidden: true });
    expect(slider).toHaveAttribute("min", "1");
    expect(slider).toHaveAttribute("max", "10");
    expect(slider).toHaveAttribute("step", "1");
  });

  it("shows a validation error message after an invalid submit", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness alwaysInvalid />);

    await user.click(screen.getByRole("button", { name: /submit/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Must be at least 100");

    // `Slider` (components/ui/slider.tsx) only spreads extra props onto its
    // Root element, not down onto the nested range input -- so
    // aria-invalid/aria-describedby land on the Root (data-slot="slider"),
    // the same element a screen reader announces as the group for this
    // control.
    const sliderRoot = container.querySelector('[data-slot="slider"]');
    expect(sliderRoot).toHaveAttribute("aria-invalid", "true");
    expect(sliderRoot).toHaveAttribute("aria-describedby", alert.id);
  });

  it("updates the form value and the displayed value when the slider is moved", async () => {
    const onValid = vi.fn();
    render(<Harness onValid={onValid} />);

    const slider = screen.getByRole("slider", { hidden: true });
    fireEvent.change(slider, { target: { value: "7" } });

    expect(await screen.findByText("7")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /submit/i }));

    // Real submission through react-hook-form (not just DOM state):
    // proves the Controller-wired value actually reached the form.
    expect(onValid).toHaveBeenCalledWith({ topK: 7 });
  });
});
