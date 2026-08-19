import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { CAREER_TEXT_CAP } from "./constants.js";
import type { VaultContents } from "./types.js";

export function resolveCareerDir(vaultDir: string, careerPath: string): string {
  const vaultRoot = path.resolve(vaultDir);
  const normalizedCareerPath = careerPath.replace(/[/\\]/g, path.sep);
  const resolved = path.resolve(vaultRoot, normalizedCareerPath);
  const rel = path.relative(vaultRoot, resolved);
  const normalized = rel.replace(/\\/g, "/");
  if (
    path.isAbsolute(rel) ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    throw new Error(`careerPath escapes VAULT_DIR: ${careerPath}`);
  }
  return resolved;
}

const PREFERRED = /resume|experience|skills|projects/i;

function rank(filePath: string): number {
  return PREFERRED.test(path.basename(filePath)) ? 0 : 1;
}

async function walkMarkdown(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === ".obsidian") {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkMarkdown(full)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(full);
    }
  }
  return files;
}

export async function readVaultMarkdown(
  careerDir: string,
): Promise<VaultContents> {
  const files = await walkMarkdown(careerDir);
  files.sort((a, b) => {
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) {
      return rankDiff;
    }
    return path.basename(a).localeCompare(path.basename(b));
  });
  if (files.length === 0) {
    return { empty: true, text: "" };
  }
  let text = "";
  for (const file of files) {
    const relativePath = path
      .relative(careerDir, file)
      .split(path.sep)
      .join("/");
    const body = await readFile(file, "utf8");
    const chunk = `## ${relativePath}\n${body}\n`;
    if (text.length + chunk.length > CAREER_TEXT_CAP) {
      text += chunk.slice(0, CAREER_TEXT_CAP - text.length);
      break;
    }
    text += chunk;
  }
  return { empty: false, text };
}
