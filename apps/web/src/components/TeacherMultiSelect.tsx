import { Alert, Button, Group, Modal, MultiSelect, Stack, TextInput } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
      setError(createError instanceof Error ? createError.message : t("teachers.createFailed"));
    }
  }

  return (
    <>
      <Group align="flex-end" gap="xs" wrap="nowrap">
        <MultiSelect
          data={options}
          value={value}
          onChange={onChange}
          placeholder={placeholder ?? t("teachers.select")}
          searchable
          clearable
          disabled={teachersQuery.isLoading}
          style={{ flex: 1 }}
        />
        <Button variant="light" onClick={() => setModalOpened(true)}>
          {t("teachers.addInline")}
        </Button>
      </Group>

      <Modal opened={modalOpened} onClose={closeModal} title={t("teachers.add")} size="md">
        <Stack gap="md">
          {error ? (
            <Alert color="red" variant="light">
              {error}
            </Alert>
          ) : null}
          <TextInput
            label={t("teachers.fields.name")}
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.currentTarget.value }))}
            withAsterisk
          />
          <TextInput
            label={t("teachers.fields.nameEn")}
            value={form.name_en}
            onChange={(event) => setForm((current) => ({ ...current, name_en: event.currentTarget.value }))}
          />
          <TextInput
            label={t("teachers.fields.phone")}
            value={form.phone}
            onChange={(event) => setForm((current) => ({ ...current, phone: event.currentTarget.value }))}
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeModal}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleCreate} loading={createMutation.isPending} disabled={!form.name.trim()}>
              {t("common.save")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
