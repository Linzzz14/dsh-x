/**
 * A README that points at an image the package does not ship renders as a
 * broken image anywhere the packaged copy is shown. Keep the two in sync.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

// npm always includes these regardless of the `files` list.
const ALWAYS_INCLUDED = /^(package\.json|readme(\..*)?|licen[cs]e(\..*)?|changelog(\..*)?)$/i;

function isShipped(path) {
  if (ALWAYS_INCLUDED.test(path)) return true;
  return pkg.files.some((entry) => path === entry || path.startsWith(`${entry}/`));
}

function imageRefs(markdown) {
  const refs = [];
  for (const match of markdown.matchAll(/<img[^>]+src="([^"]+)"/g)) refs.push(match[1]);
  for (const match of markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) refs.push(match[1]);
  return refs.filter((ref) => !/^(?:[a-z]+:)?\/\//i.test(ref));
}

test("README images exist and ship with the package", () => {
  for (const readme of ["README.md", "README.en.md"]) {
    const refs = imageRefs(readFileSync(resolve(root, readme), "utf8"));
    assert.ok(refs.length > 0, `${readme} references no images`);
    for (const ref of refs) {
      assert.ok(existsSync(resolve(root, ref)), `${readme}: ${ref} is missing`);
      assert.ok(isShipped(ref), `${readme}: ${ref} is not covered by package.json "files"`);
    }
  }
});
