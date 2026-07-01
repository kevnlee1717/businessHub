import { z } from "zod";

const optionalText = z.string().trim().min(1).optional();

export const ipadSlideOrientationSchema = z.enum(["landscape", "portrait"]);
export type IpadSlideOrientation = z.infer<typeof ipadSlideOrientationSchema>;

export const ipadSlideUploadSchema = z.object({
  title: z.string().trim().min(1).max(200)
});

export const ipadSlideUpdateSchema = z.object({
  title: optionalText,
  sort_order: z.coerce.number().int().min(0).optional(),
  orientation: ipadSlideOrientationSchema.optional()
});

export type IpadSlideUploadInput = z.infer<typeof ipadSlideUploadSchema>;
export type IpadSlideUpdateInput = z.infer<typeof ipadSlideUpdateSchema>;
