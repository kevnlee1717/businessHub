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

// 强制改密界面用户可能还没设置系统语言,这里同屏显示中英文双语。
const RULE_EN: Record<string, string> = {
  minLength: "At least 8 characters",
  uppercase: "Contains an uppercase letter",
  lowercase: "Contains a lowercase letter",
  number: "Contains a number",
  special: "Contains a special character (e.g. !@#$%)"
};

export function ChangePasswordForm({ forced = false, onSuccess }: ChangePasswordFormProps) {
  // forced 态:中英双语;非强制(个人中心改密页):保持中文。
  const bi = (zh: string, en: string) => (forced ? `${zh} / ${en}` : zh);
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
        setFormError(bi("当前密码不正确", "Current password is incorrect"));
        return;
      }

      setFormError(error instanceof Error && error.message ? error.message : bi("修改失败,请重试", "Update failed, please try again"));
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
            label={bi("当前密码", "Current password")}
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.currentTarget.value)}
            required
          />
        ) : null}

        <PasswordInput
          label={bi("新密码", "New password")}
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
                {forced ? `${rule.label} / ${RULE_EN[rule.key] ?? ""}` : rule.label}
              </Text>
            </Group>
          ))}
        </Stack>

        <PasswordInput
          label={bi("确认新密码", "Confirm new password")}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.currentTarget.value)}
          error={showConfirmError ? bi("两次输入的密码不一致", "Passwords do not match") : undefined}
          required
        />

        <Group justify="flex-end">
          <Button type="submit" disabled={!canSubmit} loading={mutation.isPending}>
            {bi("修改密码", "Change password")}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
