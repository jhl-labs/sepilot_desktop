import { fileURLToPath } from 'node:url'
import { lstat, readFile, readdir, rm } from 'node:fs/promises'
import { basename, join, relative, sep } from 'node:path'

const NON_SHIPPING_RUNTIME_TEST_PACKAGES = Object.freeze(['ssh2', 'tar-fs', 'thread-stream'])
const FORBIDDEN_PRIVATE_KEY_NAMES = [
  /^id_(?:rsa|ed25519|ecdsa|dsa)$/iu,
  /^ssh_host_(?:rsa|ed25519|ecdsa|dsa)_key$/iu,
  /\.(?:key|p12|pfx|ppk|keystore|jks)$/iu,
]
const FORBIDDEN_RELEASE_FILE_NAMES = [
  /^\.env(?:\..*)?$/iu,
  /^\.npmrc$/iu,
  /^\.yarnrc(?:\.ya?ml)?$/iu,
  /^config\.ya?ml$/iu,
  /^(?:service[-_]?account|credentials?|credential[-_]?store).*\.json$/iu,
]
const MAX_PRIVATE_KEY_TEXT_BYTES = 2 * 1024 * 1024
const PRIVATE_KEY_BLOCK =
  /(?:^|\r?\n)-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----\r?\n[\s\S]{8,}?\r?\n-----END (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----(?:\r?\n|$)/u
const PGP_PRIVATE_KEY_BLOCK =
  /(?:^|\r?\n)-----BEGIN PGP PRIVATE KEY BLOCK-----\r?\n[\s\S]{8,}?\r?\n-----END PGP PRIVATE KEY BLOCK-----(?:\r?\n|$)/u

function slash(path) {
  return path.split(sep).join('/')
}

function hasForbiddenPrivateKeyName(path) {
  const name = basename(path)
  return FORBIDDEN_PRIVATE_KEY_NAMES.some((pattern) => pattern.test(name))
}

function hasForbiddenReleaseFileName(path) {
  const name = basename(path)
  return FORBIDDEN_RELEASE_FILE_NAMES.some((pattern) => pattern.test(name))
}

function containsPrivateKeyBlock(bytes) {
  if (bytes.includes(0)) return false
  const text = bytes.toString('utf8')
  if (!Buffer.from(text, 'utf8').equals(bytes)) return false
  return PRIVATE_KEY_BLOCK.test(text) || PGP_PRIVATE_KEY_BLOCK.test(text)
}

export async function pruneThirdPartyRuntimeFixtures(runtimeRoots) {
  for (const runtimeRoot of runtimeRoots) {
    for (const packageName of NON_SHIPPING_RUNTIME_TEST_PACKAGES) {
      await rm(join(runtimeRoot, 'node_modules', packageName, 'test'), {
        recursive: true,
        force: true,
      })
    }
  }
}

export async function findForbiddenPrivateKeyFiles(root) {
  const findings = []

  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isSymbolicLink()) {
        throw new Error(
          `portable release scan cannot inspect symbolic link: ${slash(relative(root, path))}`,
        )
      }
      if (entry.isDirectory()) {
        await walk(path)
        continue
      }
      if (!entry.isFile()) continue

      if (hasForbiddenPrivateKeyName(path)) {
        findings.push(slash(relative(root, path)))
        continue
      }

      const metadata = await lstat(path)
      if (metadata.size > MAX_PRIVATE_KEY_TEXT_BYTES) continue
      const bytes = await readFile(path)
      if (containsPrivateKeyBlock(bytes)) findings.push(slash(relative(root, path)))
    }
  }

  await walk(root)
  return findings.sort()
}

async function loadSecretScanner() {
  const scannerUrl = new URL('../../sepilot-cli/packages/bundle/scripts/secret-scan.ts', import.meta.url)
  let module
  try {
    module = await import(scannerUrl.href)
  } catch (error) {
    if (error.code !== 'ERR_UNKNOWN_FILE_EXTENSION') throw error
    const { build } = await import('esbuild')
    const bundled = await build({ entryPoints: [fileURLToPath(scannerUrl)], bundle: true,
      platform: 'node', format: 'esm', write: false, sourcemap: false })
    module = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`)
  }
  if (typeof module.scanArtifactBytes !== 'function') {
    throw new Error('release secret scanner does not export scanArtifactBytes')
  }
  return module.scanArtifactBytes
}

export async function assertSafeReleaseTree(root) {
  const scanArtifactBytes = await loadSecretScanner()
  const findings = []

  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      const relativePath = slash(relative(root, path))
      if (entry.isSymbolicLink()) {
        findings.push(`${relativePath}: symbolic link survived release staging`)
        continue
      }
      if (entry.isDirectory()) {
        await walk(path)
        continue
      }
      if (!entry.isFile()) continue

      if (hasForbiddenPrivateKeyName(path) || hasForbiddenReleaseFileName(path)) {
        findings.push(`${relativePath}: forbidden credential/config filename`)
        continue
      }

      const bytes = await readFile(path)
      const result = scanArtifactBytes(bytes, relativePath)
      if (!result.ok) findings.push(...result.findings)
    }
  }

  await walk(root)
  if (findings.length > 0) {
    throw new Error(`release tree safety scan failed:\n${findings.map((item) => `  ${item}`).join('\n')}`)
  }
}

export async function assertNoForbiddenPrivateKeyFiles(root) {
  const findings = await findForbiddenPrivateKeyFiles(root)
  if (findings.length > 0) {
    throw new Error(
      `portable release contains forbidden private-key file(s):\n${findings.map((path) => `  ${path}`).join('\n')}`,
    )
  }
}

export const __testables = {
  FORBIDDEN_RELEASE_FILE_NAMES,
  NON_SHIPPING_RUNTIME_TEST_PACKAGES,
  containsPrivateKeyBlock,
  hasForbiddenReleaseFileName,
  hasForbiddenPrivateKeyName,
}
