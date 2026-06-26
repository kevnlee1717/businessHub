import "@mantine/core/styles.css";
import "./i18n";

import {
  createTheme,
  MantineProvider,
  MultiSelect,
  Select,
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
  components: {
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
