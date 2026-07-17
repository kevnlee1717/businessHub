import { Alert, Box, Button, Group, Loader, Modal, ScrollArea, Stack, Tabs, Text } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { driveDownloadUrl, type DriveNode } from "../../../api/drive";
import { previewKind } from "./preview";

type ExcelPreview = {
  names: string[];
  htmlByName: Record<string, string>;
};

function DownloadButton({ file, downloadUrl }: { file: DriveNode; downloadUrl?: string | undefined }) {
  const { t } = useTranslation();
  return (
    <Group justify="flex-end" mt="sm">
      <Button component="a" href={downloadUrl ?? driveDownloadUrl(file.id)} target="_blank" rel="noreferrer" variant="light">
        {t("drive.download")}
      </Button>
    </Group>
  );
}

function DocxPreview({ file }: { file: DriveNode }) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!file.url || !container) return undefined;

    let cancelled = false;
    container.innerHTML = "";
    setLoading(true);
    setError(null);

    async function renderDocx() {
      try {
        const response = await fetch(file.url ?? "", { credentials: "include" });
        if (!response.ok) throw new Error(response.statusText || "Failed to load document");
        const buffer = await response.arrayBuffer();
        const { renderAsync } = await import("docx-preview");
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = "";
        await renderAsync(buffer, containerRef.current, undefined, {
          className: "drive-docx-preview",
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t("drive.previewFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void renderDocx();

    return () => {
      cancelled = true;
      container.innerHTML = "";
    };
  }, [file.url, t]);

  return (
    <Stack gap="sm">
      {loading ? (
        <Group justify="center" py="xl">
          <Loader size="sm" />
        </Group>
      ) : null}
      {error ? <Alert color="red">{t("drive.previewFailed")}</Alert> : null}
      <ScrollArea h="72vh" type="auto">
        <Box
          bg="#f5f7fa"
          p="md"
          style={{
            minHeight: "72vh",
            overflowX: "auto"
          }}
        >
          <Box ref={containerRef} />
        </Box>
      </ScrollArea>
    </Stack>
  );
}

function ExcelPreview({ file }: { file: DriveNode }) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<ExcelPreview | null>(null);
  const [activeSheet, setActiveSheet] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file.url) return undefined;

    let cancelled = false;
    setPreview(null);
    setActiveSheet(null);
    setLoading(true);
    setError(null);

    async function loadExcel() {
      try {
        const response = await fetch(file.url ?? "", { credentials: "include" });
        if (!response.ok) throw new Error(response.statusText || "Failed to load spreadsheet");
        const buffer = await response.arrayBuffer();
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
        const names = workbook.SheetNames;
        const htmlByName: Record<string, string> = {};

        names.forEach((name) => {
          const worksheet = workbook.Sheets[name];
          htmlByName[name] = worksheet ? XLSX.utils.sheet_to_html(worksheet) : "";
        });

        if (!cancelled) {
          setPreview({ names, htmlByName });
          setActiveSheet(names[0] ?? null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t("drive.previewFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadExcel();

    return () => {
      cancelled = true;
    };
  }, [file.url, t]);

  if (loading) {
    return (
      <Group justify="center" py="xl">
        <Loader size="sm" />
      </Group>
    );
  }

  if (error) {
    return <Alert color="red">{t("drive.previewFailed")}</Alert>;
  }

  if (!preview || preview.names.length === 0) {
    return <Text c="dimmed">{t("drive.previewUnsupported")}</Text>;
  }

  const table = activeSheet ? preview.htmlByName[activeSheet] : "";

  return (
    <Tabs value={activeSheet} onChange={setActiveSheet}>
      <Tabs.List>
        {preview.names.map((name) => (
          <Tabs.Tab key={name} value={name}>
            {name}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      <Box mt="sm">
        <style>
          {`
            .drive-excel-preview table {
              border-collapse: collapse;
              min-width: 100%;
              font-size: 13px;
            }
            .drive-excel-preview th,
            .drive-excel-preview td {
              border: 1px solid #dcdfe6;
              padding: 6px 8px;
              white-space: nowrap;
            }
            .drive-excel-preview th {
              background: #f5f7fa;
              font-weight: 600;
            }
          `}
        </style>
        <ScrollArea h="72vh" type="auto">
          <Box className="drive-excel-preview" style={{ overflowX: "auto" }} dangerouslySetInnerHTML={{ __html: table ?? "" }} />
        </ScrollArea>
      </Box>
    </Tabs>
  );
}

export function DrivePreviewModal({
  opened,
  file,
  downloadUrl,
  onClose
}: {
  opened: boolean;
  file: DriveNode | null;
  downloadUrl?: string | undefined;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const kind = previewKind(file);
  const url = file?.url ?? null;

  return (
    <Modal opened={opened} onClose={onClose} title={file?.name ?? t("drive.preview")} size="90vw">
      {file && url ? (
        <Stack gap="sm">
          {kind === "pdf" ? (
            <iframe src={url} title={file.name} style={{ width: "100%", height: "72vh", border: 0 }} />
          ) : kind === "image" ? (
            <ScrollArea h="72vh" type="auto">
              <img src={url} alt={file.name} style={{ maxWidth: "100%", display: "block", margin: "0 auto" }} />
            </ScrollArea>
          ) : kind === "docx" ? (
            <DocxPreview file={file} />
          ) : kind === "excel" ? (
            <ExcelPreview file={file} />
          ) : (
            <Alert color="yellow">{t("drive.previewUnsupported")}</Alert>
          )}
          <DownloadButton file={file} downloadUrl={downloadUrl} />
        </Stack>
      ) : file ? (
        <Stack gap="sm">
          <Alert color="yellow">{t("drive.previewUnsupported")}</Alert>
          <DownloadButton file={file} />
        </Stack>
      ) : null}
    </Modal>
  );
}
