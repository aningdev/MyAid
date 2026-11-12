/**
 * Test-only entry: what `capabilities.fs` in nsh.json lets this app read and
 * write, reported as text so a test can read it. The app is the same app —
 * same directory, same nsh.json — so the lines are its real grants. A
 * headless run has no filesystem (every call reports
 * `ERR_FEATURE_UNAVAILABLE_ON_PLATFORM`), so the check opens this only on a
 * desktop target.
 */
import fs from "fs/promises";
import { homedir } from "os";
import { join } from "path";

import { mount, signal, Text, View } from "nsh";

const lines = signal<string[]>([]);

function report(call: string, result: string) {
  lines.set([...lines(), `${call}=${result}`]);
}

async function read(call: string, path: string) {
  try {
    await fs.readFile(path);
    report(call, "ok");
  } catch (error) {
    report(call, String((error as { code?: unknown }).code));
  }
}

async function write(call: string, path: string) {
  try {
    await fs.mkdir(join(path, ".."), { recursive: true });
    await fs.writeFile(path, "probe\n");
    await fs.unlink(path);
    report(call, "ok");
  } catch (error) {
    report(call, String((error as { code?: unknown }).code));
  }
}

async function probe() {
  const data = join(homedir(), ".myaid");
  // The app's data root: the registry it keeps, and a missing file beside it.
  await read("read-data", join(data, "registry", "bots.json"));
  await read("read-data-missing", join(data, "nothing-here.json"));
  // Inside the home but outside the data root, and outside the home.
  await read("read-home", homedir());
  await read("read-outside", "/etc/hosts");
  await write("write-data", join(data, ".w2-probe"));
  await write("write-outside", "/tmp/w2-probe-write");
}

function App() {
  void probe();
  return (
    <View style={{ gap: 4, padding: 12 }}>
      <Text testID="probe">{() => lines().join("\n")}</Text>
    </View>
  );
}

mount(App);
