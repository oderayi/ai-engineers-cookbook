import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("test pipeline smoke test", () => {
  it("renders and finds text via Testing Library + jsdom", () => {
    render(<p>hello skillet</p>);
    expect(screen.getByText("hello skillet")).toBeInTheDocument();
  });
});
