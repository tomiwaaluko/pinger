import { join } from "node:path";
import { runSimplifyCoverage } from "./simplify-coverage.js";

const root = process.cwd();
const result = await runSimplifyCoverage({
  fetch,
  githubToken: process.env.GITHUB_TOKEN,
  companiesYamlPath: join(root, "companies.yaml"),
  reportPath: join(root, "data", "simplify-coverage-report.md"),
  suggestedPath: join(root, "data", "companies.suggested.yaml"),
});
if (result.skippedInvalid > 0) {
  console.error(`skipped-invalid: ${result.skippedInvalid}`);
}
process.exit(result.exitCode);
