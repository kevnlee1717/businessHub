import { Stack } from "@mantine/core";
import { Outlet } from "react-router-dom";

export function BusinessLayout() {
  return (
    <Stack gap="lg">
      <Outlet />
    </Stack>
  );
}
