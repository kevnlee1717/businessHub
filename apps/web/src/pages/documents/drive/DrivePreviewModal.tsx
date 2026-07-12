import { Button, Modal, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { driveDownloadUrl, type DriveNode } from "../../../api/drive";

function previewKind(file: DriveNode | null) {
  const mime = file?.mime ?? "";
  const filename = file?.name.toLowerCase() ?? "";
  if (mime === "application/pdf" || filename.endsWith(".pdf")) return "pdf";
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(filename)) return "image";
  return "other";
}

export function DrivePreviewModal({
  opened,
  file,
  onClose
}: {
  opened: boolean;
  file: DriveNode | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const kind = previewKind(file);
  const url = file?.url ?? null;

  return (
    <Modal opened={opened} onClose={onClose} title={file?.name ?? t("drive.preview")} size="xl">
      {file && url ? (
        kind === "pdf" ? (
          <iframe src={url} title={file.name} style={{ width: "100%", height: "76vh", border: 0 }} />
        ) : kind === "image" ? (
          <img src={url} alt={file.name} style={{ maxWidth: "100%", maxHeight: "76vh", display: "block", margin: "0 auto" }} />
        ) : (
          <Stack gap="sm">
            <Text c="dimmed">{t("drive.previewUnsupported")}</Text>
            <Button component="a" href={driveDownloadUrl(file.id)} target="_blank" rel="noreferrer">
              {t("drive.download")}
            </Button>
          </Stack>
        )
      ) : null}
    </Modal>
  );
}
