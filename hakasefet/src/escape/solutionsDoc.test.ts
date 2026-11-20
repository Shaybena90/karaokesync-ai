/// <reference types="node" />
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { solutionsMarkdown } from './solutionsDoc'

// vitest runs from the project folder
const FILE = resolve(process.cwd(), 'docs/ESCAPE_SOLUTIONS.md')

it('docs/ESCAPE_SOLUTIONS.md matches the room content', () => {
  const md = solutionsMarkdown()
  if (process.env.UPDATE_DOCS) writeFileSync(FILE, md)
  expect(readFileSync(FILE, 'utf8')).toBe(md)
})
