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

function FolderIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 6.75A2.75 2.75 0 0 1 5.75 4h4.02c.73 0 1.43.29 1.94.8l1.2 1.2h5.34A2.75 2.75 0 0 1 21 8.75v7.5A3.75 3.75 0 0 1 17.25 20H6.75A3.75 3.75 0 0 1 3 16.25v-9.5Z" fill="#D99A00" />
      <path d="M3.5 9h17v7.25a3.25 3.25 0 0 1-3.25 3.25H6.75a3.25 3.25 0 0 1-3.25-3.25V9Z" fill="#F9C74F" />
    </svg>
  );
}

function PdfIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 2.75h8.5L19 7.25v14H6a2 2 0 0 1-2-2V4.75a2 2 0 0 1 2-2Z" stroke="#D92D20" strokeWidth="1.8" />
      <path d="M14.5 2.75v4.5H19" stroke="#D92D20" strokeWidth="1.8" />
      <path d="M7 16.5h10M7 12.5h10" stroke="#D92D20" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PhotoIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" stroke="#12B76A" strokeWidth="1.8" />
      <path d="m5 17 4.5-4.5 3.2 3.2 2.1-2.1L19 17" stroke="#2E90FA" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="15.75" cy="8.75" r="1.35" fill="#12B76A" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 2.75h8.5L19 7.25v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4.75a2 2 0 0 1 2-2Z" stroke="#667085" strokeWidth="1.8" />
      <path d="M14.5 2.75v4.5H19M8 12.5h8M8 16h6" stroke="#667085" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function iconFor(node: DriveNode) {
  if (node.kind === "folder") return { Icon: FolderIcon, color: "transparent" };
  const mime = node.mime ?? "";
  const name = node.name.toLowerCase();
  if (mime === "application/pdf" || name.endsWith(".pdf")) return { Icon: PdfIcon, color: "transparent" };
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name)) return { Icon: PhotoIcon, color: "transparent" };
  return { Icon: FileIcon, color: "transparent" };
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
  const icon = iconFor(file);
  const Icon = icon.Icon;

  return (
    <Box w={300} h={560} style={{ flex: "0 0 300px", borderLeft: "1px solid #dcdfe6", overflowY: "auto" }}>
      <Stack gap="sm" p="md">
        <Group gap="sm" wrap="nowrap">
          <ThemeIcon color={icon.color} variant="transparent" radius="sm" size="lg">
            <Icon />
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
  canDelete,
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
  canDelete: boolean;
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
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [dragOver, setDragOver] = useState(false);
  const [name, setName] = useState(node.name);
  const icon = iconFor(node);
  const Icon = icon.Icon;

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

  function openMenuAt(x: number, y: number) {
    setMenuPosition({ x, y });
    setMenuOpened(true);
  }

  return (
    <>
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
          openMenuAt(event.clientX, event.clientY);
        }}
        style={{
          height: 32,
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 18px",
          alignItems: "center",
          padding: "0 8px",
          background: selected ? "#228be6" : dropping || dragOver ? "#ecf5ff" : "transparent",
          color: selected ? "#fff" : "#303133",
          cursor: "default",
          borderRadius: 3
        }}
      >
        <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
          <ThemeIcon color={icon.color} variant="transparent" radius="sm" size="sm" style={{ flexShrink: 0 }}>
            <Icon />
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
        ) : (
          <Box />
        )}
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
      <Menu opened={menuOpened} onChange={setMenuOpened} shadow="md" width={190} withinPortal>
      <Menu.Target>
        <Box
          style={{
            position: "fixed",
            left: menuPosition.x,
            top: menuPosition.y,
            width: 0,
            height: 0,
            pointerEvents: "none"
          }}
        />
      </Menu.Target>
      <Menu.Dropdown>
        {node.kind === "file" ? (
          <Menu.Item component="a" href={driveDownloadUrl(node.id)} target="_blank" rel="noreferrer">
            {t("drive.download")}
          </Menu.Item>
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
          </>
        ) : null}
        {canDelete ? (
          <Menu.Item color="red" onClick={() => onDelete(node)}>
            {t("common.delete")}
          </Menu.Item>
        ) : null}
      </Menu.Dropdown>
    </Menu>
    </>
  );
}

export function DriveColumn({
  parentId,
  items,
  selectedId,
  canManage,
  canDelete,
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
  canDelete: boolean;
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
              canDelete={canDelete}
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
