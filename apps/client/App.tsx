import { mount } from "nsh";

import { AppShell } from "./components/AppShell";

/** Workspace Shell: Navigator + Workbench, whose Panels mount the features. */
function App() {
  return <AppShell />;
}

mount(App);
