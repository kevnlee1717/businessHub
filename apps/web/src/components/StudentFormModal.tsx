import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Button, Group, Modal, Stack, Textarea, TextInput } from "@mantine/core";
import {
  studentCreateSchema,
  studentUpdateSchema,
  type StudentCreateInput,
  type StudentUpdateInput
} from "@bh/shared";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { createStudent, updateStudent, type Student } from "../api/education";

type StudentFormValues = {
  name?: string | undefined;
  name_en?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
  note?: string | null | undefined;
};

type StudentFormModalProps = {
  opened: boolean;
  onClose: () => void;
  initialValues?: Student | null;
  initialName?: string;
  onSaved: (student: Student) => void | Promise<void>;
};

export const emptyToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

export const emptyToNull = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  return value;
};

function getDefaultValues(student?: Student | null, initialName?: string): StudentFormValues {
  return {
    name: student?.name ?? initialName ?? "",
    name_en: student?.name_en ?? undefined,
    phone: student?.phone ?? undefined,
    email: student?.email ?? undefined,
    note: student?.note ?? null
  };
}

export function StudentFormModal({
  opened,
  onClose,
  initialValues,
  initialName,
  onSaved
}: StudentFormModalProps) {
  const { t } = useTranslation();
  const [formError, setFormError] = useState<string | null>(null);
  const isEditing = Boolean(initialValues?.id);

  const form = useForm<StudentFormValues>({
    resolver: zodResolver(
      isEditing ? studentUpdateSchema : studentCreateSchema
    ) as Resolver<StudentFormValues>,
    defaultValues: getDefaultValues(initialValues, initialName)
  });

  const createMutation = useMutation({
    mutationFn: createStudent
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: StudentUpdateInput }) => updateStudent(id, body)
  });

  useEffect(() => {
    if (!opened) {
      return;
    }

    setFormError(null);
    form.reset(getDefaultValues(initialValues, initialName));
  }, [form, initialName, initialValues, opened]);

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      const data = initialValues?.id
        ? await updateMutation.mutateAsync({ id: initialValues.id, body: values })
        : await createMutation.mutateAsync(values as StudentCreateInput);
      await onSaved(data.student);
      onClose();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  const errors = form.formState.errors;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <Modal opened={opened} onClose={onClose} title={isEditing ? t("student.edit") : t("student.add")} size="lg">
      <form onSubmit={onSubmit}>
        <Stack gap="md">
          {formError ? (
            <Alert color="red" variant="light">
              {formError}
            </Alert>
          ) : null}
          <Group grow align="flex-start">
            <TextInput label={t("student.fields.name")} error={errors.name?.message} {...form.register("name")} />
            <TextInput
              label={t("student.fields.nameEn")}
              error={errors.name_en?.message}
              {...form.register("name_en", { setValueAs: emptyToUndefined })}
            />
          </Group>
          <Group grow align="flex-start">
            <TextInput
              label={t("student.fields.phone")}
              error={errors.phone?.message}
              {...form.register("phone", { setValueAs: emptyToUndefined })}
            />
            <TextInput
              label={t("student.fields.email")}
              error={errors.email?.message}
              {...form.register("email", { setValueAs: emptyToUndefined })}
            />
          </Group>
          <Textarea
            label={t("student.fields.note")}
            error={errors.note?.message}
            {...form.register("note", { setValueAs: emptyToNull })}
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" loading={isSaving}>
              {t("common.save")}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
