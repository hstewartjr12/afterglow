import { z } from "zod";
import { libraryStatuses, platforms } from "./constants.ts";

export { libraryStatuses, platforms };

export const libraryStatusSchema = z.enum(libraryStatuses);

export const vnSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  alttitle: z.string().nullable().optional(),
  imageUrl: z.string().nullable(),
  imageSexual: z.number().default(0),
  imageViolence: z.number().default(0),
  released: z.string().nullable(),
  rating: z.number().nullable(),
  voteCount: z.number().default(0),
  length: z.number().nullable(),
  platforms: z.array(z.string()).default([]),
  tags: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        rating: z.number().default(0),
        spoiler: z.number().default(0),
      }),
    )
    .default([]),
});
export type VnSummary = z.infer<typeof vnSummarySchema>;

export type VnDetail = VnSummary & {
  description: string | null;
  aliases: string[];
};
export const platformSchema = z.enum(platforms);
export const vndbTagSchema = z.object({
  id: z.string(),
  name: z.string(),
  aliases: z.array(z.string()).default([]),
  description: z.string().default(""),
  category: z.enum(["cont", "ero", "tech"]),
  searchable: z.boolean(),
  applicable: z.boolean(),
  vnCount: z.number().default(0),
});
export type VndbTag = z.infer<typeof vndbTagSchema>;

export const vndbIdSchema = z.string().regex(/^v[1-9]\d*$/, "Invalid VNDB ID");
export const timestampSchema = z
  .string()
  .datetime({ offset: true })
  .refine((value) => Number.isFinite(Date.parse(value)), "Invalid timestamp");
const readingDateSchema = z
  .union([z.string().date(), timestampSchema])
  .nullable();

export const libraryInputSchema = z.object({
  status: libraryStatusSchema.default("backlog"),
  personalRating: z.number().int().min(1).max(10).nullable().default(null),
  favorite: z.boolean().default(false),
  progress: z.number().int().min(0).max(100).default(0),
  notes: z.string().max(5000).default(""),
  startedAt: readingDateSchema.default(null),
  completedAt: readingDateSchema.default(null),
  vn: vnSummarySchema,
});
export type LibraryInput = z.infer<typeof libraryInputSchema>;
export type LibraryEntry = LibraryInput & {
  id: number;
  vndbId: string;
  createdAt: string;
  updatedAt: string;
};

export const preferencesSchema = z.object({
  tagPreferences: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        weight: z.number().min(-3).max(3),
      }),
    )
    .max(100)
    .default([]),
  preferredLengths: z.array(z.number().int().min(1).max(5)).default([]),
  preferredPlatforms: z.array(z.string()).max(8).default([]),
  useSpoilerTagsInRecommendations: z.boolean().default(false),
  completed: z.boolean().default(false),
});
export type Preferences = z.infer<typeof preferencesSchema>;

export type Recommendation = {
  vn: VnSummary;
  score: number;
  matchPercent: number;
  reasons: string[];
};

export const recommendationFeedbackSchema = z
  .object({
    vndbId: vndbIdSchema,
    vn: vnSummarySchema.extend({ id: vndbIdSchema }),
    until: timestampSchema.nullable(),
    createdAt: timestampSchema,
  })
  .refine((entry) => entry.vndbId === entry.vn.id, {
    message: "The feedback VNDB ID must match its story",
    path: ["vndbId"],
  });
export type RecommendationFeedback = z.infer<
  typeof recommendationFeedbackSchema
>;

function uniqueVndbIds<T extends { vndbId: string }>(
  entries: T[],
  context: z.RefinementCtx,
) {
  const ids = new Set<string>();
  entries.forEach((entry, index) => {
    if (ids.has(entry.vndbId))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate VNDB ID: ${entry.vndbId}`,
        path: [index, "vndbId"],
      });
    ids.add(entry.vndbId);
  });
}

export const feedbackListSchema = z
  .array(recommendationFeedbackSchema)
  .superRefine(uniqueVndbIds);

// Imported personal fields are required. Applying input defaults here could
// silently erase notes, ratings or reading dates during an explicit overwrite.
export const backupLibraryEntrySchema = z
  .object({
    id: z.number().int().positive(),
    vndbId: vndbIdSchema,
    vn: vnSummarySchema.extend({ id: vndbIdSchema }),
    status: libraryStatusSchema,
    personalRating: z.number().int().min(1).max(10).nullable(),
    favorite: z.boolean(),
    progress: z.number().int().min(0).max(100),
    notes: z.string().max(5000),
    startedAt: readingDateSchema,
    completedAt: readingDateSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .refine((entry) => entry.vndbId === entry.vn.id, {
    message: "The library VNDB ID must match its story",
    path: ["vndbId"],
  });

const backupPreferencesSchema = z
  .object({})
  .passthrough()
  .superRefine((value, context) => {
    for (const key of Object.keys(preferencesSchema.shape)) {
      if (!(key in value))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `The backup is missing taste profile field: ${key}`,
          path: [key],
        });
    }
  })
  .pipe(preferencesSchema);

export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
export const backupSchema = z.object({
  kind: z.literal("afterglow-backup"),
  version: z.literal(1),
  exportedAt: timestampSchema,
  library: z.array(backupLibraryEntrySchema).superRefine(uniqueVndbIds),
  preferences: backupPreferencesSchema,
  feedback: feedbackListSchema.default([]),
});
export type Backup = z.infer<typeof backupSchema>;
export const backupImportSchema = z.object({
  backup: backupSchema,
  overwrite: z.boolean().default(false),
  includePreferences: z.boolean().default(false),
});
export type BackupImportInput = z.infer<typeof backupImportSchema>;
export type BackupImportResult = {
  added: number;
  updated: number;
  kept: number;
};
export type UserData = {
  library: LibraryEntry[];
  preferences: Preferences;
  feedback: RecommendationFeedback[];
};
