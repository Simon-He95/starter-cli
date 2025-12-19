import type { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import process from 'node:process'
import * as p from '@simon_he/clack-prompts'
import color from 'picocolors'
import { template } from './template.js'
import { username } from './user.js'

interface RunOptions {
  cwd?: string
  stdio?: 'inherit' | 'pipe' | 'tee'
}

interface CliFlags {
  help: boolean
  listTemplates: boolean
  version: boolean
  json: boolean
  force: boolean
  packageManager?: string
  template?: string
  name?: string
  rootDir?: string
  noInstall: boolean
  noOpen: boolean
  noGum: boolean
  noClear: boolean
  dryRun: boolean
  noUpdateName: boolean
}

class CliExit extends Error {
  exitCode: number
  alreadyShown: boolean
  constructor(message: string, exitCode = 1, alreadyShown = false) {
    super(message)
    this.exitCode = exitCode
    this.alreadyShown = alreadyShown
  }
}

function isRelativePath(value?: string) {
  return Boolean(
    value
    && (value === '.' || value.startsWith('./') || value.startsWith('../')),
  )
}

function validateProjectName(value: string) {
  const name = value.trim()
  if (!name)
    return 'Please enter a name.'
  if (name === '.' || name === '..')
    return 'Project name cannot be . or ..'
  if (/[\\/]/.test(name))
    return 'Project name cannot contain path separators.'
}

function toNpmPackageName(projectName: string) {
  const normalized = projectName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-._~]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+/, '')
    .replace(/[._-]+$/, '')

  if (!normalized)
    return null

  if (!/^[a-z0-9][a-z0-9-._~]*$/.test(normalized))
    return null

  return normalized
}

function fail(message: string, exitCode = 1): never {
  p.cancel(message)
  throw new CliExit(message, exitCode, true)
}

function printHelp() {
  console.log(`
Usage:
  simon [name] [path]

Options:
  -h, --help              Show help
  -t, --template <id>     Template id (e.g. vitesse, starter-ts)
  -p, --path <dir>        Relative directory to create in (e.g. ./projects)
  --pm, --package-manager <name>  Package manager (pi|ni|pnpm|npm|yarn|bun)
  -l, --list-templates    Print template ids and exit
  -v, --version           Print version and exit
  --json                  Output JSON (for list/version/dry-run)
  --force                 Pass --force to degit
  --dry-run               Print commands, do nothing
  --no-install            Skip installing dependencies
  --no-open               Skip opening VSCode
  --no-gum                Skip gum banner
  --no-clear              Do not clear screen
  --no-update-name         Do not update package.json name
`)
}

function printVersion() {
  try {
    const require = createRequire(import.meta.url)
    const pkg = require('../package.json') as { version?: string }

    console.log(pkg.version || '')
  }
  catch {
    console.log('')
  }
}

function printVersionJson() {
  try {
    const require = createRequire(import.meta.url)
    const pkg = require('../package.json') as { version?: string }
    console.log(JSON.stringify({ version: pkg.version || '' }))
  }
  catch {
    console.log(JSON.stringify({ version: '' }))
  }
}

function printTemplatesJson() {
  console.log(JSON.stringify(template))
}

function printTemplates() {
  console.log(template.map(t => `${t.value}\t${t.label}`).join('\n'))
}

