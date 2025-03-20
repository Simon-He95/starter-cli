import { mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import process from 'node:process'
import * as p from '@simon_he/clack-prompts'
import color from 'picocolors'
import { jsShell } from 'lazy-js-utils/node'
import { template } from './template.js'
import { username } from './user.js'

async function main() {
  console.clear()

  p.intro(`${color.bgCyan(color.black(' simon-starter-cli '))}`)
  let installWay = 'pi' // @simon_he/pi
  const { status } = await jsShell(`${installWay} -v`, 'pipe')
  if (status !== 0) {
    // 使用 ni
    installWay = 'ni'
    const { status } = await jsShell(`${installWay} -v`, 'pipe')
    if (status !== 0) {
      installWay = 'npm install'
    }
  }
  let initialValue = process.argv[2]
  let initialPath = process.argv[3]
  if (initialValue && initialValue.startsWith('.')) {
    const temp = initialValue
    initialValue = initialPath
    initialPath = temp
  }
  else if (initialPath && !initialPath.startsWith('.')) {
    initialPath = ''
  }

  const project = await p.group(
    {
      path: () => {
        if (initialPath) {
          p.intro(`Path: ${initialPath}`)
          return Promise.resolve(initialPath)
        }
        return p.select({
          message: `Whether to create a project in the current directory`,
          initialValue: 'yes',
          maxItems: 5,
          options: [
            { value: 'yes', label: 'yes', hint: 'current directory' },
            { value: 'no', label: 'no', hint: 'choose other path' },
          ],
        })
      },
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
      select: () =>
        p.search({
          message: 'select a template',
          placeholder: 'Search for a template',
          options: template,
        }),
      name: ({ results: { select } }) =>
        p.text({
          initialValue,
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
      try {
        await mkdir(`${project.type}`, {
          recursive: true,
        })
      }
      catch (error: any) {
        p.cancel(error.message)
        process.exit(1)
      }
      s.stop('Creating the Directory')
    }
  }

  s.start('Starting Clone')
  const { status: cloneStatus, result: cloneMsg } = await jsShell(
    `${project.type ? `cd ${project.type} &&` : ''}  npx degit ${username}/${
      project.select
    } ${project.name}`,
  )
  if (cloneStatus !== 0) {
    p.cancel(cloneMsg)
    process.exit(1)
  }
  s.stop('Starting Clone')

  // 写入修改 package.json
  const { status: fileStatus, result: fileMsg } = await jsShell(`
      ${
  project.type
    ? `cd ${project.type}/${project.name}`
    : `cd ${project.name}`
}
      content=$(cat ./package.json)
      new_content=\${content//vitesse/${project.name}}
      echo "$new_content" > ./package.json
      `)
  if (fileStatus !== 0) {
    p.cancel(fileMsg)
    process.exit(1)
  }

  s.start('Opening in VSCode')
  await jsShell(
    `${project.type ? `cd ${project.type} &&` : ''} code ${project.name}`,
  )
  s.stop('Opening in VSCode')

  s.start('Installing dependencies')
  p.outro(
    `${
      project.type ? `cd ${project.type}/${project.name}` : `cd ${project.name}`
    } && ${installWay}`,
  )
  await jsShell(
    `${
      project.type ? `cd ${project.type}/${project.name}` : `cd ${project.name}`
    } && ${installWay}`,
  )
  s.stop('Installing dependencies')

  p.outro(`Project ${project.name} created successfully!`)
  jsShell(`gum style \
  --foreground 21 --border-foreground 57 --border double \
  --align center --width 40 --margin "1 2" --padding "1 2" \
  'Enjoy Coding!' '😁'`)
}

main().catch(console.error)
