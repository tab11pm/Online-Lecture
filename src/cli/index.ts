import { executeCli } from './commands.js';

const result = await executeCli(process.argv.slice(2));
process.stdout.write(result.output);
process.exitCode = result.exitCode;