function parseArgs(argv = process.argv.slice(2)): CliFlags {
  const flags: CliFlags = {
    help: false,
    listTemplates: false,
    version: false,
    json: false,
    force: false,
    noInstall: false,
    noOpen: false,
    noGum: false,
    noClear: false,
    dryRun: false,
    noUpdateName: false,
  }

  const positional: string[] = []

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]

    if (!arg)
      continue

    if (arg === '--') {
      positional.push(...argv.slice(index + 1))
      break
    }

    if (arg.startsWith('--pm=')) {
      flags.packageManager = arg.slice('--pm='.length)
      continue
    }
    if (arg.startsWith('--package-manager=')) {
      flags.packageManager = arg.slice('--package-manager='.length)
      continue
    }
    if (arg.startsWith('--template=')) {
      flags.template = arg.slice('--template='.length)
      continue
    }
    if (arg.startsWith('--path=')) {
      flags.rootDir = arg.slice('--path='.length)
      continue
    }

    if (arg === '-h' || arg === '--help') {
      flags.help = true
      continue
    }
    if (arg === '-l' || arg === '--list-templates') {
      flags.listTemplates = true
      continue
    }
    if (arg === '-v' || arg === '--version') {
      flags.version = true
      continue
    }
    if (arg === '--json') {
      flags.json = true
      continue
    }
    if (arg === '--force') {
      flags.force = true
      continue
    }
    if (arg === '--dry-run') {
      flags.dryRun = true
      continue
    }
    if (arg === '--no-clear') {
      flags.noClear = true
      continue
    }
    if (arg === '--no-update-name') {
      flags.noUpdateName = true
      continue
    }
    if (arg === '--pm' || arg === '--package-manager') {
      const value = argv[index + 1]
      if (value && !value.startsWith('-')) {
        flags.packageManager = value
        index++
      }
      continue
    }
    if (arg === '--no-install') {
      flags.noInstall = true
      continue
    }
    if (arg === '--no-open') {
      flags.noOpen = true
      continue
    }
    if (arg === '--no-gum') {
      flags.noGum = true
      continue
    }
    if (arg === '-t' || arg === '--template') {
      const value = argv[index + 1]
      if (value && !value.startsWith('-')) {
        flags.template = value
        index++
      }
      continue
    }
    if (arg === '-p' || arg === '--path') {
      const value = argv[index + 1]
      if (value && !value.startsWith('-')) {
        flags.rootDir = value
        index++
      }
      continue
    }

    positional.push(arg)
  }

  const arg1 = positional[0]
  const arg2 = positional[1]

  const initialRootDir = isRelativePath(arg1)
    ? arg1
    : isRelativePath(arg2)
      ? arg2
      : undefined
  const initialName = !isRelativePath(arg1)
    ? arg1
    : !isRelativePath(arg2)
        ? arg2
        : undefined

  flags.name = flags.name ?? initialName
  flags.rootDir = flags.rootDir ?? initialRootDir

  return flags
}

async function run(
  command: string,
  args: string[],
  options: RunOptions = {},
): Promise<{ exitCode: number, stdout: string, stderr: string }> {
  const { cwd, stdio = 'inherit' } = options
  const candidates = (() => {
    if (process.platform !== 'win32')
      return [command]
    if (command.includes('.'))
      return [command]
    return [command, `${command}.cmd`, `${command}.exe`, `${command}.bat`]
  })()

  for (const candidate of candidates) {
    const result = await new Promise<{
      exitCode: number
      stdout: string
      stderr: string
    }>((resolvePromise) => {
      const child
        = stdio === 'inherit'
          ? spawn(candidate, args, { cwd, stdio: 'inherit', shell: false })
          : spawn(candidate, args, {
              cwd,
              stdio: ['ignore', 'pipe', 'pipe'],
              shell: false,
            })

      let stdout = ''
      let stderr = ''

      if (stdio === 'pipe' || stdio === 'tee') {
        child.stdout?.on('data', (chunk: Buffer) => {
          const text = chunk.toString()
          stdout += text
          if (stdio === 'tee')
            process.stdout.write(text)
        })
        child.stderr?.on('data', (chunk: Buffer) => {
          const text = chunk.toString()
          stderr += text
          if (stdio === 'tee')
            process.stderr.write(text)
        })
      }

      child.on('error', (error: any) => {
        const message = error?.message ? String(error.message) : String(error)
        resolvePromise({ exitCode: 127, stdout: '', stderr: message })
      })
      child.on('close', (code: number | null) => {
        resolvePromise({ exitCode: code ?? 0, stdout, stderr })
      })
    })

    if (!(process.platform === 'win32' && result.exitCode === 127))
      return result
  }

  return { exitCode: 127, stdout: '', stderr: `Command not found: ${command}` }
}

