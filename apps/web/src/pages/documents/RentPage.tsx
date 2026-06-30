import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
  UnstyledButton
} from "@mantine/core";
import { currencies, rentDocTags } from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { MapPicker } from "../../components/MapPicker";
import { fileUrl } from "../../api/dms";
import {
  createRentLocation,
  deleteRentFile,
  deleteRentLocation,
  listRentFiles,
  listRentLocations,
  updateRentLocation,
  uploadRentFile,
  type RentLocation
} from "../../api/rent";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const PAYMENT = "__payment__";

function formatPeriod(period?: string | null) {
  if (!period) return null;
  const [year, month] = period.split("-");
  const idx = Number(month) - 1;
  return idx >= 0 && idx < 12 ? `${MONTHS[idx]} ${year}` : period;
}

function displayDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : "-";
}

function money(value?: string | null, currency?: string) {
  if (value === null || value === undefined || value === "") return "-";
  return `${currency ?? ""} ${value}`.trim();
}

type LocationForm = {
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  landlord_name: string;
  lease_start: string;
  lease_months: number | string;
  monthly_rent: number | string;
  deposit: number | string;
  currency: string;
  note: string;
};

function emptyForm(): LocationForm {
  return {
    name: "",
    address: "",
    lat: null,
    lng: null,
    landlord_name: "",
    lease_start: "",
    lease_months: "",
    monthly_rent: "",
    deposit: "",
    currency: "SGD",
    note: ""
  };
}

function formFromLocation(loc: RentLocation): LocationForm {
  return {
    name: loc.name,
    address: loc.address ?? "",
    lat: loc.lat != null ? Number(loc.lat) : null,
    lng: loc.lng != null ? Number(loc.lng) : null,
    landlord_name: loc.landlord_name ?? "",
    lease_start: loc.lease_start ?? "",
    lease_months: loc.lease_months ?? "",
    monthly_rent: loc.monthly_rent ?? "",
    deposit: loc.deposit ?? "",
    currency: loc.currency ?? "SGD",
    note: loc.note ?? ""
  };
}

