import { Box } from "@mantine/core";
import { useMemo } from "react";
import { type DriveNode, type DrivePatchInput } from "../../../api/drive";
import { DriveColumn, DriveFilePreviewColumn } from "./DriveColumn";
import { type DriveNodeAction } from "./types";

function sortNodes(a: DriveNode, b: DriveNode) {
  if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return a.name.localeCompare(b.name);
}

export function buildChildrenMap(nodes: DriveNode[]) {
  const map = new Map<string, DriveNode[]>();
  const rootKey = "";

  nodes.forEach((node) => {
    const key = node.parent_id ?? rootKey;
    const children = map.get(key) ?? [];
    children.push(node);
    map.set(key, children);
  });

  map.forEach((children) => children.sort(sortNodes));
  return map;
}

function selectedIdForColumn(columnIndex: number, selectedPath: string[], selectedFileId: string | null) {
  if (columnIndex < selectedPath.length) return selectedPath[columnIndex] ?? null;
  if (columnIndex === selectedPath.length) return selectedFileId;
  return null;
}

export function DriveColumns({
  nodes,
  selectedPath,
  selectedFileId,
  canManage,
  editingId,
  onSelectPath,
  onSelectFile,
  onOpenPreview,
  onStartRename,
  onCancelRename,
  onSubmitRename,
  onDelete,
  onReplace,
  onCreateFolder,
  onMove
}: {
  nodes: DriveNode[];
  selectedPath: string[];
  selectedFileId: string | null;
  canManage: boolean;
  editingId: string | null;
  onSelectPath: (path: string[]) => void;
  onSelectFile: (id: string | null) => void;
  onOpenPreview: DriveNodeAction;
  onStartRename: DriveNodeAction;
  onCancelRename: () => void;
  onSubmitRename: (node: DriveNode, name: string) => void;
  onDelete: DriveNodeAction;
  onReplace: (node: DriveNode, file: File) => void;
  onCreateFolder: DriveNodeAction;
  onMove: (id: string, body: Pick<DrivePatchInput, "parent_id">) => Promise<void>;
}) {
  const childrenMap = useMemo(() => buildChildrenMap(nodes), [nodes]);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const parents: (string | null)[] = [null, ...selectedPath];
  const selectedFile = selectedFileId ? nodeById.get(selectedFileId) ?? null : null;

  function handleSelect(columnIndex: number, node: DriveNode) {
    if (node.kind === "folder") {
      onSelectPath([...selectedPath.slice(0, columnIndex), node.id]);
      onSelectFile(null);
      return;
    }

    onSelectPath(selectedPath.slice(0, columnIndex));
    onSelectFile(node.id);
  }

  async function moveToFolder(folder: DriveNode, dragId: string) {
    if (!canManage || !dragId || dragId === folder.id) return;
    await onMove(dragId, { parent_id: folder.id });
  }

  async function moveToColumn(parentId: string | null, dragId: string) {
    if (!canManage || !dragId) return;
    const dragged = nodeById.get(dragId);
    if (dragged?.parent_id === parentId) return;
    await onMove(dragId, { parent_id: parentId });
  }

  return (
    <Box
      h={560}
      style={{
        display: "flex",
        overflowX: "auto",
        overflowY: "hidden",
        border: "1px solid #dcdfe6",
        background: "#fff"
      }}
    >
      {parents.map((parentId, columnIndex) => {
        const key = parentId ?? "";
        return (
          <DriveColumn
            key={`${key}:${columnIndex}`}
            parentId={parentId}
            items={childrenMap.get(key) ?? []}
            selectedId={selectedIdForColumn(columnIndex, selectedPath, selectedFileId)}
            canManage={canManage}
            editingId={editingId}
            dropTargetId={null}
            onSelect={(node) => handleSelect(columnIndex, node)}
            onOpenPreview={onOpenPreview}
            onStartRename={onStartRename}
            onCancelRename={onCancelRename}
            onSubmitRename={onSubmitRename}
            onDelete={onDelete}
            onReplace={onReplace}
            onCreateFolder={onCreateFolder}
            onDragStart={() => undefined}
            onDropOnFolder={(node, dragId) => void moveToFolder(node, dragId)}
            onDropOnColumn={(targetParentId, dragId) => void moveToColumn(targetParentId, dragId)}
          />
        );
      })}
      {selectedFile ? <DriveFilePreviewColumn file={selectedFile} /> : null}
    </Box>
  );
}
