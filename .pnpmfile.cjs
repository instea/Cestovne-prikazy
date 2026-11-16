// pnpm install hooks.
//
// @nestjs/swagger declares `typescript` as an optional peer, used only by its
// compile-time CLI plugin (apps/api/nest-cli.json does not enable it). Because
// the workspace has typescript as a dev tool, pnpm links it to that peer and
// `pnpm deploy --prod` then ships typescript in the production image
// (OPS-03: no devDependencies at runtime, apps/api/test/ops/image.int-spec.ts).
// Dropping the optional peer keeps the runtime graph production-only.
function readPackage(pkg) {
  if (pkg.name === '@nestjs/swagger') {
    if (pkg.peerDependencies) delete pkg.peerDependencies.typescript;
    if (pkg.peerDependenciesMeta) delete pkg.peerDependenciesMeta.typescript;
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };
