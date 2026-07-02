import { execSync } from 'node:child_process';
import path from 'node:path';
import { findRootSync } from '@manypkg/find-root';
import type { Package } from '@manypkg/get-packages';
import { getPackages } from '@manypkg/get-packages';
import type { PackageJSON } from '@manypkg/tools';
import fs from 'fs-extra';
import { globby } from 'globby';
import set from 'lodash/set';
import type { ExportMapResult } from './common';
import { formatPackageJson } from './format-package-json';

export type { PackageJSON } from '@manypkg/tools';

interface PublishConfigType {
  registry?: string;
  access?: string;
  tag?: string;
  directory?: string;
}

interface PackagerConfig {
  /** Root directory of the monorepo. If not provided, will be auto-detected */
  rootDir?: string;
  /** Git branch to use for version bumps, defaults to 'dev' */
  gitBranch?: string;
  /** GitHub repository URL for release notes */
  githubRepoUrl?: string;

  /** Whether to skip git checks, defaults to false */
  skipGitChecks?: boolean;
  /** Default documentation directory */
  docsDir?: string;
  /** Distribution directory name, defaults to 'dist' */
  distDir?: string;
  /** Source directory name, defaults to 'src' */
  srcDir?: string;
  /** Package.json field to store tsup entry config, defaults to 'bangleConfig.tsupEntry' */
  tsupEntryField?: string;
  /** Glob patterns to ignore when generating tsup config */
  tsupIgnorePatterns?: string[];

  /**
   * When true, no changes are actually written to the filesystem or run as shell commands.
   * This is a "dry run" mode for planning and debugging.
   */
  dry?: boolean;
}

interface PublishConfig {
  /** Whether to clean up after publishing */
  cleanup?: boolean;
  /** Additional files to include in the package */
  additionalFiles?: string[];
  /**
   * Optional override for the publish command (e.g. "pnpm publish", "yarn publish").
   * By default, "npm publish" is used.
   */
  publishCommand?: string;
}

class Packager {
  private config: Required<Omit<PackagerConfig, 'dry'>> & { dry: boolean };
  public packages: Package[] = [];
  private initialized = false;
  private root: ReturnType<typeof findRootSync>;

  /**
   * In dry mode, all file read/write operations can be done against this memoryFS
   * instead of the real file system.
   */
  private memoryFS: Record<string, any> = {};

  /**
   * Clears the memory filesystem in dry run mode
   */
  private clearMemoryFS(): void {
    if (this.config.dry) {
      this.memoryFS = {};
    }
  }

  constructor(config: PackagerConfig) {
    this.root = findRootSync(config.rootDir || process.cwd());

    this.config = {
      gitBranch: 'dev',
      githubRepoUrl: 'https://github.com/bangle-io/nalanda',
      skipGitChecks: false,
      docsDir: 'docs',
      distDir: 'dist',
      srcDir: 'src',
      tsupEntryField: 'bangleConfig.tsupEntry',
      tsupIgnorePatterns: [
        '**/__tests__/**',
        '**/*.{spec,test}.{ts,tsx}',
        '**/.*/**',
      ],
      rootDir: this.root.rootDir,
      dry: config.dry ?? false, // default is false
      ...config,
    };
  }

