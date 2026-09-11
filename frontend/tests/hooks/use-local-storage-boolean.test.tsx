import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useLocalStorageBoolean } from "@/hooks/use-local-storage-boolean";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  window.localStorage.clear();
});

function Demo({ storageKey, defaultValue }: { storageKey: string; defaultValue: boolean }) {
  const [value, setValue] = useLocalStorageBoolean(storageKey, defaultValue);
  return (
    <button type="button" onClick={() => setValue((v) => !v)}>
      {String(value)}
    </button>
  );
}

describe("useLocalStorageBoolean", () => {
  it("returns the default value when nothing is stored", () => {
    render(<Demo storageKey="test.flag" defaultValue={false} />);
    expect(screen.getByRole("button")).toHaveTextContent("false");
  });

  it("reads an existing stored value on mount", () => {
    window.localStorage.setItem("test.flag", "true");
    render(<Demo storageKey="test.flag" defaultValue={false} />);
    expect(screen.getByRole("button")).toHaveTextContent("true");
  });

  it("persists a change to localStorage and re-renders", async () => {
    const user = userEvent.setup();
    render(<Demo storageKey="test.flag" defaultValue={false} />);

    await user.click(screen.getByRole("button"));

    expect(screen.getByRole("button")).toHaveTextContent("true");
    expect(window.localStorage.getItem("test.flag")).toBe("true");
  });

  it("falls back to the default value if localStorage throws", () => {
    const original = window.localStorage.getItem;
    window.localStorage.getItem = () => {
      throw new Error("blocked");
    };
    try {
      render(<Demo storageKey="test.flag" defaultValue={true} />);
      expect(screen.getByRole("button")).toHaveTextContent("true");
    } finally {
      window.localStorage.getItem = original;
    }
  });
});
