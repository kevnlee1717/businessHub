import {
  Alert,
  Box,
  Button,
  Card,
  Center,
  Checkbox,
  Container,
  Group,
  Image,
  Loader,
  Modal,
  Radio,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { franchiseInterestLevels, type FranchiseInterestLevel, type FranchiseService } from "@bh/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  createKioskVisit,
  kioskKeys,
  listKioskEmployees,
  listKioskProperties,
  listKioskSlides,
  type KioskSlide,
} from "../../api/kiosk";
import {
  buildVisibleSurveyDetails,
  type PropertySurveyDetails,
} from "../franchise/TrackingShared";
import {
  propertySurveyServices,
  visiblePropertySurveySections,
  type PropertySurveyField,
} from "../franchise/propertySurvey";
import { KaiderLetterhead } from "./KaiderLetterhead";
import { PdfSwipeViewer } from "./PdfSwipeViewer";

const interestLabels: Record<FranchiseInterestLevel, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const propertyTypeLabels: Record<string, string> = {
  mall: "商场",
  office: "办公楼",
  condo: "公寓",
  hotel: "酒店",
  industrial: "工业",
  airport: "机场",
  train_mrt: "车站 / 地铁",
  food_court: "食阁",
  hospital_school: "医院 / 学校",
  other: "其他",
};

function todayDateInput() {
  return new Date().toISOString().slice(0, 10);
}

function dateToApiDateTime(value: string) {
  return new Date(`${value}T00:00:00`).toISOString();
}

function emptyToNull(value: string) {
  const next = value.trim();
  return next ? next : null;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "提交失败，请稍后重试";
}

function fieldVisible(field: PropertySurveyField, sectionValues: Record<string, string | string[]>) {
  if (!field.showWhen) return true;
  return sectionValues[field.showWhen.field] === field.showWhen.value;
}

function setSurveyField(
  setDetails: React.Dispatch<React.SetStateAction<PropertySurveyDetails>>,
  sectionKey: string,
  fieldKey: string,
  value: string | string[] | null
) {
  setDetails((current) => {
    const section = { ...(current[sectionKey] ?? {}) };
    if (value === null || (Array.isArray(value) && value.length === 0)) {
      delete section[fieldKey];
    } else {
      section[fieldKey] = value;
    }
    return { ...current, [sectionKey]: section };
  });
}

