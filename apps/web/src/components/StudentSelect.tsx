import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listStudents } from "../api/education";
import { CreatableEntitySelect } from "./CreatableEntitySelect";
import { StudentFormModal } from "./StudentFormModal";

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
  const [createName, setCreateName] = useState<string | null>(null);
  const studentsQuery = useQuery({
    queryKey: studentsQueryKey,
    queryFn: () => listStudents()
  });
  const options = (studentsQuery.data?.students ?? []).map((student) => ({
    value: student.id,
    label: displayName(student)
  }));

  return (
    <>
      <CreatableEntitySelect
        value={value}
        onChange={onChange}
        options={options}
        onRequestCreate={setCreateName}
        loading={studentsQuery.isLoading}
        {...(placeholder ? { placeholder } : {})}
      />
      <StudentFormModal
        opened={createName !== null}
        onClose={() => setCreateName(null)}
        onSaved={async (student) => {
          await queryClient.invalidateQueries({ queryKey: studentsQueryKey });
          onChange(student.id);
          setCreateName(null);
        }}
        {...(createName ? { initialName: createName } : {})}
      />
    </>
  );
}
