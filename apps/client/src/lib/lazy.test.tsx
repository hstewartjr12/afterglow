import { Suspense } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { preloadable } from "./lazy";

afterEach(cleanup);
it("renders a preloaded screen immediately on its first visit without a fallback", async () => {
  const load = vi.fn(async () => () => <h1>Ready screen</h1>);
  const Screen = preloadable(load);
  await Promise.all([Screen.preload(), Screen.preload()]);
  render(
    <Suspense fallback={<p>Loading screen</p>}>
      <Screen />
    </Suspense>,
  );
  expect(
    screen.getByRole("heading", { name: "Ready screen" }),
  ).toBeInTheDocument();
  expect(screen.queryByText("Loading screen")).not.toBeInTheDocument();
  expect(load).toHaveBeenCalledTimes(1);
});
