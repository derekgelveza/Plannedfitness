/**
 * helloworld.ts — Entry point for the terminal (CLI) version of the app.
 * `npm run cli` runs the compiled dist/helloworld.js, so run `npm run build`
 * after changing any .ts file.
 */
import { TerminalApp } from "./cli/terminalApp.js";
// Start the menu loop. If anything crashes, print the error and set a
// non-zero exit code so the shell knows it failed.
new TerminalApp().run().catch((error) => { console.error(error); process.exitCode = 1; });
//# sourceMappingURL=helloworld.js.map