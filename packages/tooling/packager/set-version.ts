import path from 'node:path';
import { getPackages } from '@manypkg/get-packages';
import type { MonorepoRoot, Package } from '@manypkg/tools';
import fs from 'fs-extra';
import { execa } from './execa';

interface SetVersionConfig {
  /**
   * Whether to skip git checks and operations
   */
  skipGitChecks?: boolean;
  /**
   * Git branch to use for version bumps
   */
  gitBranch: string;
  /**
   * GitHub repository URL for release notes
   */
  githubRepoUrl: string;
  /**
   * When true, no changes are actually written to the filesystem or run as shell commands
   */
  dry?: boolean;
}

interface SetVersionContext {
  root: MonorepoRoot;
  config: Required<SetVersionConfig>;
}

/**
 * Validates version string format (e.g., "1.0.0" or "1.0.0-beta.1")
 */
function validateVersion(version: string): boolean {
  const regex = /^\d+\.\d+\.\d+(-[\w.]+)?$/;
  return regex.test(version);
}

/**
 * Checks if git working directory has uncommitted changes
 */
async function isGitDirty(cwd: string): Promise<boolean> {
  const { stdout } = await execa('git', ['status', '--porcelain'], { cwd });
  return !!stdout.trim();
}

/**
 * Updates package.json version for a single package
 */
async function updatePackageVersion(
  pkg: Package,
  version: string,
  dry: boolean,
): Promise<void> {
  if (pkg.packageJson.private) {
    console.log(`Skipping private package: ${pkg.packageJson.name}`);
    return;
  }

  const packageJsonPath = path.join(pkg.dir, 'package.json');
  const packageJson = await fs.readJson(packageJsonPath);
  const oldVersion = packageJson.version;

  packageJson.version = version;

  if (!dry) {
    if (oldVersion !== version) {
      await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
    } else {
      console.log(
        `Skipping ${packageJson.name} as version is already ${version}`,
      );
    }
  } else {
    console.log(
      `[Dry Run] Would update ${packageJson.name} to version ${version}`,
    );
  }
}

/**
 * Handles git operations for version update
 */
async function handleGitOperations(
  ctx: SetVersionContext,
  version: string,
): Promise<void> {
  const { root, config } = ctx;
  const { gitBranch, dry, githubRepoUrl } = config;

  if (dry) {
    console.log(
      `[Dry Run] Would perform git operations for version ${version}`,
    );
    return;
  }

  try {
    // Checkout and pull latest
    await execa('git', ['checkout', gitBranch], { cwd: root.rootDir });
    await execa('git', ['pull', 'origin', gitBranch], { cwd: root.rootDir });

    // Commit changes
    await execa('git', ['add', '-A'], { cwd: root.rootDir });
    await execa('git', ['commit', '-m', `Bump version to ${version}`], {
      cwd: root.rootDir,
    });

    // Create and push tag
    await execa(
      'git',
      ['tag', '-a', `v${version}`, '-m', `release v${version}`],
      {
        cwd: root.rootDir,
      },
    );
    await execa('git', ['push', 'origin', `v${version}`], {
      cwd: root.rootDir,
    });
    await execa('git', ['push', 'origin', 'HEAD', '--tags'], {
      cwd: root.rootDir,
    });

    console.log(`Committed and tagged version ${version}.`);
    console.log(
      `Visit ${githubRepoUrl}/releases/new?tag=v${version} to add release notes.`,
    );
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error performing git operations:', error.message);
    }
    throw error;
  }
}

/**
 * Sets the version across all packages in a monorepo
 */
export async function setVersion(
  root: MonorepoRoot,
  version: string,
  config: SetVersionConfig,
): Promise<void> {
  // Validate inputs and setup
  if (!validateVersion(version)) {
    throw new Error(
      'Invalid version format. Expected format: X.Y.Z or X.Y.Z-tag.N',
    );
  }

  const resolvedConfig = {
    skipGitChecks: false,
    dry: false,
    ...config,
  };

  const ctx: SetVersionContext = {
    root,
    config: resolvedConfig,
  };

  // Check git status if needed
  if (!resolvedConfig.skipGitChecks && (await isGitDirty(root.rootDir))) {
    throw new Error(
      'Git working directory has uncommitted changes. Please commit or stash them before proceeding.',
    );
  }

  // Update versions in all packages
  await Promise.all(
    (await getPackages(root.rootDir)).packages.map((pkg) =>
      updatePackageVersion(pkg, version, resolvedConfig.dry),
    ),
  );

  // Handle git operations if not skipped
  if (!resolvedConfig.skipGitChecks) {
    await handleGitOperations(ctx, version);
  }
}
