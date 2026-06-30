import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Badge,
  Button,
  FileInput,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title
} from "@mantine/core";
import {
  contractCreateSchema,
  contractStatuses,
  contractSubjectTypes,
  contractVersionStatuses,
  type ContractCreateInput,
  type ContractStatus,
  type ContractSubjectType,
  type ContractVersionStatus
} from "@bh/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  createContract,
  getContract,
  listContracts,
  updateContract,
  updateContractVersion,
  uploadContractVersion,
  type Contract,
  type ContractVersion
} from "../../api/dms";
import { TablePagination } from "../../components/TablePagination";
import { usePagination } from "../../hooks/usePagination";

type ContractFormValues = {
  subject_type?: string | undefined;
  subject_id?: string | null | undefined;
  title?: string | undefined;
  party_info?: string | null | undefined;
  status?: string | undefined;
};

function getContractDefaults(): ContractFormValues {
  return {
    subject_type: "company",
    subject_id: null,
    title: "",
    party_info: null,
    status: "draft"
  };
}

function statusColor(status: string) {
  switch (status) {
    case "active":
    case "signed":
      return "green";
    case "expired":
    case "terminated":
    case "superseded":
      return "gray";
    default:
      return "yellow";
  }
}

export function ContractsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [subjectTypeFilter, setSubjectTypeFilter] = useState<string | null>(null);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [modalOpened, setModalOpened] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadNote, setUploadNote] = useState("");
  const [uploadStatus, setUploadStatus] = useState<string | null>("draft");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { page, pageSize, setPage, setPageSize } = usePagination();

  const contractsQuery = useQuery({
    queryKey: ["documents", "contracts", subjectTypeFilter, page, pageSize],
    queryFn: () =>
      listContracts({
        subject_type: subjectTypeFilter,
        page,
        page_size: pageSize
      }),
    placeholderData: keepPreviousData
  });
  const detailQuery = useQuery({
    queryKey: ["documents", "contract", selectedContractId],
    queryFn: () => getContract(selectedContractId ?? ""),
    enabled: Boolean(selectedContractId)
  });

  const form = useForm<ContractFormValues>({
    resolver: zodResolver(contractCreateSchema) as Resolver<ContractFormValues>,
    defaultValues: getContractDefaults()
  });

  const createMutation = useMutation({
    mutationFn: createContract,
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["documents", "contracts"] });
      setSelectedContractId(data.contract.id);
      closeModal();
    }
  });
  const updateContractMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ContractStatus }) => updateContract(id, { status }),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["documents", "contracts"] }),
        queryClient.invalidateQueries({ queryKey: ["documents", "contract", variables.id] })
      ]);
    }
  });
  const uploadMutation = useMutation({
    mutationFn: ({ contractId, file }: { contractId: string; file: File }) =>
      uploadContractVersion(contractId, {
        file,
        note: uploadNote,
        status: uploadStatus
      }),
    onSuccess: async (_data, variables) => {
      setUploadFile(null);
      setUploadNote("");
      setUploadStatus("draft");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["documents", "contracts"] }),
        queryClient.invalidateQueries({ queryKey: ["documents", "contract", variables.contractId] })
      ]);
    }
  });
  const updateVersionMutation = useMutation({
    mutationFn: ({ versionId, status, note }: { versionId: string; status: ContractVersionStatus; note?: string | null }) =>
      updateContractVersion(versionId, { status, note }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["documents", "contract", selectedContractId] });
    }
  });

  const contracts = contractsQuery.data?.contracts ?? [];
  const totalContracts = contractsQuery.data?.total ?? contracts.length;
  const detail = detailQuery.data;
  const selectedContract = detail?.contract;
  const versions = detail?.versions ?? [];
  const errors = form.formState.errors;

  const subjectTypeOptions = contractSubjectTypes.map((type) => ({
    value: type,
    label: t(`contractSubjectType.${type}`)
  }));
  const contractStatusOptions = contractStatuses.map((status) => ({
    value: status,
    label: t(`contractStatus.${status}`)
  }));
  const versionStatusOptions = contractVersionStatuses.map((status) => ({
    value: status,
    label: t(`contractVersionStatus.${status}`)
  }));

  function openModal() {
    setFormError(null);
    form.reset(getContractDefaults());
    setModalOpened(true);
  }

  function closeModal() {
    setModalOpened(false);
    setFormError(null);
    form.reset(getContractDefaults());
  }

  function updateSubjectTypeFilter(value: string | null) {
    setSubjectTypeFilter(value);
    setPage(1);
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await createMutation.mutateAsync({
        ...(values as ContractCreateInput),
        subject_id: values.subject_id?.trim() || null,
        party_info: values.party_info?.trim() || null
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  async function changeContractStatus(contract: Contract, status: string | null) {
    if (!status) {
      return;
    }

    try {
      await updateContractMutation.mutateAsync({ id: contract.id, status: status as ContractStatus });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  }

  async function changeVersionStatus(version: ContractVersion, status: string | null) {
    if (!status) {
      return;
    }

    try {
      const body: { versionId: string; status: ContractVersionStatus; note?: string | null } = {
        versionId: version.id,
        status: status as ContractVersionStatus
      };

      if (version.note !== undefined) {
        body.note = version.note;
      }

      await updateVersionMutation.mutateAsync(body);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  }

  async function uploadVersion() {
    if (!selectedContractId || !uploadFile) {
      setUploadError(t("contractVersion.fileRequired"));
      return;
    }

    setUploadError(null);
    try {
      await uploadMutation.mutateAsync({ contractId: selectedContractId, file: uploadFile });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Button onClick={openModal}>{t("contract.add")}</Button>
      </Group>

      <Paper withBorder radius="md" p="md">
        <Select
          label={t("contract.fields.subjectType")}
          placeholder={t("common.all")}
          data={subjectTypeOptions}
          value={subjectTypeFilter}
          onChange={updateSubjectTypeFilter}
          clearable
        />
      </Paper>

      {contractsQuery.error ? (
        <Alert color="red" variant="light">
          {contractsQuery.error instanceof Error ? contractsQuery.error.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      <Paper withBorder radius="md">
        <ScrollArea>
          <Table miw={820} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("contract.fields.title")}</Table.Th>
                <Table.Th>{t("contract.fields.subjectType")}</Table.Th>
                <Table.Th>{t("contract.fields.status")}</Table.Th>
                <Table.Th>{t("contract.fields.currentVersionNo")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {contractsQuery.isLoading ? (
                <Table.Tr>
                  <Table.Td colSpan={4}>
                    <Group justify="center" py="lg">
                      <Loader size="sm" />
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ) : contracts.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={4}>
                    <Text ta="center" c="dimmed" py="lg">
                      {t("contract.empty")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                contracts.map((contract) => (
                  <Table.Tr
                    key={contract.id}
                    onClick={() => setSelectedContractId(contract.id)}
                    style={{
                      cursor: "pointer",
                      backgroundColor:
                        selectedContractId === contract.id ? "var(--mantine-color-blue-light)" : undefined
                    }}
                  >
                    <Table.Td>{contract.title}</Table.Td>
                    <Table.Td>{t(`contractSubjectType.${contract.subject_type}`)}</Table.Td>
                    <Table.Td>
                      <Badge color={statusColor(contract.status)} variant="light">
                        {t(`contractStatus.${contract.status}`)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{contract.current_version_no}</Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Paper>
      <TablePagination
        total={totalContracts}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      {selectedContractId ? (
        <Paper withBorder radius="md" p="md">
          {detailQuery.isLoading ? (
            <Group justify="center" py="lg">
              <Loader size="sm" />
            </Group>
          ) : selectedContract ? (
            <Stack gap="md">
              <Group justify="space-between" align="flex-start">
                <Stack gap={4}>
                  <Title order={3}>{selectedContract.title}</Title>
                  <Text size="sm" c="dimmed">
                    {t("contract.fields.subjectType")}: {t(`contractSubjectType.${selectedContract.subject_type}`)}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {t("contract.fields.subjectId")}: {selectedContract.subject_id || t("common.not_available")}
                  </Text>
                  {selectedContract.party_info ? <Text>{selectedContract.party_info}</Text> : null}
                </Stack>
                <Select
                  w={180}
                  label={t("contract.fields.status")}
                  data={contractStatusOptions}
                  value={selectedContract.status}
                  onChange={(value) => changeContractStatus(selectedContract, value)}
                  disabled={updateContractMutation.isPending}
                />
              </Group>

              {uploadError ? (
                <Alert color="red" variant="light">
                  {uploadError}
                </Alert>
              ) : null}

              <Title order={4}>{t("contractVersion.title")}</Title>
              <ScrollArea>
                <Table miw={760} verticalSpacing="sm" striped>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t("contractVersion.fields.versionNo")}</Table.Th>
                      <Table.Th>{t("contractVersion.fields.status")}</Table.Th>
                      <Table.Th>{t("contractVersion.fields.note")}</Table.Th>
                      <Table.Th>{t("contractVersion.fields.document")}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {versions.length === 0 ? (
                      <Table.Tr>
                        <Table.Td colSpan={4}>
                          <Text ta="center" c="dimmed" py="lg">
                            {t("contractVersion.empty")}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ) : (
                      versions.map((version) => (
                        <Table.Tr key={version.id}>
                          <Table.Td>
                            <Badge variant="light">v{version.version_no}</Badge>
                          </Table.Td>
                          <Table.Td>
                            <Select
                              data={versionStatusOptions}
                              value={version.status}
                              onChange={(value) => changeVersionStatus(version, value)}
                              disabled={updateVersionMutation.isPending}
                            />
                          </Table.Td>
                          <Table.Td>{version.note || "-"}</Table.Td>
                          <Table.Td>{version.document_id ?? "-"}</Table.Td>
                        </Table.Tr>
                      ))
                    )}
                  </Table.Tbody>
                </Table>
              </ScrollArea>

              <Paper withBorder radius="md" p="md">
                <Stack gap="md">
                  <Title order={4}>{t("contractVersion.uploadTitle")}</Title>
                  <FileInput
                    label={t("document.fields.file")}
                    value={uploadFile}
                    onChange={setUploadFile}
                    clearable
                  />
                  <Textarea
                    label={t("contractVersion.fields.note")}
                    value={uploadNote}
                    onChange={(event) => setUploadNote(event.currentTarget.value)}
                    autosize
                    minRows={3}
                  />
                  <Select
                    label={t("contractVersion.fields.status")}
                    data={versionStatusOptions}
                    value={uploadStatus}
                    onChange={setUploadStatus}
                  />
                  <Group justify="flex-end">
                    <Button onClick={uploadVersion} loading={uploadMutation.isPending} disabled={!uploadFile}>
                      {t("common.upload")}
                    </Button>
                  </Group>
                </Stack>
              </Paper>
            </Stack>
          ) : (
            <Text c="dimmed">{t("contract.selectHint")}</Text>
          )}
        </Paper>
      ) : (
        <Paper withBorder radius="md" p="lg">
          <Text c="dimmed">{t("contract.selectHint")}</Text>
        </Paper>
      )}

      <Modal opened={modalOpened} onClose={closeModal} title={t("contract.add")} size="lg">
        <form onSubmit={onSubmit}>
          <Stack gap="md">
            {formError ? (
              <Alert color="red" variant="light">
                {formError}
              </Alert>
            ) : null}
            <Controller
              name="subject_type"
              control={form.control}
              render={({ field }) => (
                <Select
                  label={t("contract.fields.subjectType")}
                  data={subjectTypeOptions}
                  value={field.value ?? null}
                  onChange={(value) => field.onChange((value ?? "") as ContractSubjectType)}
                  error={errors.subject_type?.message}
                  required
                />
              )}
            />
            <Controller
              name="subject_id"
              control={form.control}
              render={({ field }) => (
                <TextInput
                  label={t("contract.fields.subjectId")}
                  value={field.value ?? ""}
                  onChange={(event) => field.onChange(event.currentTarget.value.trim() || null)}
                  error={errors.subject_id?.message}
                />
              )}
            />
            <TextInput
              label={t("contract.fields.title")}
              {...form.register("title")}
              error={errors.title?.message}
              required
            />
            <Textarea
              label={t("contract.fields.partyInfo")}
              {...form.register("party_info")}
              error={errors.party_info?.message}
              autosize
              minRows={3}
            />
            <Controller
              name="status"
              control={form.control}
              render={({ field }) => (
                <Select
                  label={t("contract.fields.status")}
                  data={contractStatusOptions}
                  value={field.value ?? null}
                  onChange={(value) => field.onChange(value ?? undefined)}
                  error={errors.status?.message}
                  clearable
                />
              )}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={closeModal}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={createMutation.isPending}>
                {t("common.save")}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
