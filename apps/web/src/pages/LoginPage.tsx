import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Button,
  Center,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import { loginSchema, type LoginInput } from "@bh/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import { UnauthorizedError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { LanguageToggle } from "../components/LanguageToggle";

export function LoginPage() {
  const { t } = useTranslation();
  const { user, login } = useAuth();
  const [loginError, setLoginError] = useState(false);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: ""
    }
  });

  if (user) {
    return <Navigate to="/" replace />;
  }

  const onSubmit = handleSubmit(async (values) => {
    setLoginError(false);

    try {
      await login(values);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        setLoginError(true);
        return;
      }

      throw error;
    }
  });

  return (
    <Center mih="100vh" px="md" bg="gray.0">
      <Stack w="100%" maw={420} gap="md">
        <Group justify="space-between">
          <Group gap="xs">
            <img src="/founder-logo.png" alt="BusinessHub" className="app-brand-logo" />
            <Title order={2}>{t("app.title")}</Title>
          </Group>
          <LanguageToggle />
        </Group>
        <Paper withBorder shadow="sm" radius="md" p="lg">
          <form onSubmit={onSubmit}>
            <Stack gap="md">
              <Text fw={600}>{t("auth.login")}</Text>
              {loginError ? (
                <Alert color="red" variant="light">
                  {t("auth.invalidCredentials")}
                </Alert>
              ) : null}
              <TextInput
                label={t("auth.email")}
                type="email"
                autoComplete="email"
                error={errors.email?.message}
                {...register("email")}
              />
              <PasswordInput
                label={t("auth.password")}
                autoComplete="current-password"
                error={errors.password?.message}
                {...register("password")}
              />
              <Button type="submit" loading={isSubmitting} fullWidth>
                {t("auth.loginButton")}
              </Button>
            </Stack>
          </form>
        </Paper>
      </Stack>
    </Center>
  );
}
