import { passwordRules } from "@bh/shared";
import {
  Alert,
  Button,
  Group,
  PasswordInput,
  Stack,
  Text,
  ThemeIcon
} from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useMemo, useState } from "react";
import { ApiError, changePassword } from "../api/client";

type ChangePasswordFormProps = {
  forced?: boolean;
  onSuccess?: () => void;
};

export function ChangePasswordForm({ forced = false, onSuccess }: ChangePasswordFormProps) {
  const queryClient = useQueryClient();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const ruleResults = useMemo(
    () => passwordRules.map((rule) => ({ rule, passed: rule.test(newPassword) })),
    [newPassword]
  );
  const allRulesPassed = ruleResults.every(({ passed }) => passed);
  const passwordsMatch = newPassword === confirmPassword;
  const showConfirmError = confirmPassword.length > 0 && !passwordsMatch;
  const canSubmit = allRulesPassed && passwordsMatch && (forced || currentPassword.trim().length > 0);

  const mutation = useMutation({
    mutationFn: changePassword,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setFormError(null);
      onSuccess?.();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.message === "invalid_current_password") {
        setFormError("当前密码不正确");
        return;
      }

      setFormError(error instanceof Error && error.message ? error.message : "修改失败，请重试");
    }
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit || mutation.isPending) {
      return;
    }

    setFormError(null);
    mutation.mutate(
      forced
        ? { new_password: newPassword }
        : {
            current_password: currentPassword,
            new_password: newPassword
          }
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="md">
        {formError ? (
          <Alert color="red" variant="light">
            {formError}
          </Alert>
        ) : null}

        {!forced ? (
          <PasswordInput
            label="当前密码"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.currentTarget.value)}
            required
          />
        ) : null}

        <PasswordInput
          label="新密码"
          value={newPassword}
          onChange={(event) => setNewPassword(event.currentTarget.value)}
          required
        />

        <Stack gap={6}>
          {ruleResults.map(({ rule, passed }) => (
            <Group key={rule.key} gap="xs" wrap="nowrap">
              <ThemeIcon color={passed ? "green" : "red"} variant="light" size="sm" radius="xl">
                <Text component="span" size="xs" fw={700}>
                  {passed ? "✓" : "✗"}
                </Text>
              </ThemeIcon>
              <Text size="sm" c={passed ? "green" : "red"}>
                {rule.label}
              </Text>
            </Group>
          ))}
        </Stack>

        <PasswordInput
          label="确认新密码"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.currentTarget.value)}
          error={showConfirmError ? "两次输入的密码不一致" : undefined}
          required
        />

        <Group justify="flex-end">
          <Button type="submit" disabled={!canSubmit} loading={mutation.isPending}>
            修改密码
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
