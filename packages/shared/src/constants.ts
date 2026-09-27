// Plain values the client can import without pulling zod into its bundle.
export const libraryStatuses = [
  "wishlist",
  "backlog",
  "playing",
  "completed",
  "dropped",
] as const;
export const platforms = [
  "win",
  "lin",
  "mac",
  "and",
  "ios",
  "swi",
  "ps4",
  "ps5",
] as const;
