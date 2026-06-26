import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createStudent, listStudents } from "../api/education";
import { CreatableEntitySelect } from "./CreatableEntitySelect";

type StudentSelectProps = {
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  placeholder?: string;
};

const studentsQueryKey = ["education", "students"] as const;

function displayName(item: { name: string; name_en?: string | null }) {
  return item.name_en ? `${item.name} / ${item.name_en}` : item.name;
}

export function StudentSelect({ value, onChange, placeholder }: StudentSelectProps) {
  const queryClient = useQueryClient();
  const studentsQuery = useQuery({
    queryKey: studentsQueryKey,
    queryFn: listStudents
  });
  const createStudentMutation = useMutation({
    mutationFn: createStudent,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: studentsQueryKey });
    }
  });
  const options = (studentsQuery.data?.students ?? []).map((student) => ({
    value: student.id,
    label: displayName(student)
  }));

  return (
    <CreatableEntitySelect
      value={value}
      onChange={onChange}
      options={options}
      onCreate={async (name) => {
        const data = await createStudentMutation.mutateAsync({ name });
        return data.student.id;
      }}
      loading={studentsQuery.isLoading || createStudentMutation.isPending}
      {...(placeholder ? { placeholder } : {})}
    />
  );
}
