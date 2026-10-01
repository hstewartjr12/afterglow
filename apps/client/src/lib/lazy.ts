import { lazy, type ComponentType } from "react";

/**
 * React.lazy, plus a `preload` that fetches the chunk ahead of time. A plain
 * lazy component suspends on its first render even when its chunk is already
 * loaded, and React then shows the fallback for at least 300ms. Once preloaded,
 * this one hands React the component synchronously, so it renders at once.
 */
export function preloadable<P extends object>(
  load: () => Promise<ComponentType<P>>,
) {
  let component: ComponentType<P> | undefined;
  let pending: Promise<ComponentType<P>> | undefined;
  const preload = () =>
    (pending ??= load().then(
      (loaded) => (component = loaded),
      (error) => {
        pending = undefined;
        throw error;
      },
    ));
  type Module = { default: ComponentType<P> };
  const Lazy = lazy(() =>
    component
      ? // React reads a thenable that resolves synchronously without suspending.
        ({
          then: (resolve: (module: Module) => void) =>
            resolve({ default: component! }),
        } as unknown as Promise<Module>)
      : preload().then((loaded) => ({ default: loaded })),
  );
  return Object.assign(Lazy, { preload });
}
