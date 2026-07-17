import { Alert, Anchor, Box, Breadcrumbs, Button, Group, Loader, Modal, Notification, Paper, Stack, Text, TextInput } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  caseFileDownloadUrl,
  caseFilesKeys,
  createCaseFolder,
  deleteCaseFileNode,
  ensureCaseFilesRoot,
  getCaseFilesTree,
  patchCaseFileNode,
  replaceCaseFile,
  uploadCaseFiles,
  uploadCaseFolder
} from "../../api/caseFiles";
import { type DriveNode, type DrivePatchInput } from "../../api/drive";
import { DriveColumns } from "../documents/drive/DriveColumns";
import { DrivePreviewModal } from "../documents/drive/DrivePreviewModal";

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

export function CaseFilesPanel({ caseId, canManage }: { caseId: string; canManage: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const uploadFolderInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedPath, setSelectedPath] = useState<string[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<DriveNode | null>(null);
  const [folderModalOpened, setFolderModalOpened] = useState(false);
  const [folderParent, setFolderParent] = useState<DriveNode | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<unknown>(null);
  const [toast, setToast] = useState<{ color: "green" | "red"; message: string } | null>(null);

  const ensureQuery = useQuery({
    queryKey: ["caseFiles", caseId, "ensure-root"],
    queryFn: () => ensureCaseFilesRoot(caseId),
    enabled: Boolean(caseId) && canManage
  });

  const treeQuery = useQuery({
    queryKey: caseFilesKeys.tree(caseId),
    queryFn: () => getCaseFilesTree(caseId),
    enabled: Boolean(caseId) && (!canManage || ensureQuery.isSuccess)
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

  useEffect(() => {
    const input = uploadFolderInputRef.current;
    if (!input) return;
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function invalidateTree() {
    await queryClient.invalidateQueries({ queryKey: caseFilesKeys.tree(caseId) });
  }

  const createFolderMutation = useMutation({
    mutationFn: (body: { parent_id: string | null; name: string }) => createCaseFolder(caseId, body),
    onSuccess: invalidateTree
  });

  const uploadMutation = useMutation({
    mutationFn: (input: { parent_id: string | null; files: File[] }) => uploadCaseFiles(caseId, input),
    onSuccess: invalidateTree
  });

  const uploadFolderMutation = useMutation({
    mutationFn: (input: { parent_id: string | null; files: File[] }) => uploadCaseFolder(caseId, input),
    onSuccess: async (result) => {
      await invalidateTree();
      setToast({
        color: "green",
        message: t("drive.uploadFolderSuccess", {
          folders: result.created_folders,
          files: result.created_files
        })
      });
    },
    onError: (error) => {
      setToast({
        color: "red",
        message: error instanceof Error ? error.message : t("common.unknown_error")
      });
    }
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: DrivePatchInput }) => patchCaseFileNode(caseId, id, body),
    onSuccess: invalidateTree
  });

  const replaceMutation = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => replaceCaseFile(caseId, id, file),
    onSuccess: invalidateTree
  });

  const deleteMutation = useMutation({
    mutationFn: (nodeId: string) => deleteCaseFileNode(caseId, nodeId),
    onSuccess: invalidateTree
  });

  const busy =
    (canManage && ensureQuery.isLoading) ||
    createFolderMutation.isPending ||
    uploadMutation.isPending ||
    uploadFolderMutation.isPending ||
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
    <Box>
      <Stack gap="md">
        <Group justify="space-between" align="center" wrap="wrap">
          <Text size="lg" fw={500}>
            {t("case.files.title")}
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
              <Button
                variant="light"
                loading={uploadFolderMutation.isPending}
                disabled={uploadFolderMutation.isPending}
                onClick={() => uploadFolderInputRef.current?.click()}
              >
                {t("drive.uploadFolder")}
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
          <input
            ref={uploadFolderInputRef}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              const input = event.currentTarget;
              const files = Array.from(input.files ?? []);
              if (files.length > 0) {
                uploadFolderMutation.mutate(
                  { parent_id: uploadTargetParentId(), files },
                  {
                    onSettled: () => {
                      input.value = "";
                    }
                  }
                );
              } else {
                input.value = "";
              }
            }}
          />
        </Group>

        <ErrorAlert error={(canManage ? ensureQuery.error : null) ?? treeQuery.error ?? operationError} />

        <Paper p={0}>
          {(canManage && ensureQuery.isLoading) || treeQuery.isLoading ? (
            <Group justify="center" py="xl">
              <Loader size="sm" />
            </Group>
          ) : nodes.length === 0 ? (
            <Group justify="center" py="xl">
              <Text c="dimmed">{t("case.files.empty")}</Text>
            </Group>
          ) : (
            <DriveColumns
              nodes={nodes}
              selectedPath={selectedPath}
              selectedFileId={selectedFileId}
              canManage={canManage}
              canDelete={canManage}
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

      <DrivePreviewModal
        opened={previewFile !== null}
        file={previewFile}
        downloadUrl={previewFile ? caseFileDownloadUrl(caseId, previewFile.id) : undefined}
        onClose={() => setPreviewFile(null)}
      />
      {toast ? (
        <Box pos="fixed" top={16} right={16} w={320} style={{ zIndex: 4000 }}>
          <Notification color={toast.color} onClose={() => setToast(null)} withBorder>
            {toast.message}
          </Notification>
        </Box>
      ) : null}
    </Box>
  );
}
