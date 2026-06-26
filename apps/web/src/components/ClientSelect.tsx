import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient, listClients } from "../api/cases";
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
  const clientsQuery = useQuery({
    queryKey: clientQueryKey,
    queryFn: listClients
  });
  const createClientMutation = useMutation({
    mutationFn: createClient,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: clientQueryKey });
    }
  });
  const options = (clientsQuery.data?.clients ?? []).map((client) => ({
    value: client.id,
    label: displayName(client)
  }));

  return (
    <CreatableEntitySelect
      value={value}
      onChange={onChange}
      options={options}
      onCreate={async (name) => {
        const data = await createClientMutation.mutateAsync({ name });
        return data.client.id;
      }}
      loading={clientsQuery.isLoading || createClientMutation.isPending}
      {...(placeholder ? { placeholder } : {})}
    />
  );
}
