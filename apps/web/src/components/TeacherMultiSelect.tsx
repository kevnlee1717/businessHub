import { Alert, Button, Group, Modal, MultiSelect, Stack, TextInput } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createTeacher, listTeachers } from "../api/teachers";

type TeacherMultiSelectProps = {
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
};

type CreateTeacherForm = {
  name: string;
  name_en: string;
  phone: string;
};

export const teachersQueryKey = ["education", "teachers"] as const;
const activeTeachersQueryKey = [...teachersQueryKey, "active"] as const;

function displayName(item: { name: string; name_en?: string | null }) {
  return item.name_en ? `${item.name} / ${item.name_en}` : item.name;
}

function emptyToUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function TeacherMultiSelect({ value, onChange, placeholder }: TeacherMultiSelectProps) {
  const queryClient = useQueryClient();
  const [modalOpened, setModalOpened] = useState(false);
  const [form, setForm] = useState<CreateTeacherForm>({ name: "", name_en: "", phone: "" });
  const [error, setError] = useState<string | null>(null);

  const teachersQuery = useQuery({
    queryKey: activeTeachersQueryKey,
    queryFn: () => listTeachers(true)
  });

  const createMutation = useMutation({
    mutationFn: createTeacher,
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: teachersQueryKey });
      onChange(Array.from(new Set([...value, data.teacher.id])));
      closeModal();
    }
  });

  const options = (teachersQuery.data?.teachers ?? []).map((teacher) => ({
    value: teacher.id,
    label: displayName(teacher)
  }));

  function closeModal() {
    setModalOpened(false);
    setForm({ name: "", name_en: "", phone: "" });
    setError(null);
  }

  async function handleCreate() {
    setError(null);
    try {
      await createMutation.mutateAsync({
        name: form.name,
        name_en: emptyToUndefined(form.name_en),
        phone: emptyToUndefined(form.phone),
        active: true
      });
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建老师失败");
    }
  }

  return (
    <>
      <Group align="flex-end" gap="xs" wrap="nowrap">
        <MultiSelect
          data={options}
          value={value}
          onChange={onChange}
          placeholder={placeholder ?? "选择老师"}
          searchable
          clearable
          disabled={teachersQuery.isLoading}
          style={{ flex: 1 }}
        />
        <Button variant="light" onClick={() => setModalOpened(true)}>
          + 新增老师
        </Button>
      </Group>

      <Modal opened={modalOpened} onClose={closeModal} title="新增老师" size="md">
        <Stack gap="md">
          {error ? (
            <Alert color="red" variant="light">
              {error}
            </Alert>
          ) : null}
          <TextInput
            label="姓名"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.currentTarget.value }))}
            withAsterisk
          />
          <TextInput
            label="英文名"
            value={form.name_en}
            onChange={(event) => setForm((current) => ({ ...current, name_en: event.currentTarget.value }))}
          />
          <TextInput
            label="电话"
            value={form.phone}
            onChange={(event) => setForm((current) => ({ ...current, phone: event.currentTarget.value }))}
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeModal}>
              取消
            </Button>
            <Button onClick={handleCreate} loading={createMutation.isPending} disabled={!form.name.trim()}>
              保存
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
