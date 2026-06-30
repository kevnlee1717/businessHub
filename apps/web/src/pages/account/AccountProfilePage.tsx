import {
  Alert,
  Avatar,
  Box,
  Button,
  FileButton,
  Group,
  Paper,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useState } from "react";
import { ApiError, updateProfile, uploadAvatar } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { ChangePasswordForm } from "../../components/ChangePasswordForm";

export function AccountProfilePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState(user?.name ?? "");
  const [nameEn, setNameEn] = useState(user?.name_en ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  useEffect(() => {
    setName(user?.name ?? "");
    setNameEn(user?.name_en ?? "");
    setEmail(user?.email ?? "");
    setPhone(user?.phone ?? "");
  }, [user]);

  const profileMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      setProfileError(null);
      setProfileMsg("个人资料已保存");
    },
    onError: (error) => {
      setProfileMsg(null);

      if (error instanceof ApiError && error.message === "email_taken") {
        setProfileError("该邮箱已被占用");
        return;
      }

      setProfileError(error instanceof Error && error.message ? error.message : "保存失败，请重试");
    }
  });

  const avatarMutation = useMutation({
    mutationFn: uploadAvatar,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      setAvatarError(null);
    },
    onError: (error) => {
      setAvatarError(error instanceof Error && error.message ? error.message : "上传失败，请重试");
    }
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileError(null);
    setProfileMsg(null);
    profileMutation.mutate({
      name,
      name_en: nameEn,
      email,
      phone
    });
  }

  function handleAvatar(file: File | null) {
    if (!file) {
      return;
    }

    setAvatarError(null);
    avatarMutation.mutate(file);
  }

  const initial = (user?.name ?? user?.email ?? "?").slice(0, 1).toUpperCase();

  return (
    <Box maw={560}>
      <Paper p="lg" radius="sm" withBorder>
        <Stack gap="md">
          <Title order={3}>个人资料</Title>
          <Tabs defaultValue="profile">
            <Tabs.List>
              <Tabs.Tab value="profile">个人信息</Tabs.Tab>
              <Tabs.Tab value="password">修改密码</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="profile" pt="md">
              <form onSubmit={handleSubmit}>
                <Stack gap="md">
                  {profileMsg ? (
                    <Alert color="green" variant="light">
                      {profileMsg}
                    </Alert>
                  ) : null}
                  {profileError ? (
                    <Alert color="red" variant="light">
                      {profileError}
                    </Alert>
                  ) : null}
                  {avatarError ? (
                    <Alert color="red" variant="light">
                      {avatarError}
                    </Alert>
                  ) : null}

                  <Group gap="md" align="center">
                    <Avatar src={user?.avatar ?? null} size={80} radius="xl" color="blue">
                      {initial}
                    </Avatar>
                    <Stack gap={6}>
                      <FileButton accept="image/*" onChange={handleAvatar}>
                        {(props) => (
                          <Button variant="light" loading={avatarMutation.isPending} {...props}>
                            上传头像
                          </Button>
                        )}
                      </FileButton>
                      {user?.must_change_password || !user?.avatar ? (
                        <Text size="sm" c="red">
                          建议上传头像
                        </Text>
                      ) : null}
                    </Stack>
                  </Group>

                  <TextInput label="姓名" value={name} onChange={(event) => setName(event.currentTarget.value)} required />
                  <TextInput label="英文名" value={nameEn} onChange={(event) => setNameEn(event.currentTarget.value)} />
                  <TextInput
                    label="邮箱"
                    description="邮箱即登录账号"
                    value={email}
                    onChange={(event) => setEmail(event.currentTarget.value)}
                    required
                  />
                  <TextInput label="手机号" value={phone} onChange={(event) => setPhone(event.currentTarget.value)} />

                  <Group justify="flex-end">
                    <Button type="submit" loading={profileMutation.isPending}>
                      保存
                    </Button>
                  </Group>
                </Stack>
              </form>
            </Tabs.Panel>

            <Tabs.Panel value="password" pt="md">
              <Stack gap="md">
                {pwMsg ? (
                  <Alert color="green" variant="light">
                    {pwMsg}
                  </Alert>
                ) : null}
                <ChangePasswordForm onSuccess={() => setPwMsg("密码修改成功")} />
              </Stack>
            </Tabs.Panel>
          </Tabs>
        </Stack>
      </Paper>
    </Box>
  );
}
