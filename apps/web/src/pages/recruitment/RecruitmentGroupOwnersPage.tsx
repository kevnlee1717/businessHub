import { Box, Button, Group, Modal, NumberInput, Select, SimpleGrid, Stack, Table, TextInput, Textarea } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { listCompanies } from "../../api/hr";
import {
  createRecruitmentGroupOwner,
  deleteRecruitmentGroupOwner,
  listRecruitmentGroupOwners,
  recruitmentKeys,
  updateRecruitmentGroupOwner,
  type RecruitmentGroupOwner
} from "../../api/recruitment";

function today() {
  return new Date().toISOString().slice(0, 10);
}

type GroupOwnerForm = {
  company_id: string;
  platform: string;
  group_name: string;
  owner_name: string;
  owner_contact: string;
  group_url: string;
  member_count: number | null;
  found_on: string;
  notes: string;
};

const defaultForm: GroupOwnerForm = {
  company_id: "",
  platform: "",
  group_name: "",
  owner_name: "",
  owner_contact: "",
  group_url: "",
  member_count: null,
  found_on: today(),
  notes: ""
};

export function RecruitmentGroupOwnersPage() {
  const { can, user } = useAuth();
  const canManage = can("recruitment.manage");
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ companyId: "", platform: "", from: "", to: "" });
  const [draftFilters, setDraftFilters] = useState(filters);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RecruitmentGroupOwner | null>(null);
  const [form, setForm] = useState<GroupOwnerForm>(defaultForm);

  const companiesQuery = useQuery({ queryKey: ["companies", "recruitment-group-owners"], queryFn: () => listCompanies() });
  const listQuery = useQuery({ queryKey: recruitmentKeys.groupOwners(filters), queryFn: () => listRecruitmentGroupOwners(filters) });
  const companyOptions = useMemo(() => (companiesQuery.data?.companies ?? []).map((item) => ({ value: item.id, label: item.name })), [companiesQuery.data]);
  const platformOptions = useMemo(() => {
    const values = [...new Set((listQuery.data?.group_owners ?? []).map((item) => item.platform).filter(Boolean))];
    return values.map((value) => ({ value, label: value }));
  }, [listQuery.data]);

  useEffect(() => {
    const firstCompanyId = companyOptions[0]?.value;
    if (!form.company_id && firstCompanyId) setForm((value) => ({ ...value, company_id: firstCompanyId }));
  }, [companyOptions, form.company_id]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        company_id: form.company_id,
        platform: form.platform.trim(),
        group_name: form.group_name.trim(),
        owner_name: form.owner_name.trim() || null,
        owner_contact: form.owner_contact.trim() || null,
        group_url: form.group_url.trim() || null,
        member_count: form.member_count,
        found_on: form.found_on,
        notes: form.notes.trim() || null
      };
      return editing ? updateRecruitmentGroupOwner(editing.id, body) : createRecruitmentGroupOwner(body);
    },
    onSuccess: async () => {
      setModalOpen(false);
      await queryClient.invalidateQueries({ queryKey: recruitmentKeys.groupOwners(filters) });
    }
  });
  const deleteMutation = useMutation({
    mutationFn: deleteRecruitmentGroupOwner,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: recruitmentKeys.groupOwners(filters) });
    }
  });

  function openCreate() {
    setEditing(null);
    setForm({ ...defaultForm, company_id: companyOptions[0]?.value ?? "" });
    setModalOpen(true);
  }

  function openEdit(row: RecruitmentGroupOwner) {
    setEditing(row);
    setForm({
      company_id: row.company_id,
      platform: row.platform,
      group_name: row.group_name,
      owner_name: row.owner_name ?? "",
      owner_contact: row.owner_contact ?? "",
      group_url: row.group_url ?? "",
      member_count: row.member_count ?? null,
      found_on: row.found_on,
      notes: row.notes ?? ""
    });
    setModalOpen(true);
  }

  return (
    <Box p={20}>
      <Stack gap="md">
        <Group align="flex-end" gap="sm" wrap="wrap">
          <Select label="公司" w={200} data={companyOptions} value={draftFilters.companyId || null} onChange={(value) => setDraftFilters((old) => ({ ...old, companyId: value ?? "" }))} clearable searchable />
          <Select label="平台" w={160} data={platformOptions} value={draftFilters.platform || null} onChange={(value) => setDraftFilters((old) => ({ ...old, platform: value ?? "" }))} clearable searchable />
          <TextInput label="开始日期" type="date" w={150} value={draftFilters.from} onChange={(event) => setDraftFilters((old) => ({ ...old, from: event.currentTarget.value }))} />
          <TextInput label="结束日期" type="date" w={150} value={draftFilters.to} onChange={(event) => setDraftFilters((old) => ({ ...old, to: event.currentTarget.value }))} />
          <Button onClick={() => setFilters(draftFilters)}>搜索</Button>
          <Button onClick={openCreate}>新建</Button>
        </Group>
        <Table withTableBorder withColumnBorders highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>平台</Table.Th><Table.Th>群名</Table.Th><Table.Th>群主</Table.Th><Table.Th>联系方式</Table.Th><Table.Th>人数</Table.Th><Table.Th>登记人</Table.Th><Table.Th>日期</Table.Th><Table.Th>操作</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(listQuery.data?.group_owners ?? []).map((row) => {
              const canEdit = canManage || row.found_by === user?.id;
              return (
                <Table.Tr key={row.id}>
                  <Table.Td>{row.platform}</Table.Td><Table.Td>{row.group_name}</Table.Td><Table.Td>{row.owner_name || "-"}</Table.Td><Table.Td>{row.owner_contact || "-"}</Table.Td><Table.Td>{row.member_count ?? "-"}</Table.Td><Table.Td>{row.found_by_name || "-"}</Table.Td><Table.Td>{row.found_on}</Table.Td><Table.Td><Group gap="xs"><Button size="xs" variant="subtle" disabled={!canEdit} onClick={() => openEdit(row)}>编辑</Button><Button size="xs" color="red" variant="subtle" disabled={!canEdit} onClick={() => deleteMutation.mutate(row.id)}>删除</Button></Group></Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Stack>

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "编辑群主" : "新建群主"} size="lg">
        <Stack>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Select label="公司" data={companyOptions} value={form.company_id || null} onChange={(value) => setForm((old) => ({ ...old, company_id: value ?? "" }))} searchable required />
            <TextInput label="平台" value={form.platform} onChange={(event) => setForm((old) => ({ ...old, platform: event.currentTarget.value }))} required />
            <TextInput label="群名" value={form.group_name} onChange={(event) => setForm((old) => ({ ...old, group_name: event.currentTarget.value }))} required />
            <TextInput label="群主" value={form.owner_name} onChange={(event) => setForm((old) => ({ ...old, owner_name: event.currentTarget.value }))} />
            <TextInput label="联系方式" value={form.owner_contact} onChange={(event) => setForm((old) => ({ ...old, owner_contact: event.currentTarget.value }))} />
            <NumberInput label="人数" min={0} value={form.member_count ?? ""} onChange={(value) => setForm((old) => ({ ...old, member_count: value === "" ? null : Number(value) }))} />
            <TextInput label="登记日期" type="date" value={form.found_on} onChange={(event) => setForm((old) => ({ ...old, found_on: event.currentTarget.value }))} required />
            <TextInput label="群链接" value={form.group_url} onChange={(event) => setForm((old) => ({ ...old, group_url: event.currentTarget.value }))} />
          </SimpleGrid>
          <Textarea label="备注" value={form.notes} onChange={(event) => setForm((old) => ({ ...old, notes: event.currentTarget.value }))} />
          <Group justify="flex-end"><Button variant="default" onClick={() => setModalOpen(false)}>取消</Button><Button loading={saveMutation.isPending} disabled={!form.company_id || !form.platform.trim() || !form.group_name.trim()} onClick={() => saveMutation.mutate()}>保存</Button></Group>
        </Stack>
      </Modal>
    </Box>
  );
}
