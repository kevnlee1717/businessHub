import "@mantine/core/styles.css";
import "./theme.css";
import "./i18n";

import {
  Badge,
  Button,
  Card,
  createTheme,
  MantineProvider,
  MultiSelect,
  Paper,
  Select,
  Table,
} from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./auth/AuthContext";

const queryClient = new QueryClient();
const root = document.getElementById("root");
const theme = createTheme({
  fontFamily: '-apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  defaultRadius: "md",
  primaryColor: "dark",
  autoContrast: true,
  components: {
    Paper: Paper.extend({
      defaultProps: {
        withBorder: true,
        radius: "lg",
        shadow: "xs",
      },
    }),
    Card: Card.extend({
      defaultProps: {
        radius: "lg",
        withBorder: true,
      },
    }),
    Table: Table.extend({
      defaultProps: {
        verticalSpacing: "sm",
        horizontalSpacing: "md",
      },
    }),
    Button: Button.extend({
      defaultProps: {
        radius: "md",
      },
    }),
    Badge: Badge.extend({
      defaultProps: {
        radius: "sm",
      },
    }),
    Select: Select.extend({
      defaultProps: {
        searchable: true,
        maxDropdownHeight: 260,
        nothingFoundMessage: "无匹配",
        comboboxProps: { withinPortal: true },
      },
    }),
    MultiSelect: MultiSelect.extend({
      defaultProps: {
        searchable: true,
        maxDropdownHeight: 260,
        nothingFoundMessage: "无匹配",
        comboboxProps: { withinPortal: true },
      },
    }),
  },
});

if (!root) {
  throw new Error("Root element #root not found");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light">
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </MantineProvider>
  </React.StrictMode>
);
