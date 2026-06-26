import { Stack } from "@mantine/core";
import { Outlet } from "react-router-dom";

export function EducationLayout() {
  return (
    <Stack gap="lg">
      <Outlet />
    </Stack>
  );
}
