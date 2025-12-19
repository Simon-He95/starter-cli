import process from 'node:process'
import { describe, expect, it, vi } from 'vitest'
import { main } from '../src/index.js'

function withConsoleLogCapture(fn: () => Promise<void> | void) {
  const logs: string[] = []
  const spy = vi
    .spyOn(console, 'log')
    .mockImplementation((...args: unknown[]) => {
      logs.push(args.map(a => String(a)).join(' '))
    })
  const run = async () => {
    try {
      await fn()
    }
    finally {
      spy.mockRestore()
    }
  }
  return { logs, run }
}

describe('cli flags', () => {
  it('prints help', () => {
    const { logs, run } = withConsoleLogCapture(() => main(['--help']))
    return run().then(() => {
      expect(logs.join('\n')).toContain('Usage:')
      expect(logs.join('\n')).toContain('--pm')
      expect(logs.join('\n')).toContain('--no-clear')
      expect(logs.join('\n')).toContain('--dry-run')
      expect(logs.join('\n')).toContain('--no-update-name')
      expect(logs.join('\n')).toContain('--json')
    })
  })

  it('prints templates', () => {
    const { logs, run } = withConsoleLogCapture(() =>
      main(['--list-templates']),
    )
    return run().then(() => {
      expect(logs.join('\n')).toContain('starter-ts')
    })
  })

  it('prints templates as json', () => {
    const { logs, run } = withConsoleLogCapture(() =>
      main(['--list-templates', '--json']),
    )
    return run().then(() => {
      const payload = JSON.parse(logs.join('\n')) as Array<{ value: string }>
      expect(payload.some(t => t.value === 'starter-ts')).toBe(true)
    })
  })

  it('prints version', () => {
    const { logs, run } = withConsoleLogCapture(() => main(['--version']))
    return run().then(() => {
      expect(logs.join('\n').trim()).toMatch(/^\d+\.\d+\.\d+/)
    })
  })

  it('prints version as json', () => {
    const { logs, run } = withConsoleLogCapture(() =>
      main(['--version', '--json']),
    )
    return run().then(() => {
      const payload = JSON.parse(logs.join('\n')) as { version: string }
      expect(payload.version).toMatch(/^\d+\.\d+\.\d+/)
    })
  })

  it('rejects absolute path', async () => {
    const stdout = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((() => true) as any)
    const stderr = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((() => true) as any)
    try {
      await expect(main(['--path', '/tmp'])).rejects.toMatchObject({
        exitCode: 1,
      })
    }
    finally {
      stdout.mockRestore()
      stderr.mockRestore()
    }
  })

  it('supports dry-run', async () => {
    const stdout = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((() => true) as any)
    const stderr = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((() => true) as any)
    try {
      await expect(
        main([
          'my-app',
          '--template',
          'starter-ts',
          '--dry-run',
          '--no-open',
          '--no-gum',
          '--no-clear',
        ]),
      ).resolves.toBeUndefined()
    }
    finally {
      stdout.mockRestore()
      stderr.mockRestore()
    }
  })

  it('supports dry-run json', () => {
    const { logs, run } = withConsoleLogCapture(() =>
      main([
        'my-app',
        '--template',
        'starter-ts',
        '--dry-run',
        '--json',
        '--no-open',
        '--no-gum',
        '--no-clear',
      ]),
    )
    return run().then(() => {
      const payload = JSON.parse(logs.join('\n')) as {
        cloneCommand: string
        template: string
      }
      expect(payload.template).toBe('starter-ts')
      expect(payload.cloneCommand).toContain('degit')
    })
  })
})
