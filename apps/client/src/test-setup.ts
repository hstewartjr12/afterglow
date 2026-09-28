import "@testing-library/jest-dom/vitest";
import { MotionGlobalConfig } from "motion/react";

// Tests check behavior, not animation timing: let enter/exit animations finish instantly.
MotionGlobalConfig.skipAnimations = true;

// jsdom has no scrolling; page changes call this to return to the top.
window.scrollTo = () => {};
