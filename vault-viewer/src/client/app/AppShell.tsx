import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "../services/query/queryClient.js";
import { ThemeProvider } from "./providers/theme.provider.js";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <div className="app-shell" style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
          {children}
        </div>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
