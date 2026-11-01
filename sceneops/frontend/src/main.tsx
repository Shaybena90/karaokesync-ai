import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth";
import App from "./App";
import { DEMO, loadDemo } from "@/lib/demo";
import "./index.css";

const qc = new QueryClient({
  defaultOptions: {
    queries: { retry: (n, e: any) => (e?.status && e.status < 500 ? false : n < 2), refetchOnWindowFocus: false, staleTime: 5000 },
  },
});

const Router = DEMO ? MemoryRouter : BrowserRouter;
document.documentElement.dir = "rtl";
document.documentElement.lang = "he";

(DEMO ? loadDemo() : Promise.resolve()).then(() => ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <Router>
        <AuthProvider>
          <App />
          <Toaster dir="rtl" position="bottom-left" theme="dark" richColors closeButton
            toastOptions={{ style: { fontFamily: "Heebo, sans-serif" } }} />
        </AuthProvider>
      </Router>
    </QueryClientProvider>
  </React.StrictMode>,
));
