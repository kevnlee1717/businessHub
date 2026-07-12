import { Box, Button, Divider, Group, Menu, Stack, Text, TextInput, ThemeIcon } from "@mantine/core";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { driveDownloadUrl, type DriveNode } from "../../../api/drive";
import { type DriveNodeAction } from "./types";

function formatSize(size: number | null) {
  if (size === null) return "-";
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB"];
  let value = size / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

function iconFor(node: DriveNode) {
  if (node.kind === "folder") return { label: "DIR", color: "yellow" };
  const mime = node.mime ?? "";
  const name = node.name.toLowerCase();
  if (mime === "application/pdf" || name.endsWith(".pdf")) return { label: "PDF", color: "red" };
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name)) return { label: "IMG", color: "green" };
  if (/\.(xlsx|xls|csv)$/.test(name)) return { label: "XLS", color: "teal" };
  return { label: "FILE", color: "gray" };
}

function previewKind(file: DriveNode) {
  const mime = file.mime ?? "";
  const filename = file.name.toLowerCase();
  if (mime === "application/pdf" || filename.endsWith(".pdf")) return "pdf";
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(filename)) return "image";
  return "other";
}

function DriveFilePreviewColumn({ file }: { file: DriveNode }) {
  const { t } = useTranslation();
  const kind = previewKind(file);

  return (
    <Box w={300} h={560} style={{ flex: "0 0 300px", borderLeft: "1px solid #dcdfe6", overflowY: "auto" }}>
      <Stack gap="sm" p="md">
        <Group gap="sm" wrap="nowrap">
          <ThemeIcon color={iconFor(file).color} variant="light" radius="sm" size="lg">
            <Text size="9px" fw={700}>
              {iconFor(file).label}
            </Text>
          </ThemeIcon>
          <Text size="sm" fw={600} truncate title={file.name}>
            {file.name}
          </Text>
        </Group>
        <Box h={220} bg="#f5f7fa" style={{ display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          {file.url && kind === "image" ? (
            <img src={file.url} alt={file.name} style={{ maxWidth: "100%", maxHeight: "100%", display: "block" }} />
          ) : file.url && kind === "pdf" ? (
            <iframe src={file.url} title={file.name} style={{ width: "100%", height: "100%", border: 0 }} />
          ) : (
            <Text size="sm" c="dimmed" ta="center" px="sm">
              {t("drive.previewUnsupported")}
            </Text>
          )}
        </Box>
        <Button component="a" href={driveDownloadUrl(file.id)} target="_blank" rel="noreferrer" variant="light">
          {t("drive.download")}
        </Button>
        <Divider />
        <Text size="sm" c="dimmed">
          {t("drive.fields.kind")}: {file.mime ?? t("drive.file")}
        </Text>
        <Text size="sm" c="dimmed">
          {t("drive.columns.size")}: {formatSize(file.size)}
        </Text>
        <Text size="sm" c="dimmed">
          {t("drive.columns.updatedAt")}: {formatDate(file.updated_at)}
        </Text>
      </Stack>
    </Box>
  );
}

function DriveColumnRow({
  node,
  selected,
  canManage,
  editing,
  dropping,
  onSelect,
  onOpenPreview,
  onStartRename,
  onCancelRename,
  onSubmitRename,
  onDelete,
  onReplace,
  onCreateFolder,
  onDragStart,
  onDropOnFolder,
  onDropOnColumn
}: {
  node: DriveNode;
  selected: boolean;
  canManage: boolean;
  editing: boolean;
  dropping: boolean;
  onSelect: DriveNodeAction;
  onOpenPreview: DriveNodeAction;
  onStartRename: DriveNodeAction;
  onCancelRename: () => void;
  onSubmitRename: (node: DriveNode, name: string) => void;
  onDelete: DriveNodeAction;
  onReplace: (node: DriveNode, file: File) => void;
  onCreateFolder: DriveNodeAction;
  onDragStart: (node: DriveNode) => void;
  onDropOnFolder: (node: DriveNode, dragId: string) => void;
  onDropOnColumn: (dragId: string) => void;
}) {
  const { t } = useTranslation();
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const [menuOpened, setMenuOpened] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [name, setName] = useState(node.name);
  const icon = iconFor(node);

  useEffect(() => {
    if (editing) setName(node.name);
  }, [editing, node.name]);

  function submit() {
    const next = name.trim();
    if (next) onSubmitRename(node, next);
    else onCancelRename();
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
    const dragId = event.dataTransfer.getData("text/plain");
    if (!dragId) return;
    if (node.kind === "folder") {
      onDropOnFolder(node, dragId);
    } else {
      onDropOnColumn(dragId);
    }
  }

  return (
    <Menu opened={menuOpened} onChange={setMenuOpened} disabled={!menuOpened} shadow="md" width={190} withinPortal>
      <Menu.Target>
        <Box
          draggable={canManage}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", node.id);
            onDragStart(node);
          }}
          onDragOver={(event) => {
            if (canManage && node.kind === "folder") {
              event.preventDefault();
              setDragOver(true);
            }
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => onSelect(node)}
          onDoubleClick={() => {
            if (node.kind === "file") onOpenPreview(node);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            onSelect(node);
            setMenuOpened(true);
          }}
          style={{
            height: 32,
            display: "grid",
            gridTemplateColumns: "1fr 18px",
            alignItems: "center",
            padding: "0 8px",
            background: selected ? "#228be6" : dropping || dragOver ? "#ecf5ff" : "transparent",
            color: selected ? "#fff" : "#303133",
            cursor: "default",
            borderRadius: 3
          }}
        >
          <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
            <ThemeIcon color={icon.color} variant={selected ? "filled" : "light"} radius="sm" size="sm" style={{ flexShrink: 0 }}>
              <Text size="7px" fw={700}>
                {icon.label}
              </Text>
            </ThemeIcon>
            {editing ? (
              <TextInput
                autoFocus
                size="xs"
                value={name}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => setName(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submit();
                  if (event.key === "Escape") onCancelRename();
                }}
                styles={{ input: { minHeight: 24, height: 24 } }}
              />
            ) : (
              <Text size="sm" truncate title={node.name}>
                {node.name}
              </Text>
            )}
          </Group>
          {node.kind === "folder" ? (
            <Text size="sm" ta="right" c={selected ? "white" : "dimmed"}>
              &gt;
            </Text>
          ) : null}
          <input
            ref={replaceInputRef}
            type="file"
            hidden
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) onReplace(node, file);
            }}
          />
        </Box>
      </Menu.Target>
      <Menu.Dropdown>
        {node.kind === "file" ? (
          <>
            <Menu.Item onClick={() => onOpenPreview(node)}>{t("drive.preview")}</Menu.Item>
            <Menu.Item component="a" href={driveDownloadUrl(node.id)} target="_blank" rel="noreferrer">
              {t("drive.download")}
            </Menu.Item>
          </>
        ) : null}
        {node.kind === "folder" && canManage ? (
          <Menu.Item onClick={() => onCreateFolder(node)}>{t("drive.newChildFolder")}</Menu.Item>
        ) : null}
        {canManage ? (
          <>
            <Menu.Item onClick={() => onStartRename(node)}>{t("drive.rename")}</Menu.Item>
            {node.kind === "file" ? (
              <Menu.Item onClick={() => replaceInputRef.current?.click()}>{t("drive.replaceFile")}</Menu.Item>
            ) : null}
            <Menu.Item color="red" onClick={() => onDelete(node)}>
              {t("common.delete")}
            </Menu.Item>
          </>
        ) : null}
      </Menu.Dropdown>
    </Menu>
  );
}

