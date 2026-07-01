import {
  ActionIcon,
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
import { useMemo, useState } from "react";
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
    <Box mih="100vh" bg="#f6f8f5" pb={120}>
      <Container size={1080} px={{ base: "md", sm: "xl" }} py="lg">
        <Group justify="center" mb="lg">
          <Image src="/founder-logo.png" alt="Kaider" w={52} h={52} fit="contain" />
        </Group>

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
        bg="rgba(255, 255, 255, 0.96)"
        p="md"
        style={{ borderTop: "1px solid #dfe8dc", zIndex: 100 }}
      >
        <Container size={1080} px={0}>
          <Button fullWidth h={82} radius="md" color="green" fz={30} fw={700} onClick={openQuestionnaire}>
            ＋ 添加问卷
          </Button>
        </Container>
      </Box>

      <Modal
        opened={Boolean(previewSlide)}
        onClose={() => setPreviewSlide(null)}
        fullScreen
        withCloseButton={false}
        padding={0}
      >
        <ActionIcon
          aria-label="关闭"
          variant="filled"
          color="dark"
          radius="xl"
          size={56}
          pos="fixed"
          top={18}
          right={18}
          style={{ zIndex: 1000 }}
          onClick={() => setPreviewSlide(null)}
        >
          <Text fz={34} lh={1}>×</Text>
        </ActionIcon>
        {previewSlide ? (
          <iframe
            src={previewSlide.url}
            title={previewSlide.title}
            style={{ width: "100%", height: "100vh", border: 0, display: "block" }}
          />
        ) : null}
      </Modal>

      <Modal
        opened={surveyOpened}
        onClose={closeSurvey}
        title={<Text fw={700} fz={28}>物业服务需求表</Text>}
        fullScreen
        padding="xl"
        styles={{
          header: { borderBottom: "1px solid #e5eee4" },
          body: { background: "#f7f9f6" },
        }}
      >
        {submitted ? (
          <Center mih="80vh">
            <Stack align="center" gap="xl">
              <Text fz={36} fw={700} c="green">✓ 问卷已提交，已生成拜访记录</Text>
              <Button size="xl" color="green" onClick={finishSuccess}>完成</Button>
            </Stack>
          </Center>
        ) : (
          <Container size={980} px={{ base: 0, sm: "md" }} py="xl">
            <Stack gap={28}>
              <SurveySection title="① 物业基本信息">
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
                  <Select
                    label="物业"
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
                  <Select
                    label="业务员"
                    placeholder="选择业务员"
                    data={employees.map((employee) => ({ value: employee.id, label: employee.name }))}
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
