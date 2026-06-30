import { Input } from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { createRecruitmentPlatform, listRecruitmentPlatforms, recruitmentKeys } from "../api/recruitment";
import { CreatableEntitySelect } from "./CreatableEntitySelect";

type RecruitmentPlatformSelectProps = {
  companyId: string | null;
  value: string | null;
  onChange: (name: string | null) => void;
  label?: string;
};

export function RecruitmentPlatformSelect({ companyId, value, onChange, label }: RecruitmentPlatformSelectProps) {
  const queryClient = useQueryClient();
  const params = useMemo(() => ({ company_id: companyId, active: "1" }), [companyId]);
  const platformsQuery = useQuery({
    queryKey: recruitmentKeys.platforms(params),
    queryFn: () => listRecruitmentPlatforms(params),
    enabled: Boolean(companyId)
  });
  const options = useMemo(() => {
    const names = new Set((platformsQuery.data?.platforms ?? []).map((row) => row.name.trim()).filter(Boolean));
    if (value?.trim()) names.add(value.trim());
    return Array.from(names)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ value: name, label: name }));
  }, [platformsQuery.data?.platforms, value]);

  return (
    <Input.Wrapper label={label}>
      <CreatableEntitySelect
        value={value}
        onChange={onChange}
        options={options}
        loading={platformsQuery.isLoading}
        onCreate={async (name) => {
          if (!companyId) throw new Error("Please select a company first");
          const data = await createRecruitmentPlatform({ company_id: companyId, name });
          await queryClient.invalidateQueries({ queryKey: recruitmentKeys.platforms() });
          return data.platform.name;
        }}
      />
    </Input.Wrapper>
  );
}
