import { mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import process from 'node:process'
import * as p from '@clack/prompts'
import color from 'picocolors'
import { jsShell } from 'lazy-js-utils'
import { template } from './template'

async function main() {
  console.clear()

  p.intro(`${color.bgCyan(color.black(' simon-starter-cli '))}`)

  const project = await p.group(
    {
      path: () =>
        p.select({
          message: `Whether to create a project in the current directory`,
          initialValue: 'ts',
          maxItems: 5,
          options: [
            { value: 'yes', label: 'yes' },
            { value: 'no', label: 'no', hint: 'choose other path' },
          ],
        }),
      type: ({ results: { path } }) => {
        if (path === 'no') {
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
      select: async () => {
        const { result, status } = await jsShell(
          `echo ${template
            .map(
              item => `"${item.label}${item.hint ? ` (${item.hint})` : ''}"`,
            )
            .join(
              '\\\\n',
            )}| gum filter --placeholder=" 请选择一个模板 ${template
            .map(item => item.label)
            .join(' | ')}"`,
          'pipe',
        )
        if (status !== 0)
          return Promise.reject(new Error('Operation cancelled.'))
        const s = p.spinner()
        const target = template.find(item =>
          item.hint
            ? `${item.label} (${item.hint})` === result
            : item.label === result,
        )?.value
        s.start(`Template: ${result}`)
        s.stop(`Template: ${result}`)
        return target
      },
      name: ({ results: { select } }) =>
        p.text({
          message: 'What should we name your project?',
          placeholder: select,
          validate: (value) => {
            if (!value)
              return 'Please enter a name.'
          },
        }),
    },
    {
      onCancel: () => {
        p.cancel('Operation cancelled.')
        process.exit(0)
      },
    },
  )

  const s = p.spinner()
  p.note(
    `cloning ${project.select} to ${project.name}`,
    `Clone ${project.select}`,
  )
  if (project.type) {
    if (!(await existsSync(`${project.type}`))) {
      // 目录不存在, 创建目录
      s.start('Creating the Directory')
      await mkdir(`${project.type}`, {
        recursive: true,
      })
      s.stop('Creating the Directory')
    }
  }

  s.start('Starting Clone')
  await jsShell(
    `${project.type ? `cd ${project.type} &&` : ''}  npx degit Simon-He95/${
      project.select
    } ${project.name}`,
  )
  s.stop('Starting Clone')
  s.start('Opening in VSCode')
  await jsShell(
    `${project.type ? `cd ${project.type} &&` : ''} code ${project.name}`,
  )
  s.stop('Opening in VSCode')
  s.start('Installing dependencies')
  await jsShell(
    `${
      project.type
        ? `cd ${project.type}/${project.name}`
        : `cd ${project.select}`
    } && pi`,
  )
  s.stop('Installing dependencies')
  p.outro(`enjoy coding!`)
}

main().catch(console.error)
