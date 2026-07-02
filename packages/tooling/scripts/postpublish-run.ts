import {
  buildSrcExportMap,
  copyReadMe,
  currentPublishingPkgName,
  findRoot,
} from '@bangle.dev/packager';
import { getPackages } from '@manypkg/get-packages';
import fs from 'fs-extra';

async function main() {
  const root = await findRoot(process.cwd());
  const pkg = (await getPackages(root.rootDir)).packages.find(
    (pkg) => pkg.packageJson.name === currentPublishingPkgName,
  );
  if (!pkg) {
    throw new Error(
      `Package ${currentPublishingPkgName} not found in ${root.rootDir}`,
    );
  }

  fs.ensureDirSync(`${pkg.dir}/dist`);
  const readMe = await copyReadMe(pkg, root);
  await readMe.postpublish();

  await buildSrcExportMap(`${pkg.dir}/src`, pkg, true);

  console.log('Done publishing package name', currentPublishingPkgName);
}

main();
