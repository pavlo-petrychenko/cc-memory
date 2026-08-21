import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App.js";
import { AppShell } from "./app/AppShell.js";
import "../../src/styles/console.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppShell>
      <App />
    </AppShell>
  </React.StrictMode>,
);
