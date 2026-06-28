import { Button, Group, Modal, SegmentedControl, Select, Stack, Table, Text, TextInput } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { franchiseKeys, listFranchiseContacts, listFranchiseOrgs, type FranchiseContact } from "../../api/franchise";

type ContactPickerProps = {
  label: string;
  value?: string | null | undefined;
  onChange: (value: string | null) => void;
  excludeId?: string | undefined;
};

function contactText(contact?: FranchiseContact | null) {
  if (!contact) return "";
  return `${contact.name}${contact.org?.name ? ` · ${contact.org.name}` : ""}`;
}

export function ContactPicker({ label, value, onChange, excludeId }: ContactPickerProps) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const [mode, setMode] = useState<"search" | "org">("search");
  const [q, setQ] = useState("");
  const [orgId, setOrgId] = useState<string | null>(null);
  const selectedQuery = useQuery({
    queryKey: franchiseKeys.contacts("picker-selected"),
    queryFn: () => listFranchiseContacts()
  });
  const orgsQuery = useQuery({ queryKey: franchiseKeys.orgs("picker"), queryFn: () => listFranchiseOrgs(), enabled: opened });
  const contactsQuery = useQuery({
    queryKey: franchiseKeys.contacts({ picker: mode, q, org_id: orgId }),
    queryFn: () => listFranchiseContacts(mode === "search" ? { q } : { org_id: orgId }),
    enabled: opened && (mode === "search" || Boolean(orgId))
  });
  const selected = selectedQuery.data?.contacts.find((contact) => contact.id === value);
  const contacts = useMemo(
    () => (contactsQuery.data?.contacts ?? []).filter((contact) => contact.id !== excludeId),
    [contactsQuery.data?.contacts, excludeId]
  );
  const orgOptions = (orgsQuery.data?.orgs ?? []).map((org) => ({ value: org.id, label: org.name }));

  return (
    <Stack gap={6}>
      <Text size="sm" fw={500}>
        {label}
      </Text>
      <Group gap="xs">
        <Button variant="default" onClick={() => setOpened(true)}>
          {selected ? contactText(selected) : t("franchise.actions.selectContact")}
        </Button>
        {value ? (
          <Button variant="subtle" color="red" onClick={() => onChange(null)}>
            {t("franchise.actions.clearContact")}
          </Button>
        ) : null}
      </Group>
      <Modal opened={opened} onClose={() => setOpened(false)} title={label} size="lg">
        <Stack gap="md">
          <SegmentedControl
            value={mode}
            onChange={(next) => setMode(next as "search" | "org")}
            data={[
              { value: "search", label: t("franchise.contactPicker.searchMode") },
              { value: "org", label: t("franchise.contactPicker.orgMode") }
            ]}
          />
          {mode === "search" ? (
            <TextInput placeholder={t("franchise.filters.search")} value={q} onChange={(event) => setQ(event.currentTarget.value)} />
          ) : (
            <Select
              placeholder={t("franchise.fields.org")}
              data={orgOptions}
              value={orgId}
              onChange={setOrgId}
              searchable
              clearable
            />
          )}
          <Table withTableBorder withColumnBorders highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("franchise.fields.name")}</Table.Th>
                <Table.Th>{t("franchise.fields.org")}</Table.Th>
                <Table.Th>{t("franchise.fields.phone")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {contacts.length ? (
                contacts.map((contact) => (
                  <Table.Tr
                    key={contact.id}
                    onClick={() => {
                      onChange(contact.id);
                      setOpened(false);
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <Table.Td>{contact.name}</Table.Td>
                    <Table.Td>{contact.org?.name ?? "-"}</Table.Td>
                    <Table.Td>{contact.phone ?? "-"}</Table.Td>
                  </Table.Tr>
                ))
              ) : (
                <Table.Tr>
                  <Table.Td colSpan={3}>
                    <Text ta="center" c="dimmed" py="md">
                      {t("franchise.empty")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Stack>
      </Modal>
    </Stack>
  );
}
