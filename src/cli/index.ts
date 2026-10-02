import { executeCli } from './commands.js';

try {
  process.loadEnvFile('.env');
} catch {
  // .env is optional.
}

const result = await executeCli(process.argv.slice(2));
process.stdout.write(result.output);
process.exitCode = result.exitCode;