export function IpadSurveyPage() {
  const [surveyOpened, { open: openSurvey, close: closeSurvey }] = useDisclosure(false);
  const [previewSlide, setPreviewSlide] = useState<KioskSlide | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [interestedServices, setInterestedServices] = useState<FranchiseService[]>([]);
  const [details, setDetails] = useState<PropertySurveyDetails>({});
  const [visitedAt, setVisitedAt] = useState(todayDateInput());
  const [interestLevel, setInterestLevel] = useState<FranchiseInterestLevel>("medium");
  const [note, setNote] = useState("");

  const slidesQuery = useQuery({ queryKey: kioskKeys.slides, queryFn: listKioskSlides });
  const propertiesQuery = useQuery({ queryKey: kioskKeys.properties, queryFn: listKioskProperties, enabled: surveyOpened });
  const employeesQuery = useQuery({ queryKey: kioskKeys.employees, queryFn: listKioskEmployees, enabled: surveyOpened });

  // 深链:URL 带 ?survey=1 或 #survey 时直接打开问卷(可用于二维码直达录入表单)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("survey") === "1" || window.location.hash === "#survey") {
      openSurvey();
    }
  }, [openSurvey]);

  const slides = slidesQuery.data?.slides ?? [];
  const properties = propertiesQuery.data?.properties ?? [];
  const employees = employeesQuery.data?.employees ?? [];
  const selectedProperty = useMemo(
    () => properties.find((property) => property.id === propertyId) ?? null,
    [properties, propertyId]
  );
  const canSubmit = Boolean(propertyId && employeeId);

  function resetForm() {
    setPropertyId(null);
    setEmployeeId(null);
    setInterestedServices([]);
    setDetails({});
    setVisitedAt(todayDateInput());
    setInterestLevel("medium");
    setNote("");
  }

  const createVisitMutation = useMutation({
    mutationFn: async () => {
      if (!propertyId) throw new Error("请选择物业");
      if (!employeeId) throw new Error("请选择业务员");
      return createKioskVisit({
        property_id: propertyId,
        by_employee_id: employeeId,
        visited_at: dateToApiDateTime(visitedAt),
        interest_level: interestLevel,
        note: emptyToNull(note),
        services_pitched: interestedServices,
        survey: {
          interested_services: interestedServices,
          details: buildVisibleSurveyDetails(details, interestedServices),
        },
      });
    },
    onSuccess: () => {
      resetForm();
      setSubmitted(true);
    },
  });

  function openQuestionnaire() {
    createVisitMutation.reset();
    setSubmitted(false);
    openSurvey();
  }

  function finishSuccess() {
    setSubmitted(false);
    closeSurvey();
  }

  return (
    <Box mih="100vh" bg="#f3f4f2" pb={120} c="#333">
      <Container size={1080} px={{ base: "md", sm: "xl" }} py="lg">
        <Box bg="white" p={{ base: "md", sm: "lg" }} mb="lg">
          <KaiderLetterhead />
        </Box>

        {slidesQuery.isLoading ? (
          <Center h={360}>
            <Loader color="green" size="lg" />
          </Center>
        ) : slidesQuery.error ? (
          <Alert color="red">{errorMessage(slidesQuery.error)}</Alert>
        ) : slides.length ? (
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
            {slides.map((slide) => (
              <SlideCard key={slide.id} slide={slide} onOpen={() => setPreviewSlide(slide)} />
            ))}
          </SimpleGrid>
        ) : (
          <Center h={360}>
            <Text c="dimmed" fz={24}>暂无项目资料</Text>
          </Center>
        )}
      </Container>

      <Box
        pos="fixed"
        bottom={0}
        left={0}
        right={0}
        bg="rgba(255, 255, 255, 0.97)"
        p="md"
        style={{ borderTop: "1px solid #dfe8dc", zIndex: 100 }}
      >
        <Container size={1080} px={0}>
          <Button fullWidth h={82} radius="md" bg="#6aa84f" fz={30} fw={700} onClick={openQuestionnaire}>
            ＋ 添加问卷
          </Button>
        </Container>
      </Box>

      <PdfSwipeViewer
        opened={Boolean(previewSlide)}
        url={previewSlide?.url ?? ""}
        title={previewSlide?.title ?? ""}
        onClose={() => setPreviewSlide(null)}
      />

      <Modal
        opened={surveyOpened}
        onClose={closeSurvey}
        fullScreen
        withCloseButton={false}
        padding={0}
        styles={{
          header: { display: "none" },
          body: { background: "#eceeeb", minHeight: "100vh" },
        }}
      >
        {submitted ? (
          <Center mih="100vh" p="xl">
            <Stack align="center" gap="xl" bg="white" p={48} maw={820} w="100%">
              <KaiderLetterhead />
              <Text fz={34} fw={700} c="#4e8a3a" ta="center">✓ 已提交 / Submitted，已生成拜访记录</Text>
              <Button size="xl" bg="#6aa84f" onClick={finishSuccess}>完成</Button>
            </Stack>
          </Center>
        ) : (
          <Container size={860} px={{ base: "md", sm: "xl" }} py="xl">
            <Box bg="white" p={{ base: "lg", sm: 36 }} style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.08)" }}>
              <Stack gap={28}>
                <KaiderLetterhead />

                <Box ta="center">
                  <Title order={1} fz={{ base: 24, sm: 26 }} fw={800} c="#333">
                    Property Service Needs Form{" "}
                    <Text span c="#6aa84f" inherit>物业服务需求表</Text>
                  </Title>
                  <Text c="#777" fz={16} mt={6}>
                    Please tick the boxes — about 3 minutes.　请勾选，约 3 分钟完成。
                  </Text>
                </Box>

                <PaperSection title="① Property basics 物业基本信息">
                  <Select
                    label={<FieldLabel en="Property name" zh="物业名称" />}
                    placeholder="搜索物业名称或地址"
                    data={properties.map((property) => ({
                      value: property.id,
                      label: `${property.name}${property.address ? ` · ${property.address}` : ""}`,
                    }))}
                    value={propertyId}
                    onChange={setPropertyId}
                    searchable
                    required
                    size="lg"
                    rightSection={propertiesQuery.isLoading ? <Loader size="xs" /> : null}
                  />

                {selectedProperty ? (
                  <Box mt="md" p="md" style={{ border: "1px solid #d7e5d1", borderRadius: 6 }}>
                    <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                      <ReadOnlyInfo label="Property name 物业名称" value={selectedProperty.name} />
                      <ReadOnlyInfo label="Type 类型" value={propertyTypeLabels[selectedProperty.property_type] ?? selectedProperty.property_type} />
                      <ReadOnlyInfo label="Address 地址" value={selectedProperty.address ?? "-"} />
                    </SimpleGrid>
                  </Box>
                ) : null}
                </PaperSection>

                <PaperSection title="② Services you're interested in 您感兴趣的服务　(tick all that apply 可多选)">
                <Checkbox.Group
                  value={interestedServices}
                  onChange={(values) => setInterestedServices(values as FranchiseService[])}
                >
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                    {propertySurveyServices.map((service) => (
                      <Checkbox.Card key={service.value} value={service.value} radius="sm" p="md" style={{ borderColor: "#b9d4ad" }}>
                        <Group wrap="nowrap" align="flex-start">
                          <Checkbox.Indicator size="xl" />
                          <Box>
                            <Text fw={700} fz={18}>{service.label.en}</Text>
                            <Text c="#555" fz={17}>{service.label.zh}</Text>
                          </Box>
                        </Group>
                      </Checkbox.Card>
                    ))}
                  </SimpleGrid>
                </Checkbox.Group>
                </PaperSection>

                <PaperSection title="③ Details — fill only the services you ticked 按所选服务填写">
                {interestedServices.length ? (
                  <PaperSurveyFields services={interestedServices} details={details} setDetails={setDetails} />
                ) : (
                  <Text c="#777" fz={18}>Please tick services above first. 请先勾选感兴趣的服务。</Text>
                )}
                </PaperSection>

                <PaperSection title="④ For our use 业务员填写">
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
                  <Select
                    label={<FieldLabel en="Salesperson" zh="业务员" />}
                    placeholder="选择业务员"
                    data={employees.map((employee) => ({ value: employee.id, label: employee.name }))}
                    value={employeeId}
                    onChange={setEmployeeId}
                    searchable
                    required
                    size="lg"
                    rightSection={employeesQuery.isLoading ? <Loader size="xs" /> : null}
                  />
                  <TextInput
                    type="date"
                    label={<FieldLabel en="Visit date" zh="拜访日期" />}
                    value={visitedAt}
                    onChange={(event) => setVisitedAt(event.currentTarget.value)}
                    size="lg"
                    required
                  />
                </SimpleGrid>
                <Radio.Group
                  label={<FieldLabel en="Interest level" zh="意向" />}
                  value={interestLevel}
                  onChange={(value) => setInterestLevel(value as FranchiseInterestLevel)}
                  size="lg"
                >
                  <Group mt="xs" gap="xl">
                    {franchiseInterestLevels.map((level) => (
                      <Radio key={level} value={level} label={`${interestLabels[level]} / ${level}`} size="lg" />
                    ))}
                  </Group>
                </Radio.Group>
                <Textarea
                  label={<FieldLabel en="Notes" zh="备注" />}
                  value={note}
                  onChange={(event) => setNote(event.currentTarget.value)}
                  minRows={4}
                  autosize
                  size="lg"
                />
                </PaperSection>

                <Text ta="center" c="#777" fz={13}>
                  Kaider Management 恺德管理　Tel +65 8319 5718 · 111 N Bridge Rd #24-05B, Singapore 179098
                </Text>

                {propertiesQuery.error || employeesQuery.error || createVisitMutation.error ? (
                  <Alert color="red" title="无法提交">
                    {errorMessage(createVisitMutation.error ?? propertiesQuery.error ?? employeesQuery.error)}
                  </Alert>
                ) : null}

                <Group justify="flex-end" gap="md">
                  <Button variant="default" size="lg" onClick={closeSurvey}>
                    取消 Cancel
                  </Button>
                  <Button
                    bg="#6aa84f"
                    size="lg"
                    disabled={!canSubmit}
                    loading={createVisitMutation.isPending}
                    onClick={() => createVisitMutation.mutate()}
                  >
                    提交问卷 Submit
                  </Button>
                </Group>
              </Stack>
            </Box>
          </Container>
        )}
      </Modal>
    </Box>
  );
}

