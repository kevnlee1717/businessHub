import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, extname, join, posix } from "node:path";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { db, epPriceFiles, epPriceFileSlots } from "@bh/db";
import { type MultipartFile } from "@fastify/multipart";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePerm } from "../auth/jwt";
import { parseWithSchema } from "./hrUtils";

type EpPriceFileSlot = (typeof epPriceFileSlots)[number];
type EpPriceFileRow = typeof epPriceFiles.$inferSelect;
type EpPriceFileResponse = {
  slot: EpPriceFileSlot;
  filename: string | null;
  storage_path: string | null;
  url: string | null;
  updated_at: Date | null;
  updated_by: string | null;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const uploadRoot = join(__dirname, "../../../..", "uploads");
const storageDirectory = "ep-price";
const slotParamsSchema = z.object({
  slot: z.enum(epPriceFileSlots)
});

function isPdf(part: MultipartFile) {
  return part.mimetype === "application/pdf" || extname(part.filename).toLowerCase() === ".pdf";
}

function urlForStoragePath(storagePath: string) {
  return `/uploads/${storagePath}`;
}

function serializeEpPriceFile(row: EpPriceFileRow): EpPriceFileResponse {
  return {
    slot: row.slot,
    filename: row.filename,
    storage_path: row.storagePath,
    url: urlForStoragePath(row.storagePath),
    updated_at: row.updatedAt,
    updated_by: row.updatedBy
  };
}

function emptySlot(slot: EpPriceFileSlot): EpPriceFileResponse {
  return {
    slot,
    filename: null,
    storage_path: null,
    url: null,
    updated_at: null,
    updated_by: null
  };
}

async function discardFile(part: MultipartFile): Promise<void> {
  await pipeline(
    part.file,
    new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      }
    })
  );
}

async function savePdf(part: MultipartFile) {
  const directory = join(uploadRoot, storageDirectory);
  await mkdir(directory, { recursive: true });

  const storedFilename = `${randomUUID()}.pdf`;
  const absolutePath = join(directory, storedFilename);
  const storagePath = posix.join(storageDirectory, storedFilename);

  await pipeline(part.file, createWriteStream(absolutePath));

  return storagePath;
}

export async function registerEpPriceFileRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/ep-price-files", { preHandler: requirePerm("case.view") }, async () => {
    const rows = await db.select().from(epPriceFiles);
    const bySlot = new Map<EpPriceFileSlot, EpPriceFileRow>(rows.map((row) => [row.slot, row]));

    return {
      files: epPriceFileSlots.map((slot) => {
        const row = bySlot.get(slot);
        return row ? serializeEpPriceFile(row) : emptySlot(slot);
      })
    };
  });

  app.post("/ep-price-files/:slot", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const { slot } = parseWithSchema(slotParamsSchema, request.params);
    let uploadedFile: EpPriceFileRow | null = null;

    for await (const part of request.parts()) {
      if (part.type === "field") {
        continue;
      }

      if (part.fieldname !== "file" || uploadedFile) {
        await discardFile(part);
        continue;
      }

      if (!isPdf(part)) {
        await discardFile(part);
        return reply.code(400).send({ error: "pdf_required" });
      }

      const storagePath = await savePdf(part);
      const [row] = await db
        .insert(epPriceFiles)
        .values({
          slot,
          filename: part.filename,
          storagePath,
          updatedAt: new Date(),
          updatedBy: request.user.id
        })
        .onConflictDoUpdate({
          target: epPriceFiles.slot,
          set: {
            filename: part.filename,
            storagePath,
            updatedAt: new Date(),
            updatedBy: request.user.id
          }
        })
        .returning();

      if (!row) {
        throw new Error("ep_price_file_upload_failed");
      }

      uploadedFile = row;
    }

    if (!uploadedFile) {
      return reply.code(400).send({ error: "file_required" });
    }

    return reply.code(201).send({ file: serializeEpPriceFile(uploadedFile) });
  });
}
