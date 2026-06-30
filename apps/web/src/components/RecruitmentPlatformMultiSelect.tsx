import {
  Combobox,
  Loader,
  Pill,
  PillsInput,
  Text,
  useCombobox
} from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { createRecruitmentPlatform, listRecruitmentPlatforms, recruitmentKeys } from "../api/recruitment";

type RecruitmentPlatformMultiSelectProps = {
  companyId: string | null;
  value: string[];
  onChange: (names: string[]) => void;
  label?: string;
};

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function RecruitmentPlatformMultiSelect({ companyId, value, onChange, label }: RecruitmentPlatformMultiSelectProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption()
  });
  const params = useMemo(() => ({ company_id: companyId, active: "1" }), [companyId]);
  const platformsQuery = useQuery({
    queryKey: recruitmentKeys.platforms(params),
    queryFn: () => listRecruitmentPlatforms(params),
    enabled: Boolean(companyId)
  });
  const options = useMemo(() => {
    const names = new Set((platformsQuery.data?.platforms ?? []).map((row) => row.name.trim()).filter(Boolean));
    value.map((name) => name.trim()).filter(Boolean).forEach((name) => names.add(name));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [platformsQuery.data?.platforms, value]);
  const selectedNames = useMemo(
    () => value.map((name) => name.trim()).filter(Boolean),
    [value]
  );
  const selectedNormalized = useMemo(
    () => new Set(selectedNames.map((name) => normalizeName(name))),
    [selectedNames]
  );
  const trimmedSearch = search.trim();
  const normalizedSearch = normalizeName(trimmedSearch);
  const filteredOptions = options.filter(
    (option) => !selectedNormalized.has(normalizeName(option)) && normalizeName(option).includes(normalizedSearch)
  );
  const hasExactOption = options.some((option) => normalizeName(option) === normalizedSearch);
  const canCreate = Boolean(trimmedSearch) && !hasExactOption;

  function addName(name: string) {
    const trimmedName = name.trim();
    if (!trimmedName || selectedNormalized.has(normalizeName(trimmedName))) {
      return;
    }
    onChange([...selectedNames, trimmedName]);
  }

  async function handleSubmit(optionValue: string) {
    if (optionValue.startsWith("$create:")) {
      const name = optionValue.slice("$create:".length).trim();
      if (!name) return;
      if (!companyId) {
        setCreateError("先选公司");
        return;
      }

      setCreating(true);
      setCreateError(null);
      try {
        await createRecruitmentPlatform({ company_id: companyId, name });
        await queryClient.invalidateQueries({ queryKey: recruitmentKeys.platforms() });
        addName(name);
        setSearch("");
        combobox.closeDropdown();
      } catch (error) {
        setCreateError(error instanceof Error ? error.message : "创建平台失败");
      } finally {
        setCreating(false);
      }
      return;
    }

    addName(optionValue);
    setSearch("");
    setCreateError(null);
    combobox.closeDropdown();
  }

  const pills = selectedNames.map((name) => (
    <Pill
      key={name}
      withRemoveButton
      onRemove={() => onChange(selectedNames.filter((selected) => normalizeName(selected) !== normalizeName(name)))}
    >
      {name}
    </Pill>
  ));

  return (
    <>
      <Combobox store={combobox} onOptionSubmit={(optionValue) => void handleSubmit(optionValue)} withinPortal={false}>
        <Combobox.DropdownTarget>
          <PillsInput label={label} rightSection={platformsQuery.isLoading || creating ? <Loader size={16} /> : <Combobox.Chevron />}>
            <Pill.Group>
              {pills}
              <Combobox.EventsTarget>
                <PillsInput.Field
                  value={search}
                  onChange={(event) => {
                    setSearch(event.currentTarget.value);
                    setCreateError(null);
                    combobox.openDropdown();
                    combobox.updateSelectedOptionIndex();
                  }}
                  onFocus={() => combobox.openDropdown()}
                  onBlur={() => combobox.closeDropdown()}
                  onKeyDown={(event) => {
                    if (event.key === "Backspace" && search.length === 0 && selectedNames.length > 0) {
                      event.preventDefault();
                      onChange(selectedNames.slice(0, -1));
                    }
                  }}
                />
              </Combobox.EventsTarget>
            </Pill.Group>
          </PillsInput>
        </Combobox.DropdownTarget>

        <Combobox.Dropdown>
          <Combobox.Options mah={240} style={{ overflowY: "auto" }}>
            {filteredOptions.map((option) => (
              <Combobox.Option value={option} key={option}>
                {option}
              </Combobox.Option>
            ))}

            {canCreate ? (
              <Combobox.Option value={`$create:${trimmedSearch}`} disabled={!companyId || creating}>
                + 新增 “{trimmedSearch}”
              </Combobox.Option>
            ) : null}

            {!filteredOptions.length && !canCreate ? <Combobox.Empty>无匹配项</Combobox.Empty> : null}
          </Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>
      {createError ? (
        <Text size="xs" c="red" mt={4}>
          {createError}
        </Text>
      ) : null}
    </>
  );
}