function SlideCard({ slide, onOpen }: { slide: KioskSlide; onOpen: () => void }) {
  return (
    <Card p={0} radius="md" withBorder bg="white" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") onOpen();
    }} style={{ cursor: "pointer", overflow: "hidden" }}>
      {slide.thumb_url ? (
        <Image src={slide.thumb_url} alt={slide.title} h={300} fit="cover" />
      ) : (
        <Center h={300} bg="#eef1ed">
          <Text fz={24} fw={700} c="dimmed" ta="center" px="md">{slide.title}</Text>
        </Center>
      )}
      <Box p="lg">
        <Text fw={700} fz={22} lineClamp={2}>{slide.title}</Text>
      </Box>
    </Card>
  );
}

function PaperSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box>
      <SectionBar>{title}</SectionBar>
      <Box mt="md">
        <Stack gap="lg">{children}</Stack>
      </Box>
    </Box>
  );
}

function SectionBar({ children }: { children: React.ReactNode }) {
  return (
    <Box bg="#6aa84f" c="white" fw={800} fz={19} px={16} py={10} style={{ borderRadius: 6 }}>
      {children}
    </Box>
  );
}

function FieldLabel({ en, zh }: { en: string; zh: string }) {
  return (
    <Text span fz={17} c="#333">
      <Text span fw={800}>{en}</Text>{" "}
      <Text span fw={400}>{zh}</Text>
    </Text>
  );
}

