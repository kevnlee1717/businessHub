import { Button, Card, Group, Select, Stack, TextInput } from "@mantine/core";
import { franchiseOrgTypes, type FranchiseOrgType } from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { createFranchiseOrg, franchiseKeys, listFranchiseOrgs } from "../../api/franchise";

const createPrefix = "__create_org__:";

type OrgSelectProps = {
  label: string;
  value?: string | null | undefined;
  onChange: (value: string | null) => void;
};

function enumOptions(values: readonly string[], ns: string, t: (key: string) => string) {
  return values.map((value) => ({ value, label: t(`franchise.${ns}.${value}`) }));
}

export function OrgSelect({ label, value, onChange }: OrgSelectProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftType, setDraftType] = useState<FranchiseOrgType>("other");
  const [creating, setCreating] = useState(false);
  const query = useQuery({
    queryKey: franchiseKeys.orgs({ q: search }),
    queryFn: () => listFranchiseOrgs(search ? { q: search } : {})
  });
  const orgs = query.data?.orgs ?? [];
  const trimmed = search.trim();
  const exactExists = orgs.some((org) => org.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase());
  const data = useMemo(() => {
    const options = orgs.map((org) => ({ value: org.id, label: org.name }));
    if (trimmed && !exactExists) options.push({ value: `${createPrefix}${trimmed}`, label: t("franchise.actions.createOrgNamed", { name: trimmed }) });
    return options;
  }, [exactExists, orgs, t, trimmed]);
  const mutation = useMutation({
    mutationFn: () => createFranchiseOrg({ name: draftName.trim(), type: draftType }),
    onSuccess: async ({ org }) => {
      await qc.invalidateQueries({ queryKey: franchiseKeys.orgs() });
      await qc.invalidateQueries({ queryKey: franchiseKeys.all });
      onChange(org.id);
      setSearch(org.name);
      setDraftName("");
      setDraftType("other");
      setCreating(false);
    }
  });

  return (
    <Stack gap={6}>
      <Select
        label={label}
        data={data}
        value={value ?? null}
        onChange={(next) => {
          if (next?.startsWith(createPrefix)) {
            setDraftName(next.slice(createPrefix.length));
            setDraftType("other");
            setCreating(true);
            return;
          }
          onChange(next);
        }}
        searchValue={search}
        onSearchChange={setSearch}
        clearable
        searchable
      />
      {creating ? (
        <Card withBorder radius="sm" p="sm">
          <Stack gap="xs">
            <TextInput label={t("franchise.fields.name")} value={draftName} onChange={(event) => setDraftName(event.currentTarget.value)} />
            <Select
              label={t("franchise.fields.orgType")}
              data={enumOptions(franchiseOrgTypes, "orgType", t)}
              value={draftType}
              onChange={(next) => setDraftType((next as FranchiseOrgType | null) ?? "other")}
              allowDeselect={false}
            />
            <Group justify="flex-end">
              <Button variant="subtle" size="xs" onClick={() => setCreating(false)}>
                {t("common.cancel")}
              </Button>
              <Button size="xs" loading={mutation.isPending} disabled={!draftName.trim()} onClick={() => mutation.mutate()}>
                {t("common.save")}
              </Button>
            </Group>
          </Stack>
        </Card>
      ) : null}
    </Stack>
  );
}
