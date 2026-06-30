import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createPosition, listPositions } from "../api/hr";
import { CreatableEntitySelect } from "./CreatableEntitySelect";

type PositionSelectProps = {
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  placeholder?: string;
};

const positionQueryKey = ["hr", "positions"] as const;

function displayName(item: { name: string; name_en?: string | null }) {
  return item.name_en ? `${item.name} / ${item.name_en}` : item.name;
}

export function PositionSelect({ value, onChange, placeholder }: PositionSelectProps) {
  const queryClient = useQueryClient();
  const positionsQuery = useQuery({
    queryKey: positionQueryKey,
    queryFn: () => listPositions()
  });
  const createPositionMutation = useMutation({
    mutationFn: createPosition,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: positionQueryKey });
    }
  });
  const options = (positionsQuery.data?.positions ?? []).map((position) => ({
    value: position.id,
    label: displayName(position)
  }));

  return (
    <CreatableEntitySelect
      value={value}
      onChange={onChange}
      options={options}
      onCreate={async (name) => {
        const data = await createPositionMutation.mutateAsync({ name });
        return data.position.id;
      }}
      loading={positionsQuery.isLoading || createPositionMutation.isPending}
      {...(placeholder ? { placeholder } : {})}
    />
  );
}