function PaperSurveyFields({
  services,
  details,
  setDetails
}: {
  services: FranchiseService[];
  details: PropertySurveyDetails;
  setDetails: React.Dispatch<React.SetStateAction<PropertySurveyDetails>>;
}) {
  return (
    <Stack gap={24}>
      {visiblePropertySurveySections(services).map((section) => {
        const sectionValues = details[section.key] ?? {};
        return (
          <Box key={section.key}>
            <Text fw={800} fz={18} c="#4e8a3a" mb="md">
              {section.title.en} {section.title.zh}
            </Text>
            <Stack gap="lg">
              {section.fields.filter((field) => fieldVisible(field, sectionValues)).map((field) => (
                <PaperSurveyQuestion
                  key={field.key}
                  sectionKey={section.key}
                  field={field}
                  value={sectionValues[field.key]}
                  setDetails={setDetails}
                />
              ))}
            </Stack>
          </Box>
        );
      })}
    </Stack>
  );
}

function PaperSurveyQuestion({
  sectionKey,
  field,
  value,
  setDetails
}: {
  sectionKey: string;
  field: PropertySurveyField;
  value: string | string[] | undefined;
  setDetails: React.Dispatch<React.SetStateAction<PropertySurveyDetails>>;
}) {
  return (
    <Box pb="md" style={{ borderBottom: "1px solid #dfe8dc" }}>
      <Text fz={17} mb="sm" c="#333">
        <Text span fw={800}>{field.label.en}</Text>{" "}
        <Text span>{field.label.zh}</Text>
      </Text>
      {field.type === "multi" ? (
        <Checkbox.Group
          value={(value as string[] | undefined) ?? []}
          onChange={(next) => setSurveyField(setDetails, sectionKey, field.key, next)}
        >
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
            {field.options.map((option) => (
              <Checkbox
                key={option.value}
                value={option.value}
                size="lg"
                label={<OptionLabel en={option.label.en} zh={option.label.zh} />}
                styles={{ body: { alignItems: "center" }, labelWrapper: { width: "100%" } }}
              />
            ))}
          </SimpleGrid>
        </Checkbox.Group>
      ) : (
        <Radio.Group
          value={(value as string | undefined) ?? ""}
          onChange={(next) => setSurveyField(setDetails, sectionKey, field.key, next || null)}
        >
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
            {field.options.map((option) => (
              <Radio
                key={option.value}
                value={option.value}
                size="lg"
                label={<OptionLabel en={option.label.en} zh={option.label.zh} />}
                styles={{ body: { alignItems: "center" }, labelWrapper: { width: "100%" } }}
              />
            ))}
          </SimpleGrid>
        </Radio.Group>
      )}
    </Box>
  );
}

function OptionLabel({ en, zh }: { en: string; zh: string }) {
  return (
    <Text fz={16} c="#333">
      <Text span fw={700}>{en}</Text>{" "}
      <Text span>{zh}</Text>
    </Text>
  );
}

function ReadOnlyInfo({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Text c="dimmed" fz={15}>{label}</Text>
      <Text fw={700} fz={20}>{value}</Text>
    </Box>
  );
}