  public async init() {
    if (this.initialized) {
      return this;
    }

    const result = await getPackages(this.config.rootDir);
    this.packages = result.packages;
    this.initialized = true;

    return this;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        'Packager must be initialized before use. Call init() first.',
      );
    }
  }

  // =====================================================
  //                DRY-RUN FS HELPERS
  // =====================================================

  /**
   * Validates a file path to prevent path traversal
   */
  private validatePath(filePath: string): void {
    const normalizedPath = path.normalize(filePath);
    const resolvedPath = path.resolve(this.config.rootDir, normalizedPath);

    if (!resolvedPath.startsWith(this.config.rootDir)) {
      throw new Error(
        `Invalid path: ${filePath} attempts to access outside of root directory`,
      );
    }
  }

  /**
   * Read a JSON file. In dry mode, reads from memory if it exists;
   * otherwise it loads from disk and caches it to memory.
   */
  private async readFileJson(filePath: string): Promise<any> {
    this.validatePath(filePath);

    if (this.config.dry && this.memoryFS[filePath] !== undefined) {
      // In dry mode, return the cached version if present
      return this.memoryFS[filePath];
    }

    // Otherwise, read from filesystem
    const data = await fs.readJson(filePath);
    if (this.config.dry) {
      this.memoryFS[filePath] = data; // cache it in memory
    }
    return data;
  }

  /**
   * Write JSON data to a file. In dry mode, we only log and
   * update the memoryFS instead of actually writing to disk.
   */
  private async writeFileJson(filePath: string, data: any): Promise<void> {
    this.validatePath(filePath);

    if (this.config.dry) {
      this.memoryFS[filePath] = data;
      console.log(`[Dry Run] writeFileJson -> ${filePath}:`, data);
      return;
    }
    await fs.writeJson(filePath, data, { spaces: 2 });
  }

  /**
   * Check if a file exists on disk. In dry mode, checks memoryFS first.
   */
  private fileExistsSync(filePath: string): boolean {
    this.validatePath(filePath);

    if (this.config.dry) {
      // if memory has it, consider it "existing"
      if (this.memoryFS[filePath] !== undefined) {
        return true;
      }
    }
    return fs.existsSync(filePath);
  }

  /**
   * Copy a file from A to B. If in dry mode, just log the operation.
   */
  private async copyFile(source: string, destination: string): Promise<void> {
    this.validatePath(source);
    this.validatePath(destination);

    if (this.config.dry) {
      console.log(`[Dry Run] copyFile -> from ${source} to ${destination}`);
      // If the source is in memory, replicate it to the destination
      if (this.memoryFS[source] !== undefined) {
        this.memoryFS[destination] = this.memoryFS[source];
      }
      return;
    }
    await fs.copyFile(source, destination);
  }

  /**
   * Delete (unlink) a file. In dry mode, only remove it from memory.
   */
  private async unlinkFile(filePath: string): Promise<void> {
    if (this.config.dry) {
      if (this.memoryFS[filePath]) {
        console.log(`[Dry Run] unlink -> ${filePath}`);
        delete this.memoryFS[filePath];
      }
      return;
    }

    await fs.promises.unlink(filePath);
  }

  // =====================================================
  //                 CORE METHODS
  // =====================================================

  /**
   * Sets the version of all packages.
   * @param version - The new version string.
   */
  public async setVersion(version: string): Promise<void> {
    this.ensureInitialized();

    if (!isValidVersionFormat(version)) {
      throw new Error('Invalid version format.');
    }

    if (!this.config.skipGitChecks && isGitDirty()) {
      throw new Error(
        'Your git working directory has uncommitted changes. Please commit or stash them before running this script.',
      );
    }

    for (const pkg of this.packages) {
      if (pkg.packageJson.private) {
        console.log(`Skipping private package: ${pkg.packageJson.name}`);
        continue;
      }

      const packageJsonPath = path.join(pkg.dir, 'package.json');
      const packageJson = await this.readFileJson(packageJsonPath);
      packageJson.version = version;
      await this.writeFileJson(packageJsonPath, packageJson);
    }

    // If not in dry mode, do the actual git commit/tag/push
    if (!this.config.skipGitChecks && !this.config.dry) {
      try {
        execSync(
          `git checkout ${this.config.gitBranch} && git pull origin ${this.config.gitBranch}`,
          {
            cwd: this.config.rootDir,
          },
        );
        execSync(`git add -A && git commit -m "Bump version to ${version}"`, {
          cwd: this.config.rootDir,
        });
        execSync(`git tag -a v${version} -m "release v${version}"`, {
          cwd: this.config.rootDir,
        });
        execSync(`git push origin v${version}`, { cwd: this.config.rootDir });
        execSync('git push origin HEAD --tags', { cwd: this.config.rootDir });
        console.log(`Committed and tagged version ${version}.`);
        console.log(
          `Visit ${this.config.githubRepoUrl}/releases/new?tag=v${version} to add release notes.`,
        );
      } catch (error) {
        if (error instanceof Error) {
          console.error(
            'Error committing or tagging the version:',
            error.message,
          );
          throw new Error(
            `Failed to commit version ${version}: ${error.message}`,
          );
        }
        throw error;
      }
    } else if (this.config.dry) {
      console.log(
        `[Dry Run] Skipping git commit/tag/push for version ${version}`,
      );
    }
  }

  /**
   * Copies the distribution files of a package to the documentation directory.
   */
  public async copyDistToDocs(
    packageName: string,
    finalFileName: string,
    docsDir = this.config.docsDir,
  ): Promise<void> {
    this.ensureInitialized();

    const pkg = this.findPackage(packageName);
    const sourcePath = path.join(pkg.dir, this.config.distDir, 'index.mjs');
    const destinationPath = path.join(docsDir, `${finalFileName}.mjs`);

    if (this.fileExistsSync(sourcePath)) {
      await this.copyFile(sourcePath, destinationPath);
      console.log(
        `Copied ${this.config.distDir}/index.mjs from ${packageName} to ${destinationPath}`,
      );
    } else {
      throw new Error(
        `File ${this.config.distDir}/index.mjs not found in ${packageName}`,
      );
    }
  }

  /**
   * Prepare a package.json with the correct exports for publishing.
   */
  async buildPackageJsonWithExportForPublish(
    packageName: string,
    additionalFiles: string[] = [],
  ): Promise<PackageJSON> {
    const pkg = this.findPackage(packageName);
    const packageJsonPath = path.join(pkg.dir, 'package.json');
    const packageJson = await this.readFileJson(packageJsonPath);

    const topLevelItems = await this.getSrcTopLevelItems(pkg.dir);
    const allFiles = [...topLevelItems, ...additionalFiles];

    const { exports, ...other } = buildExportMap({
      outputDir: this.config.distDir,
      files: allFiles,
      isSrc: false,
      srcDir: this.config.srcDir,
    });

    return {
      ...packageJson,
      ...other,
      exports,
    };
  }

  /**
   * Prepares the package.json for publishing (but does NOT run the publish command).
   */
  public async preparePackageForPublish(
    packageName: string,
    config?: PublishConfig,
  ): Promise<void> {
    this.ensureInitialized();

    const pkg = this.findPackage(packageName);
    const packageJsonPath = path.join(pkg.dir, 'package.json');
    const publishPkgJson = await this.buildPackageJsonWithExportForPublish(
      packageName,
      config?.additionalFiles,
    );

    await this.writeFileJson(packageJsonPath, publishPkgJson);

    if (config?.cleanup) {
      await this.postPublishCleanup(packageName);
    }
  }

  /**
   * Actually publish a package to npm (or any other registry).
   * 1. Store the original package.json in memory.
   * 2. Generate a publish-friendly package.json (with correct exports, etc.).
   * 3. Use publishConfig if present in the package.json to set flags for `npm publish`.
   * 4. Revert the package.json to its original state.
   * 5. Optionally run cleanup if requested.
   */
  public async publishPackage(
    packageName: string,
    config?: PublishConfig,
  ): Promise<void> {
    this.ensureInitialized();

    const pkg = this.findPackage(packageName);

    if (pkg.packageJson.private) {
      console.log(`Skipping private package: ${packageName}`);
      return;
    }
    const packageJsonPath = path.join(pkg.dir, 'package.json');

    // 1. Read the original package.json and store it
    const originalPkgJson = await this.readFileJson(packageJsonPath);

    // 2. Build a new publish-friendly package.json
    const publishPkgJson = await this.buildPackageJsonWithExportForPublish(
      packageName,
      config?.additionalFiles,
    );

    // 3. Write the new package.json
    await this.writeFileJson(packageJsonPath, publishPkgJson);

    try {
      // 4. Actually do the publish if not in dry mode
      if (!this.config.dry) {
        const { publishConfig } = publishPkgJson;
        let publishCommand = config?.publishCommand || 'npm publish';

        // If publishConfig has extra flags, add them
        // (common keys: registry, access, tag, etc.)
        if (publishConfig && typeof publishConfig === 'object') {
          const publishConfigTyped = publishConfig as PublishConfigType;
          const { registry, access, tag } = publishConfigTyped;
          if (registry) {
            publishCommand += ` --registry=${registry}`;
          }
          if (access) {
            publishCommand += ` --access=${access}`;
          }
          if (tag) {
            publishCommand += ` --tag ${tag}`;
          }
        }

        console.log(`Running "${publishCommand}" in ${pkg.dir}...`);
        execSync(publishCommand, { cwd: pkg.dir, stdio: 'inherit' });
      } else {
        console.log(
          `[Dry Run] Would run npm publish (or ${config?.publishCommand ?? 'npm publish'}) from ${pkg.dir}`,
        );
      }
    } finally {
      // 5. Revert package.json to its original content
      await this.writeFileJson(packageJsonPath, originalPkgJson);

      // 6. If cleanup is requested, do it after the revert
      if (config?.cleanup) {
        await this.postPublishCleanup(packageName);
      }
      this.clearMemoryFS();
    }
  }

  private findPackage(packageName: string): Package {
    const pkg = this.packages.find((p) => p.packageJson.name === packageName);
    if (!pkg) {
      throw new Error(`Package ${packageName} not found.`);
    }
    return pkg;
  }

  /**
   * Cleans up after publishing a package.
   */
  public async postPublishCleanup(packageName: string): Promise<void> {
    this.ensureInitialized();

    const pkg = this.findPackage(packageName);
    const readmePath = path.join(pkg.dir, 'README.md');

    if (this.fileExistsSync(readmePath)) {
      await this.unlinkFile(readmePath);
    }

    await this.revertPackageJsonToWorkspace(packageName);
  }

  /**
   * Reverts the package.json dependencies back to workspace:*.
   */
  private async revertPackageJsonToWorkspace(
    packageName: string,
  ): Promise<void> {
    const pkg = this.findPackage(packageName);
    const packageJsonPath = path.join(pkg.dir, 'package.json');
    const packageJson = await this.readFileJson(packageJsonPath);

    const dependencies: Record<string, string> = {};
    for (const [depName, depVersion] of Object.entries(
      packageJson.dependencies || {},
    )) {
      if (
        this.packages.some((p) => p.packageJson.name === depName) &&
        depVersion === pkg.packageJson.version
      ) {
        dependencies[depName] = 'workspace:*';
      } else {
        dependencies[depName] = depVersion as string;
      }
    }

    const updatedPackageJson = {
      ...packageJson,
      dependencies,
    };

    await this.writeFileJson(packageJsonPath, updatedPackageJson);
  }

  /**
   * Generates package.json "exports" for TSUP
   */
  public async generateTsupEntry(
    packageName: string,
  ): Promise<Record<string, string>> {
    this.ensureInitialized();

    const pkg = this.findPackage(packageName);
    const srcDir = path.join(pkg.dir, this.config.srcDir);

    const files = await globby(['**/*.{ts,tsx}'], {
      cwd: srcDir,
      ignore: this.config.tsupIgnorePatterns,
      absolute: false,
    });

    const topLevelFiles = files.filter(isTopLevelItem);

    const tsupEntry: Record<string, string> = Object.fromEntries(
      topLevelFiles
        .map((file) => {
          let entryKey: string;
          const fullPath = path.join(this.config.srcDir, file);

          if (isTopLevelIndexFile(file)) {
            entryKey = 'index';
          } else {
            const parsedPath = path.parse(file);
            entryKey = parsedPath.dir || parsedPath.name;
          }

          return [entryKey, fullPath] as const;
        })
        .sort(([aKey], [bKey]) => {
          if (aKey === 'index') return -1;
          if (bKey === 'index') return 1;
          return aKey.localeCompare(bKey);
        }),
    );

    const packageJsonPath = path.join(pkg.dir, 'package.json');
    const packageJson = await this.readFileJson(packageJsonPath);

    set(packageJson, this.config.tsupEntryField, tsupEntry);

    await this.writeFileJson(packageJsonPath, formatPackageJson(packageJson));

    return tsupEntry;
  }

  /**
   * Formats and standardizes package.json field ordering
   */
  public async standardizePackageJson(packageName: string): Promise<void> {
    this.ensureInitialized();

    const pkg = this.findPackage(packageName);
    const packageJsonPath = path.join(pkg.dir, 'package.json');
    const packageJson = await this.readFileJson(packageJsonPath);

    await this.writeFileJson(packageJsonPath, formatPackageJson(packageJson));
  }

  /**
   * Updates the export map in package.json to use the source directory.
   */
  public async updateExportMapToSrc(packageName: string): Promise<void> {
    this.ensureInitialized();

    const pkg = this.findPackage(packageName);
    const packageJsonPath = path.join(pkg.dir, 'package.json');
    const topLevelItems = await this.getSrcTopLevelItems(pkg.dir);
    const packageJson = await this.readFileJson(packageJsonPath);

    const { exports, ...others } = buildExportMap({
      outputDir: this.config.srcDir,
      files: topLevelItems,
      isSrc: true,
      srcDir: this.config.srcDir,
    });

    const updatedPkgJson = {
      ...packageJson,
      ...others,
      exports,
    };

    console.log(updatedPkgJson);
    await this.writeFileJson(packageJsonPath, updatedPkgJson);
    console.log(`Updated package.json exports to use src for ${packageName}`);
  }

  //   returns top level files and directories in src dir
  private async getSrcTopLevelItems(pkgDir: string): Promise<string[]> {
    const topLevelFiles = await globby('**/*.{ts,tsx}', {
      cwd: path.join(pkgDir, this.config.srcDir),
      ignore: this.config.tsupIgnorePatterns,
    });
    const result = topLevelFiles.filter(isTopLevelItem);
    return result;
  }
}

