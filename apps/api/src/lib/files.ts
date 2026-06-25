import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, extname, join, posix } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { db, documents } from "@bh/db";
import { type MultipartFile } from "@fastify/multipart";

export type SaveUploadOptions = {
  subjectType: string;
  subjectId?: string | null;
  clientId?: string | null;
  categoryId?: string | null;
  uploadedBy?: string | null;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const uploadRoot = join(__dirname, "../../../..", "uploads");

function currentUploadPath(date = new Date()) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return {
    year,
    month,
    directory: join(uploadRoot, year, month)
  };
}

export async function saveUpload(part: MultipartFile, options: SaveUploadOptions) {
  const { year, month, directory } = currentUploadPath();
  await mkdir(directory, { recursive: true });

  const extension = extname(part.filename);
  const storedFilename = `${randomUUID()}${extension}`;
  const absolutePath = join(directory, storedFilename);
  const storagePath = posix.join("uploads", year, month, storedFilename);

  let size = 0;
  part.file.on("data", (chunk: Buffer) => {
    size += chunk.length;
  });

  await pipeline(part.file, createWriteStream(absolutePath));

  const [document] = await db
    .insert(documents)
    .values({
      storagePath,
      filename: part.filename,
      mime: part.mimetype,
      size,
      uploadedBy: options.uploadedBy ?? null,
      subjectType: options.subjectType,
      subjectId: options.subjectId ?? null,
      clientId: options.clientId ?? null,
      categoryId: options.categoryId ?? null
    })
    .returning();

  return document;
}
