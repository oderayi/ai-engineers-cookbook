import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useForm } from "react-hook-form";
import type { Resolver } from "react-hook-form";
import { z } from "zod";

import { TextareaField } from "@/components/catalog/run-form/fields/textarea-field";
import type { FieldDescriptor } from "@/lib/catalog/schema-form";

const tagsField: FieldDescriptor = {
  name: "tags",
  label: "Tags",
  help: "One tag per line.",
  control: "textarea",
  required: true,
};

/**
 * Mirrors `text-field.test.tsx`'s harness. `TextareaField` is purely
 * presentational -- per `schema-form.ts`, the real newline-to-array split
 * for a `"textarea"` control lives in the compiled zod validator, not this
 * component. So this harness's own zod schema validates the raw string
 * (e.g. non-empty), the same shape `register` hands react-hook-form for a
 * native `<textarea>`; it does not need to duplicate the array-splitting
 * logic to prove this component renders/wires correctly.
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
      z.object({ tags: z.string().min(1, "At least one tag is required") }),
    ) as unknown as Resolver<Record<string, unknown>>,
    defaultValues: { tags: "" },
  });

  return (
    <form onSubmit={handleSubmit((values) => onValid?.(values))}>
      <TextareaField field={tagsField} register={register} errors={errors} />
      <button type="submit">Submit</button>
    </form>
  );
}

describe("TextareaField", () => {
  it("renders the label and help text", () => {
    render(<Harness />);

    expect(screen.getByText("Tags")).toBeInTheDocument();
    expect(screen.getByText("One tag per line.")).toBeInTheDocument();
  });

  it("associates the label with a native textarea via a generated id", () => {
    render(<Harness />);

    const textarea = screen.getByLabelText("Tags");
    expect(textarea.tagName).toBe("TEXTAREA");
  });

  it("shows a validation error message after an invalid submit", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: /submit/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("At least one tag is required");

    const textarea = screen.getByLabelText("Tags");
    expect(textarea).toHaveAttribute("aria-invalid", "true");
    expect(textarea).toHaveAttribute("aria-describedby", alert.id);
  });

  it("updates the form value as the user types (raw string, no line-splitting here)", async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();
    render(<Harness onValid={onValid} />);

    await user.type(screen.getByLabelText("Tags"), "a{enter}b{enter}c");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(onValid).toHaveBeenCalledWith({ tags: "a\nb\nc" });
  });
});
