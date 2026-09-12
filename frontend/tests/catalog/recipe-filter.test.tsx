import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RecipeFilter } from "@/components/catalog/recipe-filter";

/**
 * `RecipeFilter` is a controlled component (value/onChange only) — it does
 * not own its own state. To exercise real typing behavior (each keystroke
 * producing a new value), tests that type into the field wrap it in a small
 * stateful harness that feeds `onChange` back into `value`, while also
 * recording every call through a spy.
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
    <RecipeFilter
      value={value}
      onChange={(next) => {
        onChangeSpy(next);
        setValue(next);
      }}
    />
  );
}

describe("RecipeFilter", () => {
  it("renders with an initial value", () => {
    render(<RecipeFilter value="pasta" onChange={vi.fn()} />);

    const input = screen.getByRole("textbox", { name: /search recipes/i });
    expect(input).toHaveValue("pasta");
  });

  it("calls onChange on every keystroke and never drops the final typed value", async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(<ControlledHarness onChangeSpy={onChangeSpy} />);

    const input = screen.getByRole("textbox", { name: /search recipes/i });
    await user.type(input, "tacos");

    // Not debounced/lossy: at least one onChange call per typed character,
    // and the very last call must carry the complete typed string.
    expect(onChangeSpy.mock.calls.length).toBeGreaterThanOrEqual("tacos".length);
    expect(onChangeSpy).toHaveBeenLastCalledWith("tacos");
  });

  it("does not show a clear button when the value is empty", () => {
    render(<RecipeFilter value="" onChange={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /clear/i })).not.toBeInTheDocument();
  });

  it("shows a clear button when there is a value, and clicking it calls onChange with an empty string", async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(<RecipeFilter value="soup" onChange={onChangeSpy} />);

    const clearButton = screen.getByRole("button", { name: /clear/i });
    expect(clearButton).toBeInTheDocument();

    await user.click(clearButton);

    expect(onChangeSpy).toHaveBeenCalledWith("");
    expect(onChangeSpy).toHaveBeenCalledTimes(1);
  });

  it("has an accessible name via a programmatically associated label, not just placeholder text", () => {
    render(<RecipeFilter value="" onChange={vi.fn()} />);

    // getByRole with `name` resolves the input's accessible name via the
    // accessibility tree (label association, aria-label, etc.) — it does
    // NOT fall back to placeholder text, so this proves real association.
    const input = screen.getByRole("textbox", { name: /search recipes/i });
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("placeholder");
  });

  it("does not mutate the DOM to filter anything -- it only reports value changes", () => {
    const onChangeSpy = vi.fn();
    const { container } = render(<RecipeFilter value="zzz-no-match" onChange={onChangeSpy} />);

    // A purely presentational input renders exactly one text input and
    // nothing that looks like a results list.
    expect(container.querySelectorAll("input")).toHaveLength(1);
    expect(container.querySelectorAll("li")).toHaveLength(0);
  });
});