export function DriveColumn({
  parentId,
  items,
  selectedId,
  canManage,
  editingId,
  dropTargetId,
  onSelect,
  onOpenPreview,
  onStartRename,
  onCancelRename,
  onSubmitRename,
  onDelete,
  onReplace,
  onCreateFolder,
  onDragStart,
  onDropOnFolder,
  onDropOnColumn
}: {
  parentId: string | null;
  items: DriveNode[];
  selectedId: string | null;
  canManage: boolean;
  editingId: string | null;
  dropTargetId: string | null;
  onSelect: DriveNodeAction;
  onOpenPreview: DriveNodeAction;
  onStartRename: DriveNodeAction;
  onCancelRename: () => void;
  onSubmitRename: (node: DriveNode, name: string) => void;
  onDelete: DriveNodeAction;
  onReplace: (node: DriveNode, file: File) => void;
  onCreateFolder: DriveNodeAction;
  onDragStart: (node: DriveNode) => void;
  onDropOnFolder: (node: DriveNode, dragId: string) => void;
  onDropOnColumn: (parentId: string | null, dragId: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <Box
      w={260}
      h={560}
      p={6}
      style={{ flex: "0 0 260px", borderLeft: "1px solid #dcdfe6", overflowY: "auto" }}
      onDragOver={(event) => {
        if (canManage) event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        const dragId = event.dataTransfer.getData("text/plain");
        if (dragId) onDropOnColumn(parentId, dragId);
      }}
    >
      {items.length === 0 ? (
        <Text size="sm" c="dimmed" ta="center" py="md">
          {t("drive.emptyColumn")}
        </Text>
      ) : (
        <Stack gap={2}>
          {items.map((node) => (
            <DriveColumnRow
              key={node.id}
              node={node}
              selected={selectedId === node.id}
              canManage={canManage}
              editing={editingId === node.id}
              dropping={dropTargetId === node.id}
              onSelect={onSelect}
              onOpenPreview={onOpenPreview}
              onStartRename={onStartRename}
              onCancelRename={onCancelRename}
              onSubmitRename={onSubmitRename}
              onDelete={onDelete}
              onReplace={onReplace}
              onCreateFolder={onCreateFolder}
              onDragStart={onDragStart}
              onDropOnFolder={onDropOnFolder}
              onDropOnColumn={(dragId) => onDropOnColumn(parentId, dragId)}
            />
          ))}
        </Stack>
      )}
    </Box>
  );
}

export { DriveFilePreviewColumn };
