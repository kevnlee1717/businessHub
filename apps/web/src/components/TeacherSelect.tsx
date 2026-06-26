import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listEmployees } from "../api/hr";
import { CreatableEntitySelect } from "./CreatableEntitySelect";
import { EmployeeFormModal } from "./EmployeeFormModal";

type TeacherSelectProps = {
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  placeholder?: string;
};

const employeesQueryKey = ["hr", "employees"] as const;

function displayName(item: { name: string; name_en?: string | null }) {
  return item.name_en ? `${item.name} / ${item.name_en}` : item.name;
}

export function TeacherSelect({ value, onChange, placeholder }: TeacherSelectProps) {
  const queryClient = useQueryClient();
  const [createName, setCreateName] = useState<string | null>(null);
  const employeesQuery = useQuery({
    queryKey: employeesQueryKey,
    queryFn: listEmployees
  });
  const options = (employeesQuery.data?.employees ?? []).map((employee) => ({
    value: employee.id,
    label: displayName(employee)
  }));

  return (
    <>
      <CreatableEntitySelect
        value={value}
        onChange={onChange}
        options={options}
        onRequestCreate={setCreateName}
        loading={employeesQuery.isLoading}
        {...(placeholder ? { placeholder } : {})}
      />
      <EmployeeFormModal
        opened={createName !== null}
        onClose={() => setCreateName(null)}
        defaultRole="teacher"
        onSaved={async (employee) => {
          await queryClient.invalidateQueries({ queryKey: employeesQueryKey });
          onChange(employee.id);
          setCreateName(null);
        }}
        {...(createName ? { initialName: createName } : {})}
      />
    </>
  );
}
