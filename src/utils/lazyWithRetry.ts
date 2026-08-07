import { lazy, type ComponentType, type LazyExoticComponent } from "react";

// ComponentType's props are intentionally generic; preserving the imported
// component type is safer than widening route components to unknown props.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = ComponentType<any>;
type ComponentModule<T extends AnyComponent> = { default: T };

/**
 * Reload once when a version deployment removes a chunk referenced by an
 * already-open tab. A successful import clears the guard for future deploys.
 */
export function lazyWithRetry<T extends AnyComponent>(
  key: string,
  importer: () => Promise<ComponentModule<T>>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    const storageKey = `chunk-reload:${key}`;

    try {
      const module = await importer();
      sessionStorage.removeItem(storageKey);
      return module;
    } catch (error) {
      if (!sessionStorage.getItem(storageKey)) {
        sessionStorage.setItem(storageKey, "1");
        window.location.reload();
        return new Promise<ComponentModule<T>>(() => undefined);
      }

      sessionStorage.removeItem(storageKey);
      throw error;
    }
  });
}
