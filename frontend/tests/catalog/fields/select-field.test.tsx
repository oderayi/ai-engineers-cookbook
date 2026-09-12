import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeAll } from "vitest";
import { useForm } from "react-hook-form";
import type { Resolver, UseFormGetValues } from "react-hook-form";
import { z } from "zod";

import { SelectField } from "@/components/catalog/run-form/fields/select-field";
import type { FieldDescriptor } from "@/lib/catalog/schema-form";

// `components/ui/select.tsx` is backed by `@base-ui/react`'s floating-ui
// positioning, which observes the trigger/popup with `ResizeObserver` when
// the popup opens. jsdom doesn't implement `ResizeObserver` at all -- this
// stub only exists so opening the popup in a test doesn't throw; no test
// here asserts on anything resize-related.
beforeAll(() => {
  if (typeof window !== "undefined" && !window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const modelField: FieldDescriptor = {
  name: "model",
  label: "Model",
  help: "Which model should run this recipe.",
  control: "select",
  options: ["gpt-4", "gpt-4-mini", "claude"],
  required: true,
};

/**
 * `SelectField` is `Controller`-based (see the component's own header
 * comment), so this harness passes `control` rather than `register` --
 * still a real `useForm()` instance, never a mocked `Control`/`errors`
 * object. `onFormReady` hands the test the real `getValues` so it can
 * assert the selected value landed in the form without going through a
 * submit round-trip.
 */
function Harness({
  onValid,
  onFormReady,
}: {
  onValid?: (values: Record<string, unknown>) => void;
  onFormReady?: (getValues: UseFormGetValues<Record<string, unknown>>) => void;
}) {
  const {
    control,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<Record<string, unknown>>({
    // react-hook-form's `Resolver<T>` is invariant in `T` -- see
    // `text-field.test.tsx`'s harness for why this cast is needed.
    resolver: zodResolver(
      z.object({ model: z.enum(["gpt-4", "gpt-4-mini", "claude"]) }),
    ) as unknown as Resolver<Record<string, unknown>>,
    defaultValues: { model: null },
  });

  useEffect(() => {
    onFormReady?.(getValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <form onSubmit={handleSubmit((values) => onValid?.(values))}>
      <SelectField field={modelField} control={control} errors={errors} />
      <button type="submit">Submit</button>
    </form>
  );
}

describe("SelectField", () => {
  it("renders the label and help text", () => {
    render(<Harness />);

    expect(screen.getByText("Model")).toBeInTheDocument();
    expect(screen.getByText("Which model should run this recipe.")).toBeInTheDocument();
  });

  it("associates the label with the select trigger via a generated id", () => {
    render(<Harness />);

    const trigger = screen.getByLabelText("Model");
    expect(trigger.tagName).toBe("BUTTON");
  });

  it("shows no error and is not aria-invalid before submitting", () => {
    render(<Harness />);

    expect(screen.getByLabelText("Model")).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a validation error message after an invalid submit", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: /submit/i }));

    const alert = await screen.findByRole("alert");
    const trigger = screen.getByLabelText("Model");
    expect(trigger).toHaveAttribute("aria-invalid", "true");
    expect(trigger).toHaveAttribute("aria-describedby", alert.id);
  });

  it("renders every option", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByLabelText("Model"));

    expect(await screen.findByRole("option", { name: "gpt-4" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "gpt-4-mini" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "claude" })).toBeInTheDocument();
  });

  it("selecting an option updates the form value", async () => {
    const user = userEvent.setup();
    let getValues: UseFormGetValues<Record<string, unknown>> | undefined;
    render(<Harness onFormReady={(fn) => (getValues = fn)} />);

    await user.click(screen.getByLabelText("Model"));
    await user.click(await screen.findByRole("option", { name: "claude" }));

    expect(getValues?.("model")).toBe("claude");
  });

  it("submits the selected value through the real form", async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();
    render(<Harness onValid={onValid} />);

    await user.click(screen.getByLabelText("Model"));
    await user.click(await screen.findByRole("option", { name: "gpt-4-mini" }));
    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(onValid).toHaveBeenCalledWith({ model: "gpt-4-mini" });
  });
});
