import { Alert, Box, Table, Text } from "@mantine/core";
import { Tree, type MoveHandler, type NodeRendererProps, type RenameHandler, type TreeApi } from "react-arborist";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { type DrivePatchInput } from "../../../api/drive";
import { DriveRow } from "./DriveRow";
import { type DriveNodeAction, type DriveTreeNode } from "./types";

export function DriveTree({
  tree,
  searchTerm,
  height,
  canManage,
  selectedId,
  renameRequest,
  onSelect,
  onMove,
  onRename,
  onDelete,
  onPreview,
  onReplace,
  onCreateFolder
}: {
  tree: DriveTreeNode[];
  searchTerm: string;
  height: number;
  canManage: boolean;
  selectedId: string | null;
  renameRequest: { id: string; seq: number } | null;
  onSelect: (node: DriveTreeNode | null) => void;
  onMove: (id: string, body: Pick<DrivePatchInput, "parent_id">) => Promise<void>;
  onRename: (id: string, body: Pick<DrivePatchInput, "name">) => Promise<void>;
  onDelete: DriveNodeAction;
  onPreview: DriveNodeAction;
  onReplace: (node: DriveTreeNode, file: File) => void;
  onCreateFolder: DriveNodeAction;
}) {
  const { t } = useTranslation();
  const treeRef = useRef<TreeApi<DriveTreeNode>>();

  useEffect(() => {
    if (renameRequest && canManage) {
      void treeRef.current?.edit(renameRequest.id);
    }
  }, [canManage, renameRequest]);

  const moveHandler: MoveHandler<DriveTreeNode> = async ({ dragIds, parentId }) => {
    await Promise.all(dragIds.map((id) => onMove(id, { parent_id: parentId })));
  };

  const renameHandler: RenameHandler<DriveTreeNode> = async ({ id, name }) => {
    const next = name.trim();
    if (next) {
      await onRename(id, { name: next });
    }
  };

  const Row = (props: NodeRendererProps<DriveTreeNode>) => (
    <DriveRow
      {...props}
      canManage={canManage}
      onDelete={onDelete}
      onPreview={onPreview}
      onReplace={onReplace}
      onCreateFolder={onCreateFolder}
    />
  );

  return (
    <Box>
      <Table withTableBorder withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t("drive.columns.name")}</Table.Th>
            <Table.Th w={120}>{t("drive.columns.size")}</Table.Th>
            <Table.Th w={190}>{t("drive.columns.updatedAt")}</Table.Th>
          </Table.Tr>
        </Table.Thead>
      </Table>
      <Box style={{ border: "1px solid #dcdfe6", borderTop: 0 }}>
        {tree.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            {t("drive.empty")}
          </Text>
        ) : (
          <Tree<DriveTreeNode>
            ref={treeRef}
            data={tree}
            idAccessor="id"
            childrenAccessor="children"
            openByDefault={false}
            width="100%"
            height={height}
            rowHeight={36}
            searchTerm={searchTerm}
            searchMatch={(node, term) => node.data.name.toLowerCase().includes(term.toLowerCase())}
            onMove={moveHandler}
            onRename={renameHandler}
            disableDrag={!canManage}
            disableEdit={!canManage}
            disableDrop={({ parentNode }) =>
              !canManage || (parentNode != null && parentNode.data.kind !== "folder")
            }
            {...(selectedId ? { selection: selectedId } : {})}
            onSelect={(nodes) => onSelect(nodes[0]?.data ?? null)}
          >
            {Row}
          </Tree>
        )}
      </Box>
      {!canManage ? (
        <Alert color="blue" variant="light" mt="sm">
          {t("drive.readonly")}
        </Alert>
      ) : null}
    </Box>
  );
}
