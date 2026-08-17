import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CAREER_TEXT_CAP } from "../src/constants.js";
import { readVaultMarkdown, resolveCareerDir } from "../src/vault.js";

describe("resolveCareerDir", () => {
  it("accepts Career/ under VAULT_DIR", () => {
    const vaultDir = mkdtempSync(path.join(tmpdir(), "pinger-vault-"));
    const resolved = resolveCareerDir(vaultDir, "Career/");
    expect(resolved).toBe(path.resolve(vaultDir, "Career/"));
  });

  it("rejects .. escape", () => {
    const vaultDir = mkdtempSync(path.join(tmpdir(), "pinger-vault-"));
    expect(() => resolveCareerDir(vaultDir, "../")).toThrow(/escapes VAULT_DIR/);
  });

  it("rejects .. escape with Windows-style and mixed separators", () => {
    const vaultDir = mkdtempSync(path.join(tmpdir(), "pinger-vault-"));
    expect(() => resolveCareerDir(vaultDir, "..\\")).toThrow(/escapes VAULT_DIR/);
    expect(() => resolveCareerDir(vaultDir, "..\\outside")).toThrow(
      /escapes VAULT_DIR/,
    );
    expect(() => resolveCareerDir(vaultDir, "../outside\\nested")).toThrow(
      /escapes VAULT_DIR/,
    );
  });

  it("rejects an absolute path outside VAULT_DIR", () => {
    const vaultDir = mkdtempSync(path.join(tmpdir(), "pinger-vault-"));
    const outside = mkdtempSync(path.join(tmpdir(), "pinger-outside-"));
    expect(() => resolveCareerDir(vaultDir, outside)).toThrow(
      /escapes VAULT_DIR/,
    );
  });
});

describe("readVaultMarkdown", () => {
  it("returns empty when the folder exists with zero markdown", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pinger-career-"));
    await expect(readVaultMarkdown(dir)).resolves.toEqual({
      empty: true,
      text: "",
    });
  });

  it("throws when the folder is missing", async () => {
    const dir = path.join(
      mkdtempSync(path.join(tmpdir(), "pinger-career-")),
      "does-not-exist",
    );
    await expect(readVaultMarkdown(dir)).rejects.toThrow();
  });

  it("caps concatenated text at CAREER_TEXT_CAP", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pinger-career-"));
    writeFileSync(path.join(dir, "resume.md"), "a".repeat(40_000));
    const result = await readVaultMarkdown(dir);
    expect(result.empty).toBe(false);
    expect(result.text.length).toBe(CAREER_TEXT_CAP);
  });

  it("skips .obsidian, ignores non-md, prefers resume-like names, and caps text", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pinger-career-"));
    mkdirSync(path.join(dir, ".obsidian"));
    mkdirSync(path.join(dir, "sub"));
    writeFileSync(path.join(dir, ".obsidian", "workspace.md"), "SECRET vault config");
    writeFileSync(path.join(dir, "notes.txt"), "ignore me");
    writeFileSync(path.join(dir, "zzz.md"), "zzz body");
    writeFileSync(path.join(dir, "resume.md"), "resume body");
    writeFileSync(path.join(dir, "sub", "skills.md"), "skills body");

    const result = await readVaultMarkdown(dir);
    expect(result.empty).toBe(false);
    expect(result.text).toContain("## resume.md");
    expect(result.text).toContain("resume body");
    expect(result.text).toContain("## sub/skills.md");
    expect(result.text.indexOf("## resume.md")).toBeLessThan(
      result.text.indexOf("## zzz.md"),
    );
    expect(result.text).not.toContain("SECRET vault config");
    expect(result.text).not.toContain("ignore me");
  });
});
