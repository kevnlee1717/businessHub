import { Box, Group, Image, Stack, Text } from "@mantine/core";

export function KaiderLetterhead() {
  return (
    <Box>
      <Group justify="space-between" align="center" wrap="nowrap" gap="lg">
        <Group gap="sm" wrap="nowrap">
          <Image src="/founder-logo.png" alt="Kaider Management" w={56} h={56} fit="contain" radius="xl" />
          <Box>
            <Text fw={800} fz={22} c="#6aa84f" lh={1.15}>
              KAIDER MANAGEMENT
            </Text>
            <Text fz={15} c="#666" mt={2}>
              恺德管理
            </Text>
          </Box>
        </Group>
        <Stack gap={2} ta="right" c="#666" fz={13} style={{ flexShrink: 0 }}>
          <Text fw={700}>Tel 电话 +65 8319 5718</Text>
          <Text>111 N Bridge Rd, #24-05B</Text>
          <Text>Singapore 179098</Text>
        </Stack>
      </Group>
      <Box h={2} bg="#6aa84f" mt="md" />
    </Box>
  );
}
