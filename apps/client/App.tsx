import { mount } from "nsh";

import { AppShell } from "./components/AppShell";

/** Empty shell only — no features mounted. */
function App() {
  return <AppShell />;
}

mount(App);
