import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useForm } from "react-hook-form";
import type { Resolver } from "react-hook-form";
import { z } from "zod";

import { TextField } from "@/components/catalog/run-form/fields/text-field";
import type { FieldDescriptor } from "@/lib/catalog/schema-form";

const textField: FieldDescriptor = {
  name: "prompt",
  label: "Prompt",
  help: "What should the recipe do?",
  control: "text",
  required: true,
};

/**
 * `TextField` only takes `field`/`register`/`errors` -- it owns no state of
 * its own. To exercise it against a real react-hook-form instance (not a
 * mocked `register`/`errors`), this harness calls `useForm` with a real
 * zod resolver and renders a submit button, so an actual invalid submit
 * populates `formState.errors` the same way the real run form will.
 */
function Harness({ onValid }: { onValid?: (values: Record<string, unknown>) => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Record<string, unknown>>({
    // react-hook-form's `Resolver<T>` is invariant in `T`, so a resolver
    // built from a concrete zod object shape is never structurally
    // assignable to `Resolver<Record<string, unknown>>` -- the loosened
    // shape `TextField`'s props require (matching every field component's
    // common prop shape). The cast is safe: the schema's key ("prompt")
    // matches `defaultValues` below, and this harness's whole point is
    // exercising a real resolver/validation run, not the type-level
    // relationship between the two.
    resolver: zodResolver(
      z.object({ prompt: z.string().min(1, "Prompt is required") }),
    ) as unknown as Resolver<Record<string, unknown>>,
    defaultValues: { prompt: "" },
  });

  return (
    <form onSubmit={handleSubmit((values) => onValid?.(values))}>
      <TextField field={textField} register={register} errors={errors} />
      <button type="submit">Submit</button>
    </form>
  );
}

describe("TextField", () => {
  it("renders the label and help text", () => {
    render(<Harness />);

    expect(screen.getByText("Prompt")).toBeInTheDocument();
    expect(screen.getByText("What should the recipe do?")).toBeInTheDocument();
  });

  it("associates the label with the input via a generated id", () => {
    render(<Harness />);

    const input = screen.getByLabelText("Prompt");
    expect(input.tagName).toBe("INPUT");
    expect(input).toHaveAttribute("type", "text");
  });

  it("shows no error and is not aria-invalid before submitting", () => {
    render(<Harness />);

    expect(screen.getByLabelText("Prompt")).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a validation error message after an invalid submit", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: /submit/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Prompt is required");

    const input = screen.getByLabelText("Prompt");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", alert.id);
  });

  it("updates the form value as the user types", async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();
    render(<Harness onValid={onValid} />);

    await user.type(screen.getByLabelText("Prompt"), "hello world");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(onValid).toHaveBeenCalledWith({ prompt: "hello world" });
  });
});
