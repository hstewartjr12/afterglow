import { z } from "zod";

export const libraryStatuses = ["wishlist", "backlog", "playing", "completed", "dropped"] as const;
export const libraryStatusSchema = z.enum(libraryStatuses);

export const vnSummarySchema = z.object({
  id: z.string(), title: z.string(), alttitle: z.string().nullable().optional(),
  imageUrl: z.string().nullable(), imageSexual: z.number().default(0), imageViolence: z.number().default(0),
  released: z.string().nullable(), rating: z.number().nullable(), voteCount: z.number().default(0),
  length: z.number().nullable(), platforms: z.array(z.string()).default([]),
  tags: z.array(z.object({id:z.string(), name:z.string(), rating:z.number().default(0), spoiler:z.number().default(0)})).default([])
});
export type VnSummary = z.infer<typeof vnSummarySchema>;

export const vnDetailSchema = vnSummarySchema.extend({description:z.string().nullable(), aliases:z.array(z.string()).default([])});
export type VnDetail = z.infer<typeof vnDetailSchema>;
export const vndbTagSchema = z.object({id:z.string(),name:z.string(),aliases:z.array(z.string()).default([]),description:z.string().default(""),category:z.enum(["cont","ero","tech"]),searchable:z.boolean(),applicable:z.boolean(),vnCount:z.number().default(0)});
export type VndbTag = z.infer<typeof vndbTagSchema>;

export const libraryInputSchema = z.object({
  status: libraryStatusSchema.default("backlog"), personalRating: z.number().min(1).max(10).nullable().default(null),
  favorite: z.boolean().default(false), progress: z.number().min(0).max(100).default(0), notes: z.string().max(5000).default(""),
  startedAt: z.string().nullable().default(null), completedAt: z.string().nullable().default(null), vn: vnSummarySchema
});
export type LibraryInput = z.infer<typeof libraryInputSchema>;
export type LibraryEntry = LibraryInput & {id:number; vndbId:string; createdAt:string; updatedAt:string};

export const preferencesSchema = z.object({
  tagPreferences: z.array(z.object({id:z.string(),name:z.string(),weight:z.number().min(-3).max(3)})).max(100).default([]),
  preferredLengths: z.array(z.number().int().min(1).max(5)).default([]), preferredPlatforms: z.array(z.string()).max(8).default([]), useSpoilerTagsInRecommendations:z.boolean().default(false), completed: z.boolean().default(false)
});
export type Preferences = z.infer<typeof preferencesSchema>;

export type Recommendation = {vn:VnSummary; score:number; matchPercent:number; reasons:string[]};
export type ApiError = {error:string; code:string};
