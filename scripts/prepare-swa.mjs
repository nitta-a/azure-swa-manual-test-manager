import { cp, mkdir, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const tenantId = process.env.AZURE_TENANT_ID;
if (!tenantId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
  throw new Error("AZURE_TENANT_ID must be the Entra tenant UUID");
}
const config = JSON.parse(await readFile("staticwebapp.config.json", "utf8"));
config.auth.identityProviders.azureActiveDirectory.registration.openIdIssuer = `https://login.microsoftonline.com/${tenantId}/v2.0`;
await mkdir(".artifacts/web");
await cp("apps/web/dist", ".artifacts/web", { recursive: true });
await writeFile(".artifacts/web/staticwebapp.config.json", `${JSON.stringify(config, null, 2)}\n`);
const apiRoot = resolve(".artifacts/api");
const apiPackage = JSON.parse(await readFile(resolve(apiRoot, "package.json"), "utf8"));
await readFile(resolve(apiRoot, apiPackage.main));
await readFile(resolve(apiRoot, "host.json"));
for (const dependency of Object.keys(apiPackage.dependencies).filter((name) =>
  name.startsWith("@manual-test-manager/"),
)) {
  const pkg = JSON.parse(await readFile(resolve(apiRoot, "node_modules", dependency, "package.json"), "utf8"));
  await readFile(resolve(apiRoot, "node_modules", dependency, pkg.exports["."].import));
}
await verifyDependencyLinks(resolve(apiRoot, "node_modules"));

async function verifyDependencyLinks(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) {
      const target = await realpath(path);
      if (!target.startsWith(`${apiRoot}/`)) throw new Error(`dependency link escapes API artifact: ${path}`);
    } else if (entry.isDirectory()) {
      await verifyDependencyLinks(path);
    }
  }
}
