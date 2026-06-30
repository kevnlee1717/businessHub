import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listClients } from "../api/cases";
import { ClientFormModal } from "./ClientFormModal";
import { CreatableEntitySelect } from "./CreatableEntitySelect";

type ClientSelectProps = {
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  placeholder?: string;
};

const clientQueryKey = ["business", "clients"] as const;

function displayName(item: { name: string; name_en?: string | null }) {
  return item.name_en ? `${item.name} / ${item.name_en}` : item.name;
}

export function ClientSelect({ value, onChange, placeholder }: ClientSelectProps) {
  const queryClient = useQueryClient();
  const [createName, setCreateName] = useState<string | null>(null);
  const clientsQuery = useQuery({
    queryKey: clientQueryKey,
    queryFn: () => listClients()
  });
  const options = (clientsQuery.data?.clients ?? []).map((client) => ({
    value: client.id,
    label: displayName(client)
  }));

  return (
    <>
      <CreatableEntitySelect
        value={value}
        onChange={onChange}
        options={options}
        onRequestCreate={setCreateName}
        loading={clientsQuery.isLoading}
        {...(placeholder ? { placeholder } : {})}
      />
      <ClientFormModal
        opened={createName !== null}
        onClose={() => setCreateName(null)}
        onSaved={async (client) => {
          await queryClient.invalidateQueries({ queryKey: clientQueryKey });
          onChange(client.id);
          setCreateName(null);
        }}
        {...(createName ? { initialName: createName } : {})}
      />
    </>
  );
}
