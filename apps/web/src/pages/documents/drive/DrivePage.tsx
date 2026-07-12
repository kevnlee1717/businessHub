import { Alert, Box, Button, Group, Loader, Modal, Paper, Stack, Text, TextInput } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  createFolder,
  deleteNode,
  driveKeys,
  getDriveTree,
  patchNode,
  replaceFile,
  uploadFiles,
  type DriveNode,
  type DrivePatchInput
} from "../../../api/drive";
import { useAuth } from "../../../auth/AuthContext";
import { DrivePreviewModal } from "./DrivePreviewModal";
import { DriveTree } from "./DriveTree";
import { type DriveTreeNode } from "./types";

function ErrorAlert({ error }: { error: unknown }) {
  const { t } = useTranslation();
  return error ? (
    <Alert color="red" variant="light">
      {error instanceof Error ? error.message : t("common.unknown_error")}
    </Alert>
  ) : null;
}

function sortNodes(a: DriveTreeNode, b: DriveTreeNode) {
  if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return a.name.localeCompare(b.name);
}

function buildTree(nodes: DriveNode[]) {
  const map = new Map<string, DriveTreeNode>();
  const roots: DriveTreeNode[] = [];

  nodes.forEach((node) => {
    const treeNode: DriveTreeNode = {
      ...node,
      url: node.url ?? null
    };
    if (node.kind === "folder") {
      treeNode.children = [];
    }
    map.set(node.id, treeNode);
  });

  map.forEach((node) => {
    if (node.parent_id) {
      const parent = map.get(node.parent_id);
      if (parent?.kind === "folder") {
        parent.children?.push(node);
        return;
      }
    }
    roots.push(node);
  });

  const sortBranch = (branch: DriveTreeNode[]) => {
    branch.sort(sortNodes);
    branch.forEach((node) => {
      if (node.children) sortBranch(node.children);
    });
  };
  sortBranch(roots);

  return roots;
}

