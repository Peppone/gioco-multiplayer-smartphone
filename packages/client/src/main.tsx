import { StrictMode } from "react";
import { MotionGlobalConfig } from "framer-motion";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./themes/index.css";
import "./styles.css";

// ?still=1 salta tutte le animazioni (screenshot deterministici, prove di leggibilità).
if (new URLSearchParams(window.location.search).has("still")) MotionGlobalConfig.skipAnimations = true;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
