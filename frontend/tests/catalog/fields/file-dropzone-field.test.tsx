import { zodResolver } from "@hookform/resolvers/zod";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useForm } from "react-hook-form";
import type { Resolver } from "react-hook-form";
import { z } from "zod";

import { FileDropzoneField } from "@/components/catalog/run-form/fields/file-dropzone-field";
import type { FieldDescriptor } from "@/lib/catalog/schema-form";

const attachmentsField: FieldDescriptor = {
  name: "attachments",
  label: "Attachments",
  help: "Upload up to 2 supporting files.",
  control: "files",
  accept: [".txt", ".pdf"],
  maxFiles: 2,
  required: true,
};

function makeFile(name: string, content = "content"): File {
  return new File([content], name, { type: "text/plain" });
}

/**
 * `FileDropzoneField` is `Controller`-based (see the component's own header
 * comment), so this harness passes `control` rather than `register` --
 * still a real `useForm()` instance, never a mocked `Control`/`errors`
 * object.
 *
 * `alwaysInvalid` requires at least one file (`z.array(...).min(1)`) so a
 * genuine `formState.errors` entry can be produced on submit without any
 * selection, without hand-crafting an errors object.
 */
function Harness({
  onValid,
  alwaysInvalid = false,
}: {
  onValid?: (values: Record<string, unknown>) => void;
  alwaysInvalid?: boolean;
}) {
  const schema = alwaysInvalid
    ? z.object({
        attachments: z.array(z.instanceof(File)).min(1, "At least one file is required"),
      })
    : z.object({ attachments: z.array(z.instanceof(File)).max(2) });
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<Record<string, unknown>>({
    // react-hook-form's `Resolver<T>` is invariant in `T` -- see
    // `text-field.test.tsx`'s harness for why this cast is needed.
    resolver: zodResolver(schema) as unknown as Resolver<Record<string, unknown>>,
    defaultValues: { attachments: [] },
  });

  return (
    <form onSubmit={handleSubmit((values) => onValid?.(values))}>
      <FileDropzoneField field={attachmentsField} control={control} errors={errors} />
      <button type="submit">Submit</button>
    </form>
  );
}

function getDropzone(container: HTMLElement): HTMLElement {
  const dropzone = container.querySelector('[data-slot="file-dropzone"]');
  if (!dropzone) throw new Error("dropzone not found");
  return dropzone as HTMLElement;
}

describe("FileDropzoneField", () => {
  it("renders the label and help text", () => {
    render(<Harness />);

    expect(screen.getByText("Attachments")).toBeInTheDocument();
    expect(screen.getByText("Upload up to 2 supporting files.")).toBeInTheDocument();
  });

  it("associates the label with the native file input via a generated id", () => {
    render(<Harness />);

    const input = screen.getByLabelText("Attachments");
    expect(input.tagName).toBe("INPUT");
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAttribute("multiple");
  });

  it("applies field.accept as a comma-joined native accept attribute", () => {
    render(<Harness />);

    expect(screen.getByLabelText("Attachments")).toHaveAttribute("accept", ".txt,.pdf");
  });

  it("shows no error and is not aria-invalid before submitting", () => {
    render(<Harness />);

    expect(screen.getByLabelText("Attachments")).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a validation error message after an invalid submit", async () => {
    const user = userEvent.setup();
    render(<Harness alwaysInvalid />);

    await user.click(screen.getByRole("button", { name: /submit/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("At least one file is required");

    const input = screen.getByLabelText("Attachments");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", alert.id);
  });

  it("selecting files via the native picker updates the form value with the real File[]", async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();
    render(<Harness onValid={onValid} />);

    const file = makeFile("notes.txt");
    await user.upload(screen.getByLabelText("Attachments"), file);

    expect(screen.getByText("notes.txt")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(onValid).toHaveBeenCalledWith({ attachments: [file] });
  });

  it("dropping files onto the dropzone updates the form value", async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();
    const { container } = render(<Harness onValid={onValid} />);

    const file = makeFile("dropped.pdf");
    fireEvent.drop(getDropzone(container), {
      dataTransfer: { files: [file] },
    });

    expect(await screen.findByText("dropped.pdf")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(onValid).toHaveBeenCalledWith({ attachments: [file] });
  });

  it("selecting more than maxFiles shows a validation message and keeps the previous selection", async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();
    render(<Harness onValid={onValid} />);

    const first = makeFile("first.txt");
    await user.upload(screen.getByLabelText("Attachments"), first);
    expect(screen.getByText("first.txt")).toBeInTheDocument();

    const overLimit = [makeFile("a.txt"), makeFile("b.txt"), makeFile("c.txt")];
    await user.upload(screen.getByLabelText("Attachments"), overLimit);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/up to 2 files/i);

    // Previous valid selection is kept, not truncated or replaced.
    expect(screen.getByText("first.txt")).toBeInTheDocument();
    expect(screen.queryByText("a.txt")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /submit/i }));
    expect(onValid).toHaveBeenCalledWith({ attachments: [first] });
  });
});
