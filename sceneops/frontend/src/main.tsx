import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth";
import App from "./App";
import "./index.css";

const qc = new QueryClient({
  defaultOptions: {
    queries: { retry: (n, e: any) => (e?.status && e.status < 500 ? false : n < 2), refetchOnWindowFocus: false, staleTime: 5000 },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <AuthProvider>
          <App />
          <Toaster dir="rtl" position="bottom-left" theme="dark" richColors closeButton
            toastOptions={{ style: { fontFamily: "Heebo, sans-serif" } }} />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
