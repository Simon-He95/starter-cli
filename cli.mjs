#!/usr/bin/env node --no-warnings
import process from 'node:process'
import { main } from './dist/index.js'

main().catch((error) => {
  const exitCode = typeof error?.exitCode === 'number' ? error.exitCode : 1
  const alreadyShown = Boolean(error?.alreadyShown)

  if (!alreadyShown) console.error(error)

  process.exitCode = exitCode
})
