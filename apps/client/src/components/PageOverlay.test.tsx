import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { domMax, LazyMotion } from "motion/react";
import { PageOverlay, useOverlayIsPage } from "./PageOverlay";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Content() {
  return <p>{useOverlayIsPage() ? "Scrolling document" : "Opening sheet"}</p>;
}
it("opens over the page, becomes the mobile document, and restores the scroll on close", async () => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(max-width: 800px)",
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  vi.spyOn(window, "scrollY", "get").mockReturnValue(1300);
  const scroll = vi.spyOn(window, "scrollTo");
  const view = render(
    <LazyMotion features={domMax}>
      <PageOverlay onDismiss={() => {}}>
        <Content />
      </PageOverlay>
    </LazyMotion>,
  );
  // While it animates in, the page stays where it was beneath the sheet, so a
  // cover can fly from its card.
  const layer = document.querySelector(".modal-layer")!;
  expect(screen.getByText("Opening sheet")).toBeInTheDocument();
  expect(layer).not.toHaveClass("is-page");
  expect(document.body).not.toHaveClass("mobile-dialog-page");
  expect(scroll).not.toHaveBeenCalled();
  await waitFor(() => expect(layer).toHaveClass("is-page"));
  expect(screen.getByText("Scrolling document")).toBeInTheDocument();
  expect(document.body).toHaveClass("mobile-dialog-page");
  expect(scroll).toHaveBeenLastCalledWith(0, 0);
  await waitFor(() =>
    expect(document.documentElement.style.overflow).not.toBe("hidden"),
  );
  act(() => view.unmount());
  expect(document.body).not.toHaveClass("mobile-dialog-page");
  expect(scroll).toHaveBeenCalledWith(0, 1300);
});