// ============================================================================
//                                Helpers
// ============================================================================

function isValidVersionFormat(version: string): boolean {
  const regex = /^\d+\.\d+\.\d+(-[\w.]+)?$/;
  return regex.test(version);
}

function isGitDirty(): boolean {
  const output = execSync('git status --porcelain').toString();
  return !!output.trim();
}

// foo.ts -> true
// index.ts -> true
// foo/bar.ts -> false
// foo/index.ts -> true
// foo/bar/index.ts -> false
function isTopLevelItem(filePath: string): boolean {
  return (
    !filePath.includes('/') ||
    (filePath.split('/').length === 2 &&
      (filePath.endsWith('/index.ts') || filePath.endsWith('/index.tsx')))
  );
}

function isTopLevelIndexFile(filePath: string): boolean {
  return filePath === 'index.ts' || filePath === 'index.tsx';
}

interface ExportMapConfig {
  /** The output directory for the files (e.g. 'dist' or 'src') */
  outputDir: string;
  /** The files to include in the export map */
  files: string[];
  /** Whether to use source directory extensions */
  isSrc: boolean;
  /** The source directory */
  srcDir: string;
}

function buildExportMap(config: ExportMapConfig): ExportMapResult {
  const { outputDir, isSrc, srcDir } = config;

  const files = [...config.files].sort((a, b) => a.localeCompare(b));
  const hasTopLevelIndex =
    files.includes('index.ts') || files.includes('index.tsx');

  if (isSrc) {
    return {
      main: hasTopLevelIndex ? `./${srcDir}/index.ts` : '',
      exports: Object.fromEntries(
        files.map((file) => {
          const parsedPath = path.parse(file);
          const key = parsedPath.dir || parsedPath.name;
          const result = [`./${key}`, `./${srcDir}/${file}`];
          return result;
        }),
      ),
    };
  }

  const rootExports = {
    main: hasTopLevelIndex ? `${outputDir}/index.js` : '',
    module: hasTopLevelIndex ? `${outputDir}/index.mjs` : '',
    types: hasTopLevelIndex ? `${outputDir}/index.d.ts` : '',
  };

  const exportMap: Record<
    string,
    | string
    | {
        types: string;
        import: string;
        require: string;
      }
  > = {
    ...(hasTopLevelIndex && {
      '.': {
        types: `./${outputDir}/index.d.ts`,
        import: `./${outputDir}/index.mjs`,
        require: `./${outputDir}/index.js`,
      },
    }),
    './package.json': './package.json',
  };

  files
    .filter((file) => file !== 'index.ts' && file !== 'index.tsx')
    .forEach((file) => {
      const parsedPath = path.parse(file);
      const key = parsedPath.dir || parsedPath.name;
      exportMap[`./${key}`] = {
        types: `./${outputDir}/${key}.d.ts`,
        import: `./${outputDir}/${key}.mjs`,
        require: `./${outputDir}/${key}.js`,
      };
    });

  return { ...rootExports, exports: exportMap };
}

export { Packager, type PackagerConfig, type PublishConfig };
