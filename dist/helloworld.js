import { TerminalApp } from "./cli/terminalApp.js";
new TerminalApp().run().catch((error) => { console.error(error); process.exitCode = 1; });
//# sourceMappingURL=helloworld.js.map