interface Installer {
  label: string
  command: string
  args: string[]
  versionArgs: string[]
}

async function pickInstaller(override?: string): Promise<Installer> {
  const known: Record<string, Installer> = {
    pi: { label: 'pi', command: 'pi', args: [], versionArgs: ['-v'] },
    ni: { label: 'ni', command: 'ni', args: [], versionArgs: ['-v'] },
    pnpm: {
      label: 'pnpm',
      command: 'pnpm',
      args: ['install'],
      versionArgs: ['-v'],
    },
    npm: {
      label: 'npm',
      command: 'npm',
      args: ['install'],
      versionArgs: ['-v'],
    },
    yarn: {
      label: 'yarn',
      command: 'yarn',
      args: ['install'],
      versionArgs: ['-v'],
    },
    bun: {
      label: 'bun',
      command: 'bun',
      args: ['install'],
      versionArgs: ['-v'],
    },
  }

  if (override) {
    const key = override.trim().toLowerCase()
    const installer = known[key]
    if (!installer) {
      fail(
        `Unknown package manager: ${override}. Use one of: ${Object.keys(
          known,
        ).join(', ')}`,
      )
    }

    const { exitCode } = await run(installer.command, installer.versionArgs, {
      stdio: 'pipe',
    })
    if (exitCode !== 0)
      fail(`Package manager not found: ${installer.command}`)

    return installer
  }

  const candidates = Object.values(known)
  for (const candidate of candidates) {
    const { exitCode } = await run(candidate.command, candidate.versionArgs, {
      stdio: 'pipe',
    })
    if (exitCode === 0)
      return candidate
  }

  return known.npm
}

async function runNpx(args: string[], options: RunOptions = {}) {
  const withYes = await run('npx', ['--yes', ...args], options)
  if (withYes.exitCode === 0)
    return withYes

  const msg = `${withYes.stderr}\n${withYes.stdout}`.toLowerCase()
  const yesUnsupported
    = msg.includes('unknown option')
      || msg.includes('unexpected argument')
      || msg.includes('unrecognized option')
  if (!yesUnsupported)
    return withYes

  return await run('npx', args, options)
}

async function updatePackageJsonName(projectDir: string, projectName: string) {
  const packageJsonPath = resolve(projectDir, 'package.json')
  try {
    const nextName = toNpmPackageName(projectName)
    if (!nextName)
      return

    const raw = await readFile(packageJsonPath, 'utf-8')
    const json = JSON.parse(raw) as Record<string, any>
    json.name = nextName
    await writeFile(
      packageJsonPath,
      `${JSON.stringify(json, null, 2)}\n`,
      'utf-8',
    )
  }
  catch {
    // ignore: some templates may not have a package.json or may be non-JSON
  }
}

function formatInstallCommand(pm: string | undefined) {
  const key = (pm || '').trim().toLowerCase()
  if (!key)
    return '<auto-detect>'

  if (key === 'pi' || key === 'ni')
    return key
  if (key === 'pnpm')
    return 'pnpm install'
  if (key === 'npm')
    return 'npm install'
  if (key === 'yarn')
    return 'yarn install'
  if (key === 'bun')
    return 'bun install'

  return pm || '<auto-detect>'
}

