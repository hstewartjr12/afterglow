import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { domMax, LazyMotion } from "motion/react";
import { PageOverlay, useOverlayIsPage } from "./PageOverlay";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Content() {
  return <p>{useOverlayIsPage() ? "Scrolling document" : "Fixed sheet"}</p>;
}
it("opens as the mobile document immediately and restores the original scroll on close", () => {
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
  expect(screen.getByText("Scrolling document")).toBeInTheDocument();
  expect(document.querySelector(".modal-layer")).toHaveClass("is-page");
  expect(document.body).toHaveClass("mobile-dialog-page");
  expect(document.documentElement.style.overflow).not.toBe("hidden");
  expect(scroll).toHaveBeenCalledWith(0, 0);
  act(() => view.unmount());
  expect(document.body).not.toHaveClass("mobile-dialog-page");
  expect(scroll).toHaveBeenLastCalledWith(0, 1300);
});
