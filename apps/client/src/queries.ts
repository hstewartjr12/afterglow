import type { QueryClient } from "@tanstack/react-query";

// All three query families depend on both the taste profile and reading history.
export function invalidateMatches(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: ["recommendations"] }),
    client.invalidateQueries({ queryKey: ["recommendation"] }),
    client.invalidateQueries({ queryKey: ["candidate-scores"] }),
  ]);
}
