import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Button, Group, Modal, Stack, Textarea, TextInput } from "@mantine/core";
import {
  clientCreateSchema,
  clientUpdateSchema,
  type ClientCreateInput,
  type ClientUpdateInput
} from "@bh/shared";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { createClient, updateClient, type Client } from "../api/cases";

type ClientFormValues = {
  name?: string | undefined;
  name_en?: string | undefined;
  nationality?: string | null | undefined;
  phone?: string | undefined;
  email?: string | undefined;
  note?: string | null | undefined;
};

type ClientFormModalProps = {
  opened: boolean;
  onClose: () => void;
  initialValues?: Client | null;
  initialName?: string;
  onSaved: (client: Client) => void | Promise<void>;
};

const emptyToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

const emptyToNull = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  return value;
};

function getDefaultValues(client?: Client | null, initialName?: string): ClientFormValues {
  return {
    name: client?.name ?? initialName ?? "",
    name_en: client?.name_en ?? undefined,
    nationality: client?.nationality ?? undefined,
    phone: client?.phone ?? undefined,
    email: client?.email ?? undefined,
    note: client?.note ?? null
  };
}

export function ClientFormModal({
  opened,
  onClose,
  initialValues,
  initialName,
  onSaved
}: ClientFormModalProps) {
  const { t } = useTranslation();
  const [formError, setFormError] = useState<string | null>(null);
  const isEditing = Boolean(initialValues?.id);

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(isEditing ? clientUpdateSchema : clientCreateSchema) as Resolver<ClientFormValues>,
    defaultValues: getDefaultValues(initialValues, initialName)
  });

  const createMutation = useMutation({
    mutationFn: createClient
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: ClientUpdateInput }) => updateClient(id, body)
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
        : await createMutation.mutateAsync(values as ClientCreateInput);
      await onSaved(data.client);
      onClose();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  const errors = form.formState.errors;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <Modal opened={opened} onClose={onClose} title={isEditing ? t("client.edit") : t("client.add")} size="lg">
      <form onSubmit={onSubmit}>
        <Stack gap="md">
          {formError ? (
            <Alert color="red" variant="light">
              {formError}
            </Alert>
          ) : null}
          <Group grow align="flex-start">
            <TextInput label={t("client.fields.name")} error={errors.name?.message} {...form.register("name")} />
            <TextInput
              label={t("client.fields.nameEn")}
              description={t("client.nameEnHint")}
              error={errors.name_en?.message}
              {...form.register("name_en", { setValueAs: emptyToUndefined })}
            />
          </Group>
          <Group grow align="flex-start">
            <TextInput
              label={t("client.fields.nationality")}
              placeholder={t("client.nationalityPlaceholder")}
              error={errors.nationality?.message}
              {...form.register("nationality", { setValueAs: emptyToUndefined })}
            />
            <TextInput
              label={t("client.fields.phone")}
              error={errors.phone?.message}
              {...form.register("phone", { setValueAs: emptyToUndefined })}
            />
            <TextInput
              label={t("client.fields.email")}
              error={errors.email?.message}
              {...form.register("email", { setValueAs: emptyToUndefined })}
            />
          </Group>
          <Textarea
            label={t("client.fields.note")}
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
