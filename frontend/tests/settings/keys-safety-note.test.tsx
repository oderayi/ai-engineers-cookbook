import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { KeysSafetyNote } from "@/components/settings/keys-safety-note";

describe("KeysSafetyNote", () => {
  it("renders an alert explaining keys stay in the browser and are only sent when running a recipe", () => {
    render(<KeysSafetyNote />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/browser/i);
    expect(alert).toHaveTextContent(/localstorage|local storage/i);
    expect(alert).toHaveTextContent(/run/i);
  });

  it("accepts an optional className for composition", () => {
    render(<KeysSafetyNote className="mt-4" />);
    expect(screen.getByRole("alert")).toHaveClass("mt-4");
  });
});
