import {
  Alert,
  Box,
  Button,
  Card,
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listEmployees } from "../../api/hr";
import { ipadSlideKeys, listIpadSlides, type IpadSlide } from "../../api/ipadSlides";
import {
  createFranchisePropertyVisit,
  franchiseKeys,
  listFranchiseProperties,
  type FranchiseProperty,
} from "../../api/franchise";
import {
  buildVisibleSurveyDetails,
  PropertySurveyFields,
  type PropertySurveyDetails,
} from "../franchise/TrackingShared";
import { propertySurveyServices } from "../franchise/propertySurvey";

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

function propertyLabel(property: FranchiseProperty) {
  return `${property.name}${property.address ? ` · ${property.address}` : ""}`;
}

export function IpadSurveyPage() {
  const queryClient = useQueryClient();
  const [opened, { open, close }] = useDisclosure(false);
  const [submitted, setSubmitted] = useState(false);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [interestedServices, setInterestedServices] = useState<FranchiseService[]>([]);
  const [details, setDetails] = useState<PropertySurveyDetails>({});
  const [visitedAt, setVisitedAt] = useState(todayDateInput());
  const [interestLevel, setInterestLevel] = useState<FranchiseInterestLevel>("medium");
  const [note, setNote] = useState("");
  const [previewSlide, setPreviewSlide] = useState<IpadSlide | null>(null);

  const slidesQuery = useQuery({
    queryKey: ipadSlideKeys.list(),
    queryFn: listIpadSlides,
  });

  const propertiesQuery = useQuery({
    queryKey: franchiseKeys.properties({ source: "ipad-survey", page_size: 500 }),
    queryFn: () => listFranchiseProperties({ page_size: 500 }),
    enabled: opened,
  });
  const employeesQuery = useQuery({
    queryKey: ["hr", "employees", "ipad-sales-active"],
    queryFn: () => listEmployees({ page_size: 200 }),
    enabled: opened,
  });

  const properties = propertiesQuery.data?.properties ?? [];
  const slides = slidesQuery.data?.slides ?? [];
  const employees = employeesQuery.data?.employees ?? [];
  const salesEmployees = useMemo(() => {
    const filtered = employees.filter((employee) => employee.status === "active" && employee.role === "sales");
    return filtered.length ? filtered : employees.filter((employee) => employee.status === "active");
  }, [employees]);
  const selectedProperty = properties.find((property) => property.id === propertyId) ?? null;
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

  const createVisitMutation = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      if (!propertyId) throw new Error("请选择物业");
      if (!employeeId) throw new Error("请选择业务员");
      const payload = {
        status: "completed",
        visited_at: dateToApiDateTime(visitedAt),
        by_employee_id: employeeId,
        interest_level: interestLevel,
        note: emptyToNull(note),
        services_pitched: interestedServices,
        survey: {
          interested_services: interestedServices,
          details: buildVisibleSurveyDetails(details, interestedServices),
        },
      };
      return createFranchisePropertyVisit(propertyId, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: franchiseKeys.all });
      resetForm();
      setSubmitted(true);
      close();
    },
  });

  function closeSurvey() {
    createVisitMutation.reset();
    close();
  }

  return (
    <Box mih="100vh" bg="#f7f9f6">
      <Box bg="#2f9e44" c="white" py="lg" px="xl">
        <Container size={980} px={0}>
          <Group gap="md" wrap="nowrap">
            <Image
              src="/founder-logo.png"
              alt="Kaider"
              w={64}
              h={64}
              fit="contain"
              radius="md"
              bg="white"
              p={6}
            />
            <Title order={1} fz={{ base: 30, sm: 38 }} fw={700}>
              恺德管理 · 物业拜访
            </Title>
          </Group>
        </Container>
      </Box>

      <Container size={980} px={{ base: "lg", sm: "xl" }} py={{ base: "xl", sm: 48 }}>
        <Stack gap={36}>
          {submitted ? (
            <Alert color="green" title="问卷已提交" fz={18} onClose={() => setSubmitted(false)} withCloseButton>
              已生成拜访记录，可在后台物业拜访中查看。
            </Alert>
          ) : null}

          <Stack gap="md">
            <Box>
              <Title order={2} fz={{ base: 28, sm: 34 }}>
                项目资料
              </Title>
            </Box>

            {slidesQuery.isLoading ? (
              <Group justify="center" py="xl">
                <Loader color="green" />
              </Group>
            ) : slidesQuery.error ? (
              <Alert color="red">{errorMessage(slidesQuery.error)}</Alert>
            ) : slides.length ? (
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
                {slides.map((slide) => (
                  <Card
                    key={slide.id}
                    radius="md"
                    padding="xl"
                    withBorder
                    bg="white"
                    role="button"
                    tabIndex={0}
                    onClick={() => setPreviewSlide(slide)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") setPreviewSlide(slide);
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <Stack gap="sm">
                      <Text fw={700} fz={24}>
                        {slide.title}
                      </Text>
                      <Text c="dimmed" fz={18}>
                        {slide.filename}
                      </Text>
                    </Stack>
                  </Card>
                ))}
              </SimpleGrid>
            ) : (
              <Card radius="md" padding="xl" withBorder bg="white">
                <Text c="dimmed" fz={20}>暂无项目资料</Text>
              </Card>
            )}
          </Stack>

          <Button
            fullWidth
            size="xl"
            h={88}
            radius="md"
            color="green"
            fz={30}
            fw={700}
            onClick={() => {
              setSubmitted(false);
              open();
            }}
          >
            ＋ 添加问卷
          </Button>
        </Stack>
      </Container>

      <Modal
        opened={Boolean(previewSlide)}
        onClose={() => setPreviewSlide(null)}
        title={<Text fw={700} fz={24}>{previewSlide?.title}</Text>}
        size="95%"
      >
        {previewSlide ? (
          <iframe
            src={previewSlide.url}
            title={previewSlide.title}
            style={{ width: "100%", height: "80vh", border: 0 }}
          />
        ) : null}
      </Modal>

      <Modal
        opened={opened}
        onClose={closeSurvey}
        title={<Text fw={700} fz={28}>物业服务需求表</Text>}
        fullScreen
        padding="xl"
        styles={{
          header: { borderBottom: "1px solid #e5eee4" },
          body: { background: "#f7f9f6" },
        }}
      >
        <Container size={980} px={{ base: 0, sm: "md" }} py="xl">
          <Stack gap={28}>
            <SurveySection title="① 物业基本信息">
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
                <Select
                  label="物业"
                  placeholder="搜索物业名称或地址"
                  data={properties.map((property) => ({ value: property.id, label: propertyLabel(property) }))}
                  value={propertyId}
                  onChange={setPropertyId}
                  searchable
                  required
                  size="lg"
                  rightSection={propertiesQuery.isLoading ? <Loader size="xs" /> : null}
                />
                <Select
                  label="业务员"
                  placeholder="选择业务员"
                  data={salesEmployees.map((employee) => ({ value: employee.id, label: employee.name }))}
                  value={employeeId}
                  onChange={setEmployeeId}
                  searchable
                  required
                  size="lg"
                  rightSection={employeesQuery.isLoading ? <Loader size="xs" /> : null}
                />
              </SimpleGrid>

              {selectedProperty ? (
                <Card withBorder bg="#fbfdfb" radius="md" padding="lg">
                  <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                    <ReadOnlyInfo label="物业名称" value={selectedProperty.name} />
                    <ReadOnlyInfo label="类型" value={propertyTypeLabels[selectedProperty.property_type] ?? selectedProperty.property_type} />
                    <ReadOnlyInfo label="地址" value={selectedProperty.address ?? "-"} />
                  </SimpleGrid>
                </Card>
              ) : null}
            </SurveySection>

            <SurveySection title="② 感兴趣的服务">
              <Checkbox.Group
                value={interestedServices}
                onChange={(values) => setInterestedServices(values as FranchiseService[])}
              >
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  {propertySurveyServices.map((service) => (
                    <Checkbox.Card key={service.value} value={service.value} radius="md" p="lg">
                      <Group wrap="nowrap" align="flex-start">
                        <Checkbox.Indicator size="lg" />
                        <Box>
                          <Text fw={700} fz={20}>{service.label.zh}</Text>
                          <Text c="dimmed" fz={16}>{service.label.en}</Text>
                        </Box>
                      </Group>
                    </Checkbox.Card>
                  ))}
                </SimpleGrid>
              </Checkbox.Group>
            </SurveySection>

            <SurveySection title="③ 服务细项">
              {interestedServices.length ? (
                <PropertySurveyFields services={interestedServices} details={details} setDetails={setDetails} />
              ) : (
                <Text c="dimmed" fz={18}>请选择感兴趣的服务后填写细项。</Text>
              )}
            </SurveySection>

            <SurveySection title="④ 业务员填写">
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
                <TextInput
                  type="date"
                  label="拜访日期"
                  value={visitedAt}
                  onChange={(event) => setVisitedAt(event.currentTarget.value)}
                  size="lg"
                  required
                />
                <Radio.Group
                  label="意向"
                  value={interestLevel}
                  onChange={(value) => setInterestLevel(value as FranchiseInterestLevel)}
                  size="lg"
                >
                  <Group mt="xs">
                    {franchiseInterestLevels.map((level) => (
                      <Radio key={level} value={level} label={interestLabels[level]} />
                    ))}
                  </Group>
                </Radio.Group>
              </SimpleGrid>
              <Textarea
                label="备注"
                value={note}
                onChange={(event) => setNote(event.currentTarget.value)}
                minRows={4}
                autosize
                size="lg"
              />
            </SurveySection>

            {propertiesQuery.error || employeesQuery.error || createVisitMutation.error ? (
              <Alert color="red" title="无法提交">
                {errorMessage(createVisitMutation.error ?? propertiesQuery.error ?? employeesQuery.error)}
              </Alert>
            ) : null}

            <Group justify="flex-end" gap="md">
              <Button variant="default" size="lg" onClick={closeSurvey}>
                取消
              </Button>
              <Button
                color="green"
                size="lg"
                disabled={!canSubmit}
                loading={createVisitMutation.isPending}
                onClick={() => createVisitMutation.mutate()}
              >
                提交问卷
              </Button>
            </Group>
          </Stack>
        </Container>
      </Modal>
    </Box>
  );
}

function SurveySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card withBorder radius="md" padding="xl" bg="white">
      <Stack gap="lg">
        <Title order={2} fz={{ base: 24, sm: 28 }}>
          {title}
        </Title>
        {children}
      </Stack>
    </Card>
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
