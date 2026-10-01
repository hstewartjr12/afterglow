/** Bound network stalls, including a response whose body never finishes. */
export async function requestJson<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort(options?.signal?.reason);
  if (options?.signal?.aborted) abort();
  else options?.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 20_000);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response
        .json()
        .catch(() => ({ error: "Request failed" }));
      throw new Error(
        typeof body?.error === "string"
          ? body.error
          : `Request failed (${response.status}). Please try again.`,
      );
    }
    return response.status === 204 ? (undefined as T) : await response.json();
  } catch (error) {
    if (timedOut)
      throw new Error("Loading took too long. Please try again.", {
        cause: error,
      });
    throw error;
  } finally {
    clearTimeout(timer);
    options?.signal?.removeEventListener("abort", abort);
  }
}
