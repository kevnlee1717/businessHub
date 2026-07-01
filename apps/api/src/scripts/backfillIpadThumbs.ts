import { db, ipadSlides, pool } from "@bh/db";
import { and, eq, isNull } from "drizzle-orm";
import { generateIpadSlideThumbnail } from "../lib/ipadThumbs";

const rows = await db.select().from(ipadSlides).where(isNull(ipadSlides.thumbPath));
let updated = 0;
let failed = 0;

for (const slide of rows) {
  try {
    const thumbPath = await generateIpadSlideThumbnail(slide.storagePath);
    await db
      .update(ipadSlides)
      .set({ thumbPath, updatedAt: new Date() })
      .where(and(eq(ipadSlides.id, slide.id), isNull(ipadSlides.thumbPath)));
    updated += 1;
    console.log(`generated ${slide.id}: ${thumbPath}`);
  } catch (error) {
    failed += 1;
    console.warn(`failed ${slide.id}:`, error);
  }
}

console.log(`ipad thumbnail backfill complete: updated=${updated}, failed=${failed}, total=${rows.length}`);
await pool.end();