function CreateFolderModal({
  opened,
  parentName,
  saving,
  onClose,
  onSubmit
}: {
  opened: boolean;
  parentName: string | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const next = name.trim();
    if (!next) {
      setError(t("drive.validation.nameRequired"));
      return;
    }
    setError(null);
    await onSubmit(next);
    setName("");
  }

  function close() {
    setName("");
    setError(null);
    onClose();
  }

  return (
    <Modal
      opened={opened}
      onClose={close}
      title={t("drive.newFolder")}
    >
      <Stack gap="sm">
        {parentName ? (
          <Text size="sm" c="dimmed">
            {t("drive.parentFolder", { name: parentName })}
          </Text>
        ) : null}
        <TextInput
          label={t("drive.fields.folderName")}
          value={name}
          error={error}
          autoFocus
          onChange={(event) => setName(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit();
          }}
        />
        <Group justify="flex-end">
          <Button variant="subtle" onClick={close}>
            {t("common.cancel")}
          </Button>
          <Button loading={saving} onClick={() => void submit()}>
            {t("common.save")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export function DrivePage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const canManage = can("brochure.manage");
  const queryClient = useQueryClient();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<DriveNode | null>(null);
  const [folderModalOpened, setFolderModalOpened] = useState(false);
  const [folderParent, setFolderParent] = useState<DriveNode | null>(null);
  const [renameRequest, setRenameRequest] = useState<{ id: string; seq: number } | null>(null);
  const [operationError, setOperationError] = useState<unknown>(null);

  const treeQuery = useQuery({
    queryKey: driveKeys.tree(),
    queryFn: getDriveTree
  });

  const nodes = treeQuery.data?.nodes ?? [];
  const tree = useMemo(() => buildTree(nodes), [nodes]);
  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedId) ?? null, [nodes, selectedId]);

  async function invalidateTree() {
    await queryClient.invalidateQueries({ queryKey: driveKeys.tree() });
  }

  const createFolderMutation = useMutation({
    mutationFn: createFolder,
    onSuccess: invalidateTree
  });

  const uploadMutation = useMutation({
    mutationFn: uploadFiles,
    onSuccess: invalidateTree
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: DrivePatchInput }) => patchNode(id, body),
    onSuccess: invalidateTree
  });

  const replaceMutation = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => replaceFile(id, file),
    onSuccess: invalidateTree
  });

  const deleteMutation = useMutation({
    mutationFn: deleteNode,
    onSuccess: async () => {
      setSelectedId(null);
      await invalidateTree();
    }
  });

  const busy =
    createFolderMutation.isPending ||
    uploadMutation.isPending ||
    patchMutation.isPending ||
    replaceMutation.isPending ||
    deleteMutation.isPending;

  async function runOperation(operation: () => Promise<unknown>) {
    setOperationError(null);
    try {
      await operation();
    } catch (error) {
      setOperationError(error);
    }
  }

  function openCreateFolder(parent: DriveNode | null) {
    if (!canManage) return;
    setFolderParent(parent);
    setFolderModalOpened(true);
  }

  function removeNode(node: DriveNode) {
    if (!canManage) return;
    if (!window.confirm(t("drive.confirmDelete", { name: node.name }))) return;
    void runOperation(() => deleteMutation.mutateAsync(node.id));
  }

  function uploadTargetParentId() {
    return selectedNode?.kind === "folder" ? selectedNode.id : null;
  }

  return (
    <Box p="md">
      <Stack gap="md">
        <Group justify="space-between" align="center" wrap="wrap">
          <Text size="lg" fw={500}>
            {t("drive.title")}
          </Text>
          {busy ? <Loader size="sm" /> : null}
        </Group>

        <Group gap="sm" mb="xs" wrap="wrap">
          <TextInput
            w={240}
            placeholder={t("drive.searchPlaceholder")}
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
          {canManage ? (
            <>
              <Button onClick={() => openCreateFolder(selectedNode?.kind === "folder" ? selectedNode : null)}>
                {t("drive.newFolder")}
              </Button>
              <Button variant="light" loading={uploadMutation.isPending} onClick={() => uploadInputRef.current?.click()}>
                {t("drive.uploadFiles")}
              </Button>
              {selectedNode ? (
                <>
                  <Button
                    variant="light"
                    onClick={() => setRenameRequest((current) => ({ id: selectedNode.id, seq: (current?.seq ?? 0) + 1 }))}
                  >
                    {t("drive.rename")}
                  </Button>
                  <Button color="red" variant="light" loading={deleteMutation.isPending} onClick={() => removeNode(selectedNode)}>
                    {t("common.delete")}
                  </Button>
                </>
              ) : null}
            </>
          ) : null}
          <input
            ref={uploadInputRef}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = "";
              if (files.length > 0) {
                void runOperation(() => uploadMutation.mutateAsync({ parent_id: uploadTargetParentId(), files }));
              }
            }}
          />
        </Group>

        <ErrorAlert error={treeQuery.error ?? operationError} />

        <Paper p={0}>
          {treeQuery.isLoading ? (
            <Group justify="center" py="xl">
              <Loader size="sm" />
            </Group>
          ) : (
            <DriveTree
              tree={tree}
              searchTerm={search}
              height={560}
              canManage={canManage}
              selectedId={selectedId}
              renameRequest={renameRequest}
              onSelect={(node) => setSelectedId(node?.id ?? null)}
              onMove={(id, body) => runOperation(() => patchMutation.mutateAsync({ id, body }))}
              onRename={(id, body) => runOperation(() => patchMutation.mutateAsync({ id, body }))}
              onDelete={removeNode}
              onPreview={(node) => setPreviewFile(node)}
              onReplace={(node, file) => {
                if (canManage) void runOperation(() => replaceMutation.mutateAsync({ id: node.id, file }));
              }}
              onCreateFolder={(node) => openCreateFolder(node)}
            />
          )}
        </Paper>
      </Stack>

      <CreateFolderModal
        opened={folderModalOpened}
        parentName={folderParent?.name ?? null}
        saving={createFolderMutation.isPending}
        onClose={() => {
          setFolderModalOpened(false);
          setFolderParent(null);
          createFolderMutation.reset();
        }}
        onSubmit={async (name) => {
          const parentId = folderParent?.id ?? null;
          await runOperation(() => createFolderMutation.mutateAsync({ parent_id: parentId, name }));
          setFolderModalOpened(false);
          setFolderParent(null);
        }}
      />

      <DrivePreviewModal opened={previewFile !== null} file={previewFile} onClose={() => setPreviewFile(null)} />
    </Box>
  );
}
