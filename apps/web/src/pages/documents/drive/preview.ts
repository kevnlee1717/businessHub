import { type DriveNode } from "../../../api/drive";

export type DrivePreviewKind = "image" | "pdf" | "docx" | "excel" | "other";

export function previewKind(file: Pick<DriveNode, "mime" | "name"> | null): DrivePreviewKind {
  const mime = file?.mime ?? "";
  const filename = file?.name.toLowerCase() ?? "";

  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(filename)) return "image";
  if (mime === "application/pdf" || filename.endsWith(".pdf")) return "pdf";
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || filename.endsWith(".docx")) {
    return "docx";
  }
  if (
    mime.includes("spreadsheet") ||
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel" ||
    /\.(xlsx|xls)$/.test(filename)
  ) {
    return "excel";
  }
  return "other";
}
