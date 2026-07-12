import { Box, Group, Menu, Text, TextInput, ThemeIcon, UnstyledButton } from "@mantine/core";
import { type NodeRendererProps } from "react-arborist";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { driveDownloadUrl } from "../../../api/drive";
import { type DriveNodeAction, type DriveTreeNode } from "./types";

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

function iconFor(node: DriveTreeNode) {
  if (node.kind === "folder") return { label: "DIR", color: "yellow" };
  const mime = node.mime ?? "";
  const name = node.name.toLowerCase();
  if (mime === "application/pdf" || name.endsWith(".pdf")) return { label: "PDF", color: "red" };
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name)) return { label: "IMG", color: "green" };
  if (/\.(xlsx|xls|csv)$/.test(name)) return { label: "XLS", color: "teal" };
  return { label: "FILE", color: "gray" };
}

export function DriveRow({
  node,
  style,
  dragHandle,
  canManage,
  onDelete,
  onPreview,
  onReplace,
  onCreateFolder
}: NodeRendererProps<DriveTreeNode> & {
  canManage: boolean;
  onDelete: DriveNodeAction;
  onPreview: DriveNodeAction;
  onReplace: (node: DriveTreeNode, file: File) => void;
  onCreateFolder: DriveNodeAction;
}) {
  const { t } = useTranslation();
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const [menuOpened, setMenuOpened] = useState(false);
  const [editValue, setEditValue] = useState(node.data.name);
  const icon = iconFor(node.data);

  useEffect(() => {
    if (node.isEditing) {
      setEditValue(node.data.name);
    }
  }, [node.data.name, node.isEditing]);

  function submitRename() {
    const next = editValue.trim();
    if (next) node.submit(next);
    else node.reset();
  }

  return (
    <Menu opened={menuOpened} onChange={setMenuOpened} shadow="md" width={190} withinPortal>
      <Menu.Target>
        <Box
          ref={dragHandle}
          style={{
            ...style,
            display: "grid",
            gridTemplateColumns: "minmax(220px, 1fr) 120px 190px",
            alignItems: "center",
            borderBottom: "1px solid #ebeef5",
            background: node.isSelected ? "#ecf5ff" : node.willReceiveDrop ? "#f0f9eb" : "#fff",
            color: "#303133",
            cursor: "default"
          }}
          onClick={(event) => {
            node.handleClick(event);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            node.select();
            setMenuOpened(true);
          }}
          onDoubleClick={() => {
            if (node.data.kind === "folder") {
              node.toggle();
            } else {
              onPreview(node.data);
            }
          }}
        >
          <Group gap={8} wrap="nowrap" pl={10 + node.level * 18} pr="sm" style={{ minWidth: 0 }}>
            {node.data.kind === "folder" ? (
              <UnstyledButton
                aria-label={node.isOpen ? t("drive.collapse") : t("drive.expand")}
                onClick={(event) => {
                  event.stopPropagation();
                  node.toggle();
                }}
                style={{
                  width: 18,
                  height: 18,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transform: node.isOpen ? "rotate(90deg)" : "none",
                  transition: "transform 120ms",
                  color: "#909399",
                  flexShrink: 0
                }}
              >
                ▸
              </UnstyledButton>
            ) : (
              <Box w={18} style={{ flexShrink: 0 }} />
            )}
            <ThemeIcon color={icon.color} variant="light" radius="sm" size="md" style={{ flexShrink: 0 }}>
              <Text size="8px" fw={700}>
                {icon.label}
              </Text>
            </ThemeIcon>
            {node.isEditing ? (
              <TextInput
                autoFocus
                size="xs"
                value={editValue}
                onChange={(event) => setEditValue(event.currentTarget.value)}
                onClick={(event) => event.stopPropagation()}
                onBlur={submitRename}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitRename();
                  if (event.key === "Escape") node.reset();
                }}
                styles={{ input: { minHeight: 26 } }}
              />
            ) : (
              <Text size="sm" truncate title={node.data.name}>
                {node.data.name}
              </Text>
            )}
          </Group>
          <Text size="sm" c="dimmed" px="sm">
            {node.data.kind === "file" ? formatSize(node.data.size) : "-"}
          </Text>
          <Text size="sm" c="dimmed" px="sm" truncate>
            {formatDate(node.data.updated_at)}
          </Text>
          <input
            ref={replaceInputRef}
            type="file"
            hidden
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) onReplace(node.data, file);
            }}
          />
        </Box>
      </Menu.Target>
      <Menu.Dropdown>
        {node.data.kind === "file" ? (
          <>
            <Menu.Item onClick={() => onPreview(node.data)}>{t("drive.preview")}</Menu.Item>
            <Menu.Item component="a" href={driveDownloadUrl(node.data.id)} target="_blank" rel="noreferrer">
              {t("drive.download")}
            </Menu.Item>
          </>
        ) : null}
        {node.data.kind === "folder" && canManage ? (
          <Menu.Item onClick={() => onCreateFolder(node.data)}>{t("drive.newChildFolder")}</Menu.Item>
        ) : null}
        {canManage ? (
          <>
            <Menu.Item onClick={() => void node.edit()}>{t("drive.rename")}</Menu.Item>
            {node.data.kind === "file" ? (
              <Menu.Item onClick={() => replaceInputRef.current?.click()}>{t("drive.replaceFile")}</Menu.Item>
            ) : null}
            <Menu.Item color="red" onClick={() => onDelete(node.data)}>
              {t("common.delete")}
            </Menu.Item>
          </>
        ) : null}
      </Menu.Dropdown>
    </Menu>
  );
}