export async function main(argv = process.argv.slice(2)) {
  const flags = parseArgs(argv)
  if (flags.help) {
    printHelp()
    return
  }
  if (flags.version) {
    if (flags.json)
      printVersionJson()
    else printVersion()
    return
  }
  if (flags.listTemplates) {
    if (flags.json)
      printTemplatesJson()
    else printTemplates()
    return
  }

  if (flags.dryRun && flags.json) {
    const projectName = flags.name
    const templateId = flags.template

    if (!projectName) {
      console.log(JSON.stringify({ error: 'Missing project name.' }))
      throw new CliExit('Missing project name.', 1, true)
    }
    if (!templateId) {
      console.log(JSON.stringify({ error: 'Missing --template.' }))
      throw new CliExit('Missing --template.', 1, true)
    }
    if (!template.some(t => t.value === templateId)) {
      console.log(JSON.stringify({ error: `Unknown template: ${templateId}` }))
      throw new CliExit(`Unknown template: ${templateId}`, 1, true)
    }
    if (flags.rootDir && !isRelativePath(flags.rootDir)) {
      console.log(
        JSON.stringify({
          error: `Invalid path: ${flags.rootDir}. Please use a relative path like ./projects`,
        }),
      )
      throw new CliExit(
        `Invalid path: ${flags.rootDir}. Please use a relative path like ./projects`,
        1,
        true,
      )
    }
    const nameError = validateProjectName(projectName)
    if (nameError) {
      console.log(JSON.stringify({ error: nameError }))
      throw new CliExit(nameError, 1, true)
    }

    const rootDir = flags.rootDir || ''
    const baseDir = rootDir ? resolve(process.cwd(), rootDir) : process.cwd()
    const projectDir = resolve(baseDir, projectName)
    const cloneCommand = `npx degit ${
      flags.force ? '--force ' : ''
    }${username}/${templateId} ${projectName}`
    const installCommand = formatInstallCommand(flags.packageManager)
    const normalizedName = toNpmPackageName(projectName) || null

    console.log(
      JSON.stringify({
        baseDir,
        projectDir,
        template: templateId,
        projectName,
        cloneCommand,
        packageName: flags.noUpdateName ? null : normalizedName,
        vscode: flags.noOpen ? null : `code ${projectDir}`,
        install: flags.noInstall
          ? null
          : `cd ${projectDir} && ${installCommand}`,
      }),
    )
    return
  }

  if (process.stdout.isTTY && !flags.noClear)
    console.clear()

  if (flags.rootDir && !isRelativePath(flags.rootDir)) {
    fail(
      `Invalid path: ${flags.rootDir}. Please use a relative path like ./projects`,
    )
  }

  if (flags.name) {
    const error = validateProjectName(flags.name)
    if (error)
      fail(error)
  }

  p.intro(`${color.bgCyan(color.black(' simon-starter-cli '))}`)

  const initialName = flags.name
  const initialRootDir = flags.rootDir

  interface ProjectAnswers {
    rootDir: string
    customRootDir?: string
    select: string
    name: string
  }

  if (flags.template && !template.some(t => t.value === flags.template)) {
    fail(`Unknown template: ${flags.template}`)
  }

  let project: ProjectAnswers
  const canSkipPrompts = Boolean(flags.template && flags.name)
  if (canSkipPrompts) {
    project = {
      rootDir: flags.rootDir || '',
      select: flags.template!,
      name: flags.name!,
    }
  }
  else {
    project = (await p.group(
      {
        rootDir: () => {
          if (initialRootDir) {
            p.note(initialRootDir, 'Path')
            return Promise.resolve(initialRootDir)
          }
          return p.select({
            message: 'Create project under current directory?',
            initialValue: 'yes',
            maxItems: 5,
            options: [
              { value: 'yes', label: 'yes', hint: 'under current directory' },
              { value: 'no', label: 'no', hint: 'choose other path' },
            ],
          })
        },
        customRootDir: ({ results: { rootDir } }) => {
          if (rootDir === 'no') {
            return p.text({
              message: 'Where should we create your project?',
              placeholder: './my-new-project',
              validate: (value) => {
                if (!value)
                  return 'Please enter a path.'
                if (value[0] !== '.')
                  return 'Please enter a relative path.'
              },
            })
          }
        },
        select: () => {
          if (flags.template)
            return Promise.resolve(flags.template)
          return p.search({
            message: 'select a template',
            placeholder: 'Search for a template',
            options: template,
          })
        },
        name: ({ results: { select } }) =>
          p.text({
            initialValue: initialName,
            message: 'What should we name your project?',
            placeholder: select,
            validate: validateProjectName,
          }),
      },
      {
        onCancel: () => {
          p.cancel('Operation cancelled.')
          throw new CliExit('Operation cancelled.', 0, true)
        },
      },
    )) as ProjectAnswers
  }

  const s = p.spinner()

  p.note(
    `cloning ${project.select} to ${project.name}`,
    `Clone ${project.select}`,
  )

  const rootDir
    = project.rootDir === 'no'
      ? String(project.customRootDir || '')
      : project.rootDir === 'yes'
        ? ''
        : String(project.rootDir)
  const baseDir = rootDir ? resolve(process.cwd(), rootDir) : process.cwd()
  const projectDir = resolve(baseDir, project.name)

  if (existsSync(projectDir) && !flags.force) {
    fail(
      `Target directory already exists: ${projectDir}. Use --force to let degit overwrite it.`,
    )
  }

  if (flags.dryRun) {
    const cloneCommand = `npx degit ${
      flags.force ? '--force ' : ''
    }${username}/${project.select} ${project.name}`
    const installCommand = formatInstallCommand(flags.packageManager)
    const normalizedName = toNpmPackageName(project.name) || '(skipped)'

    p.note(baseDir, 'Base Dir')
    p.note(projectDir, 'Project Dir')
    p.note(cloneCommand, 'Clone')
    if (!flags.noUpdateName)
      p.note(`package.json name -> ${normalizedName}`, 'Package')
    if (!flags.noOpen)
      p.note(`code ${projectDir}`, 'VSCode')
    if (!flags.noInstall)
      p.note(`cd ${projectDir} && ${installCommand}`, 'Install')

    p.outro('Dry run complete.')
    return
  }

  if (rootDir) {
    s.start('Creating the Directory')
    try {
      await mkdir(baseDir, { recursive: true })
      s.stop('Creating the Directory')
    }
    catch (error: any) {
      s.stop('Creating the Directory')
      fail(error?.message ? String(error.message) : String(error))
    }
  }

  s.start('Starting Clone')
  const { exitCode: cloneExitCode, stderr: cloneStderr } = await runNpx(
    [
      'degit',
      ...(flags.force ? ['--force'] : []),
      `${username}/${project.select}`,
      project.name,
    ],
    { cwd: baseDir, stdio: 'tee' },
  )
  if (cloneExitCode !== 0) {
    s.stop('Starting Clone')
    fail(cloneStderr || `Clone failed with exit code ${cloneExitCode}`)
  }
  s.stop('Starting Clone')

  if (!flags.noUpdateName)
    await updatePackageJsonName(projectDir, project.name)

  if (flags.noOpen) {
    p.note('Skipped by --no-open', 'VSCode')
  }
  else {
    s.start('Opening in VSCode')
    const { exitCode: codeExitCode } = await run('code', [projectDir], {
      stdio: 'pipe',
    })
    if (codeExitCode !== 0)
      p.note('`code` not found, skipped opening VSCode', 'VSCode')
    s.stop('Opening in VSCode')
  }

  if (flags.noInstall) {
    p.note('Skipped by --no-install', 'Install')
  }
  else {
    const installer = await pickInstaller(flags.packageManager)
    s.start('Installing dependencies')
    p.note(
      `cd ${rootDir ? `${rootDir}/` : ''}${project.name} && ${installer.label}`,
      'Install',
    )
    const { exitCode: installExitCode } = await run(
      installer.command,
      installer.args,
      {
        cwd: projectDir,
        stdio: 'tee',
      },
    )
    if (installExitCode !== 0) {
      s.stop('Installing dependencies')
      fail(`Install failed with exit code ${installExitCode}`)
    }
    s.stop('Installing dependencies')
  }

  p.outro(`Project ${project.name} created successfully!`)
  if (!flags.noGum) {
    await run(
      'gum',
      [
        'style',
        '--foreground',
        '21',
        '--border-foreground',
        '57',
        '--border',
        'double',
        '--align',
        'center',
        '--width',
        '40',
        '--margin',
        '1 2',
        '--padding',
        '1 2',
        'Enjoy Coding!',
        '😁',
      ],
      { stdio: 'pipe' },
    )
  }
}