export function RentPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteMode, setDeleteMode] = useState(false);

  const [locModalOpen, setLocModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<LocationForm>(emptyForm());
  const [locError, setLocError] = useState<string | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [upLocation, setUpLocation] = useState<string | null>(null);
  const [upKind, setUpKind] = useState<string>(PAYMENT);
  const [upPeriod, setUpPeriod] = useState("");
  const [upPaidAt, setUpPaidAt] = useState("");
  const [upFile, setUpFile] = useState<File | null>(null);
  const [upError, setUpError] = useState<string | null>(null);

  const locationsQuery = useQuery({ queryKey: ["rent", "locations"], queryFn: listRentLocations });
  const locations = useMemo(() => locationsQuery.data?.locations ?? [], [locationsQuery.data]);
  const selected = locations.find((l) => l.id === selectedId) ?? null;

  const filesQuery = useQuery({
    queryKey: ["rent", "files", selectedId],
    queryFn: () => listRentFiles(selectedId ?? ""),
    enabled: Boolean(selectedId)
  });
  const files = filesQuery.data?.files ?? [];

  const saveLocation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        address: form.address.trim() || null,
        lat: form.lat,
        lng: form.lng,
        landlord_name: form.landlord_name.trim() || null,
        lease_start: form.lease_start || null,
        lease_months: form.lease_months === "" ? null : Number(form.lease_months),
        monthly_rent: form.monthly_rent === "" ? null : Number(form.monthly_rent),
        deposit: form.deposit === "" ? null : Number(form.deposit),
        currency: form.currency as (typeof currencies)[number],
        note: form.note.trim() || null
      };
      return editingId ? updateRentLocation(editingId, payload) : createRentLocation(payload);
    },
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ["rent", "locations"] });
      if (!editingId) setSelectedId(res.location.id);
      closeLocModal();
    }
  });

  const removeLocation = useMutation({
    mutationFn: (id: string) => deleteRentLocation(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["rent", "locations"] });
      setSelectedId(null);
    }
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (!upFile || !upLocation) throw new Error(t("rent.upload.required"));
      const isPayment = upKind === PAYMENT;
      return uploadRentFile({
        file: upFile,
        location_id: upLocation,
        period: isPayment ? upPeriod || null : null,
        doc_tag: isPayment ? null : upKind,
        paid_at: upPaidAt ? new Date(upPaidAt).toISOString() : null
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["rent", "files", upLocation] }),
        queryClient.invalidateQueries({ queryKey: ["rent", "locations"] })
      ]);
      closeUpload();
    }
  });

  const removeFile = useMutation({
    mutationFn: (id: string) => deleteRentFile(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["rent", "files", selectedId] }),
        queryClient.invalidateQueries({ queryKey: ["rent", "locations"] })
      ]);
    }
  });

  function openCreateLocation() {
    setEditingId(null);
    setForm(emptyForm());
    setLocError(null);
    setLocModalOpen(true);
  }
  function openEditLocation(loc: RentLocation) {
    setEditingId(loc.id);
    setForm(formFromLocation(loc));
    setLocError(null);
    setLocModalOpen(true);
  }
  function closeLocModal() {
    setLocModalOpen(false);
    setEditingId(null);
    setLocError(null);
  }
  function openUpload() {
    setUpLocation(selectedId);
    setUpKind(PAYMENT);
    setUpPeriod("");
    setUpPaidAt("");
    setUpFile(null);
    setUpError(null);
    setUploadOpen(true);
  }
  function closeUpload() {
    setUploadOpen(false);
    setUpError(null);
    setUpFile(null);
  }

  async function submitLocation() {
    if (!form.name.trim()) {
      setLocError(t("rent.location.nameRequired"));
      return;
    }
    setLocError(null);
    try {
      await saveLocation.mutateAsync();
    } catch (error) {
      setLocError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  }
  async function submitUpload() {
    if (!upLocation) {
      setUpError(t("rent.upload.locationRequired"));
      return;
    }
    if (!upFile) {
      setUpError(t("rent.upload.fileRequired"));
      return;
    }
    setUpError(null);
    try {
      await upload.mutateAsync();
    } catch (error) {
      setUpError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  }

  const kindOptions = [
    { value: PAYMENT, label: t("rent.kind.payment") },
    ...rentDocTags.map((tag) => ({ value: tag, label: tag }))
  ];
  const currencyOptions = currencies.map((c) => ({ value: c, label: c }));

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>{t("documents.tabs.rent")}</Title>
        <Group gap="xs">
          <Button variant="default" onClick={openCreateLocation}>
            {t("rent.location.add")}
          </Button>
          <Button
            variant={deleteMode ? "filled" : "default"}
            color="red"
            onClick={() => setDeleteMode((v) => !v)}
          >
            {deleteMode ? t("documents.library.deleteDone") : t("common.delete")}
          </Button>
          <Button onClick={openUpload} disabled={locations.length === 0}>
            {t("documents.library.upload")}
          </Button>
        </Group>
      </Group>

      {locationsQuery.error ? (
        <Alert color="red" variant="light">
          {locationsQuery.error instanceof Error ? locationsQuery.error.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      <Group align="flex-start" gap="md" wrap="nowrap">
        <Paper withBorder radius="md" w={240} style={{ flexShrink: 0 }}>
          <Stack gap={0} py="xs">
            {locations.length === 0 ? (
              <Text c="dimmed" size="sm" px="md" py="sm">
                {t("rent.location.empty")}
              </Text>
            ) : (
              locations.map((loc) => (
                <UnstyledButton
                  key={loc.id}
                  onClick={() => setSelectedId(loc.id)}
                  px="md"
                  py="xs"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    backgroundColor: selectedId === loc.id ? "var(--mantine-color-blue-light)" : undefined,
                    fontWeight: selectedId === loc.id ? 600 : 400
                  }}
                >
                  <Text size="sm" truncate>
                    {loc.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {loc.file_count}
                  </Text>
                </UnstyledButton>
              ))
            )}
          </Stack>
        </Paper>

        <Stack gap="md" style={{ flex: 1, minWidth: 0 }}>
          {!selected ? (
            <Paper withBorder radius="md" p="lg">
              <Text c="dimmed">{t("rent.location.selectHint")}</Text>
            </Paper>
          ) : (
            <>
              <Paper withBorder radius="md" p="md">
                <Group justify="space-between" mb="sm">
                  <Title order={3}>{selected.name}</Title>
                  <Group gap="xs">
                    <Button size="xs" variant="light" onClick={() => openEditLocation(selected)}>
                      {t("common.edit")}
                    </Button>
                    <Button
                      size="xs"
                      color="red"
                      variant="light"
                      loading={removeLocation.isPending}
                      onClick={() => {
                        if (window.confirm(t("rent.location.deleteConfirm"))) {
                          removeLocation.mutate(selected.id);
                        }
                      }}
                    >
                      {t("common.delete")}
                    </Button>
                  </Group>
                </Group>
                <SimpleGrid cols={{ base: 2, md: 3 }} spacing="xs">
                  <Meta label={t("rent.fields.address")} value={selected.address} />
                  <Meta label={t("rent.fields.landlord")} value={selected.landlord_name} />
                  <Meta label={t("rent.fields.leaseStart")} value={selected.lease_start} />
                  <Meta
                    label={t("rent.fields.leaseMonths")}
                    value={selected.lease_months != null ? `${selected.lease_months} ${t("rent.months")}` : null}
                  />
                  <Meta label={t("rent.fields.monthlyRent")} value={money(selected.monthly_rent, selected.currency)} />
                  <Meta label={t("rent.fields.deposit")} value={money(selected.deposit, selected.currency)} />
                </SimpleGrid>
                {selected.note ? (
                  <Text size="sm" c="dimmed" mt="xs">
                    {selected.note}
                  </Text>
                ) : null}
              </Paper>

              <Paper withBorder radius="md">
                <ScrollArea>
                  <Table miw={640} verticalSpacing="sm" striped highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>{t("document.fields.filename")}</Table.Th>
                        <Table.Th>{t("rent.fields.periodOrTag")}</Table.Th>
                        <Table.Th>{t("rent.fields.paidAt")}</Table.Th>
                        <Table.Th>{t("common.actions")}</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {filesQuery.isLoading ? (
                        <Table.Tr>
                          <Table.Td colSpan={4}>
                            <Group justify="center" py="lg">
                              <Loader size="sm" />
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      ) : files.length === 0 ? (
                        <Table.Tr>
                          <Table.Td colSpan={4}>
                            <Text ta="center" c="dimmed" py="lg">
                              {t("rent.files.empty")}
                            </Text>
                          </Table.Td>
                        </Table.Tr>
                      ) : (
                        files.map((file) => (
                          <Table.Tr key={file.id}>
                            <Table.Td>{file.filename}</Table.Td>
                            <Table.Td>
                              {file.period ? (
                                <Text size="sm" fw={500}>
                                  {formatPeriod(file.period)}
                                </Text>
                              ) : file.doc_tag ? (
                                <Badge variant="light" color="gray">
                                  {file.doc_tag}
                                </Badge>
                              ) : (
                                "-"
                              )}
                            </Table.Td>
                            <Table.Td>{displayDate(file.paid_at)}</Table.Td>
                            <Table.Td>
                              <Group gap="xs">
                                <Button
                                  component="a"
                                  href={fileUrl(file.storage_path)}
                                  target="_blank"
                                  rel="noreferrer"
                                  size="xs"
                                  variant="light"
                                >
                                  {t("common.preview")}
                                </Button>
                                {deleteMode ? (
                                  <Button
                                    size="xs"
                                    color="red"
                                    variant="subtle"
                                    loading={removeFile.isPending}
                                    onClick={() => {
                                      if (window.confirm(t("rent.files.deleteConfirm"))) {
                                        removeFile.mutate(file.id);
                                      }
                                    }}
                                  >
                                    {t("common.delete")}
                                  </Button>
                                ) : null}
                              </Group>
                            </Table.Td>
                          </Table.Tr>
                        ))
                      )}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              </Paper>
            </>
          )}
        </Stack>
      </Group>

      {/* 新建/编辑地点 */}
      <Modal
        opened={locModalOpen}
        onClose={closeLocModal}
        title={editingId ? t("rent.location.edit") : t("rent.location.add")}
        size="lg"
      >
        <Stack gap="md">
          {locError ? (
            <Alert color="red" variant="light">
              {locError}
            </Alert>
          ) : null}
          <TextInput
            label={t("rent.fields.name")}
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.currentTarget.value }))}
          />
          <MapPicker
            lat={form.lat}
            lng={form.lng}
            onChange={(lat, lng) => setForm((f) => ({ ...f, lat, lng }))}
            onResolveAddress={(address) => setForm((f) => ({ ...f, address }))}
          />
          <TextInput
            label={t("rent.fields.address")}
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.currentTarget.value }))}
          />
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput
              label={t("rent.fields.landlord")}
              value={form.landlord_name}
              onChange={(e) => setForm((f) => ({ ...f, landlord_name: e.currentTarget.value }))}
            />
            <TextInput
              type="date"
              label={t("rent.fields.leaseStart")}
              value={form.lease_start}
              onChange={(e) => setForm((f) => ({ ...f, lease_start: e.currentTarget.value }))}
            />
            <NumberInput
              label={t("rent.fields.leaseMonths")}
              value={form.lease_months}
              min={0}
              onChange={(v) => setForm((f) => ({ ...f, lease_months: v }))}
            />
            <Select
              label={t("rent.fields.currency")}
              data={currencyOptions}
              value={form.currency}
              onChange={(v) => setForm((f) => ({ ...f, currency: v ?? "SGD" }))}
            />
            <NumberInput
              label={t("rent.fields.monthlyRent")}
              value={form.monthly_rent}
              min={0}
              decimalScale={2}
              onChange={(v) => setForm((f) => ({ ...f, monthly_rent: v }))}
            />
            <NumberInput
              label={t("rent.fields.deposit")}
              value={form.deposit}
              min={0}
              decimalScale={2}
              onChange={(v) => setForm((f) => ({ ...f, deposit: v }))}
            />
          </SimpleGrid>
          <Textarea
            label={t("rent.fields.note")}
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.currentTarget.value }))}
            autosize
            minRows={2}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeLocModal}>
              {t("common.cancel")}
            </Button>
            <Button onClick={submitLocation} loading={saveLocation.isPending}>
              {t("common.save")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* 上传文件 */}
      <Modal opened={uploadOpen} onClose={closeUpload} title={t("documents.library.upload")} size="md">
        <Stack gap="md">
          {upError ? (
            <Alert color="red" variant="light">
              {upError}
            </Alert>
          ) : null}
          <Select
            label={t("rent.fields.location")}
            required
            data={locations.map((l) => ({ value: l.id, label: l.name }))}
            value={upLocation}
            onChange={setUpLocation}
            searchable
          />
          <Select
            label={t("rent.fields.kind")}
            data={kindOptions}
            value={upKind}
            onChange={(v) => setUpKind(v ?? PAYMENT)}
          />
          {upKind === PAYMENT ? (
            <TextInput
              type="month"
              label={t("rent.fields.period")}
              value={upPeriod}
              onChange={(e) => setUpPeriod(e.currentTarget.value)}
            />
          ) : null}
          <TextInput
            type="date"
            label={t("rent.fields.paidAt")}
            value={upPaidAt}
            onChange={(e) => setUpPaidAt(e.currentTarget.value)}
          />
          <TextInput
            type="file"
            label={t("documents.library.file")}
            onChange={(e) => setUpFile(e.currentTarget.files?.[0] ?? null)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeUpload}>
              {t("common.cancel")}
            </Button>
            <Button onClick={submitUpload} loading={upload.isPending}>
              {t("common.save")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

function Meta({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <Stack gap={0}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="sm">{value || "-"}</Text>
    </Stack>
  );
}
