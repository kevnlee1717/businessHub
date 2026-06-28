import { Alert, Box, Paper, Stack, Title } from "@mantine/core";
import { useState } from "react";
import { ChangePasswordForm } from "../../components/ChangePasswordForm";

export function AccountPasswordPage() {
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  return (
    <Box maw={480}>
      <Paper p="lg" radius="sm" withBorder>
        <Stack gap="md">
          <Title order={3}>修改密码</Title>
          {successMessage ? (
            <Alert color="green" variant="light">
              {successMessage}
            </Alert>
          ) : null}
          <ChangePasswordForm onSuccess={() => setSuccessMessage("密码修改成功")} />
        </Stack>
      </Paper>
    </Box>
  );
}
