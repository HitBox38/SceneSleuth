import { createContext } from "react";
import type { EngineTheme } from "../shared/reviewTheme.ts";

// React context follows image-preview portals outside the file's shadow root.
export const EngineThemeContext = createContext<EngineTheme>("github");
