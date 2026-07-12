import { Alert, Anchor, Box, Breadcrumbs, Button, Group, Loader, Modal, Paper, Stack, Text, TextInput } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { DriveColumns } from "./DriveColumns";
import { DrivePreviewModal } from "./DrivePreviewModal";

function ErrorAlert({ error }: { error: unknown }) {
  const { t } = useTranslation();
  return error ? (
    <Alert color="red" variant="light">
      {error instanceof Error ? error.message : t("common.unknown_error")}
    </Alert>
  ) : null;
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
    <Modal opened={opened} onClose={close} title={t("drive.newFolder")}>
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

function sanitizePath(path: string[], nodeById: Map<string, DriveNode>) {
  const next: string[] = [];
  let parentId: string | null = null;

  for (const id of path) {
    const node = nodeById.get(id);
    if (!node || node.kind !== "folder" || node.parent_id !== parentId) break;
    next.push(id);
    parentId = id;
  }

  return next;
}

export function DrivePage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const canManage = can("brochure.manage");
  const queryClient = useQueryClient();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedPath, setSelectedPath] = useState<string[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<DriveNode | null>(null);
  const [folderModalOpened, setFolderModalOpened] = useState(false);
  const [folderParent, setFolderParent] = useState<DriveNode | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<unknown>(null);

  const treeQuery = useQuery({
    queryKey: driveKeys.tree(),
    queryFn: getDriveTree
  });

  const nodes = treeQuery.data?.nodes ?? [];
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const currentFolderId = selectedPath[selectedPath.length - 1] ?? null;
  const currentFolder = currentFolderId ? nodeById.get(currentFolderId) ?? null : null;
  const selectedNode = selectedFileId ? nodeById.get(selectedFileId) ?? null : currentFolder;

  useEffect(() => {
    const nextPath = sanitizePath(selectedPath, nodeById);
    if (nextPath.length !== selectedPath.length || nextPath.some((id, index) => id !== selectedPath[index])) {
      setSelectedPath(nextPath);
    }
    if (selectedFileId && !nodeById.has(selectedFileId)) {
      setSelectedFileId(null);
    }
    if (editingId && !nodeById.has(editingId)) {
      setEditingId(null);
    }
  }, [editingId, nodeById, selectedFileId, selectedPath]);

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
    onSuccess: invalidateTree
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
    if (node.kind === "folder") {
      const index = selectedPath.indexOf(node.id);
      if (index >= 0) setSelectedPath(selectedPath.slice(0, index));
    }
    if (selectedFileId === node.id) setSelectedFileId(null);
    if (editingId === node.id) setEditingId(null);
    void runOperation(() => deleteMutation.mutateAsync(node.id));
  }

  function uploadTargetParentId() {
    return currentFolder?.kind === "folder" ? currentFolder.id : null;
  }

  function startRename(node: DriveNode) {
    if (canManage) setEditingId(node.id);
  }

  function submitRename(node: DriveNode, name: string) {
    if (!canManage) return;
    void runOperation(async () => {
      await patchMutation.mutateAsync({ id: node.id, body: { name } });
      setEditingId(null);
    });
  }

  const breadcrumbs = [
    <Anchor
      key="root"
      size="sm"
      onClick={() => {
        setSelectedPath([]);
        setSelectedFileId(null);
      }}
    >
      {t("drive.root")}
    </Anchor>,
    ...selectedPath.map((id, index) => {
      const folder = nodeById.get(id);
      return (
        <Anchor
          key={id}
          size="sm"
          onClick={() => {
            setSelectedPath(selectedPath.slice(0, index + 1));
            setSelectedFileId(null);
          }}
        >
          {folder?.name ?? id}
        </Anchor>
      );
    })
  ];

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
          <Breadcrumbs separator="/">{breadcrumbs}</Breadcrumbs>
          {canManage ? (
            <>
              <Button onClick={() => openCreateFolder(currentFolder?.kind === "folder" ? currentFolder : null)}>
                {t("drive.newFolder")}
              </Button>
              <Button variant="light" loading={uploadMutation.isPending} onClick={() => uploadInputRef.current?.click()}>
                {t("drive.uploadFiles")}
              </Button>
              {selectedNode ? (
                <>
                  <Button variant="light" onClick={() => startRename(selectedNode)}>
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
            <DriveColumns
              nodes={nodes}
              selectedPath={selectedPath}
              selectedFileId={selectedFileId}
              canManage={canManage}
              editingId={editingId}
              onSelectPath={setSelectedPath}
              onSelectFile={setSelectedFileId}
              onOpenPreview={(node) => setPreviewFile(node)}
              onStartRename={startRename}
              onCancelRename={() => setEditingId(null)}
              onSubmitRename={submitRename}
              onDelete={removeNode}
              onReplace={(node, file) => {
                if (canManage) void runOperation(() => replaceMutation.mutateAsync({ id: node.id, file }));
              }}
              onCreateFolder={(node) => openCreateFolder(node)}
              onMove={(id, body) => runOperation(() => patchMutation.mutateAsync({ id, body }))}
            />
          )}
        </Paper>

        {!canManage ? (
          <Alert color="blue" variant="light">
            {t("drive.readonly")}
          </Alert>
        ) : null}
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
          const parentId = folderParent?.id ?? uploadTargetParentId();
          await runOperation(() => createFolderMutation.mutateAsync({ parent_id: parentId, name }));
          setFolderModalOpened(false);
          setFolderParent(null);
        }}
      />

      <DrivePreviewModal opened={previewFile !== null} file={previewFile} onClose={() => setPreviewFile(null)} />
    </Box>
  );
}
