import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "@ral/ui";
import App from "./App";
import { StatusBar } from "./components/status-bar";
import "@ral/ui/src/globals.css";
import "streamdown/styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider attribute="class" defaultTheme="dark">
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
        <div className="flex-1 overflow-hidden">
          <App />
        </div>
        <StatusBar />
      </div>
    </ThemeProvider>
  </React.StrictMode>,
);
