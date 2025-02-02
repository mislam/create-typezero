import fs from 'node:fs'
import path from 'node:path'
import type { SyncOptions, SyncResult } from 'execa'
import { execaCommandSync } from 'execa'
import { afterEach, beforeAll, expect, it } from 'vitest'

const CLI_PATH = path.join(__dirname, '..')

const projectName = 'test-app'
const TEST_DIR = path.join(__dirname, '..', '.test')

const templateName = 'typezero'
const templatePath = path.join(__dirname, '..', 'node_modules', templateName)

const genPath = path.join(TEST_DIR, projectName)
const genPathWithSubfolder = path.join(TEST_DIR, 'subfolder', projectName)

const run = <SO extends SyncOptions>(args: string[], options?: SO): SyncResult<SO> => {
	return execaCommandSync(`tsx ${CLI_PATH}/src/index.ts ${args.join(' ')}`, options)
}

// Helper to create a non-empty directory
const createNonEmptyDir = (overrideFolder?: string) => {
	// Create the temporary directory
	const newNonEmptyFolder = overrideFolder || genPath
	fs.mkdirSync(newNonEmptyFolder, { recursive: true })

	// Create a package.json file
	const pkgJson = path.join(newNonEmptyFolder, 'package.json')
	fs.writeFileSync(pkgJson, '{ "foo": "bar" }')
}

const clearAnyPreviousFolders = () => {
	;[genPath, genPathWithSubfolder].forEach((path) => {
		if (fs.existsSync(path)) {
			fs.rmSync(path, { recursive: true, force: true })
		}
	})
}

beforeAll(() => {
	// Create test directory if it doesn't exist
	if (!fs.existsSync(TEST_DIR)) {
		fs.mkdirSync(TEST_DIR, { recursive: true })
	}
	clearAnyPreviousFolders()
})

afterEach(() => clearAnyPreviousFolders())

it('prompts for the project name if none supplied', () => {
	const { stdout } = run([])
	expect(stdout).toContain('Project name:')
})

it('asks to overwrite non-empty target directory', () => {
	createNonEmptyDir()
	const { stdout } = run([projectName], { cwd: TEST_DIR })
	expect(stdout).toContain(`Target directory "${projectName}" is not empty.`)
})

it('asks to overwrite non-empty target directory with subfolder', () => {
	createNonEmptyDir(genPathWithSubfolder)
	const { stdout } = run([`subfolder/${projectName}`], { cwd: TEST_DIR })
	expect(stdout).toContain(`Target directory "subfolder/${projectName}" is not empty.`)
})

it('asks to overwrite non-empty current directory', () => {
	createNonEmptyDir()
	const { stdout } = run(['.'], { cwd: genPath })
	expect(stdout).toContain(`Current directory is not empty.`)
})

it(`successfully scaffolds a project based on ${templateName} template`, () => {
	const { stdout } = run([projectName], { cwd: TEST_DIR })
	const templateFiles = fs.readdirSync(templatePath).sort()
	const generatedFiles = fs.readdirSync(genPath).sort()

	// Assertions
	expect(stdout).toContain(`Scaffolding project in ${genPath}`)
	expect(templateFiles).toEqual(generatedFiles)
	expect(true).toBe(true)
})

it('return help usage how to use create-typezero', () => {
	const { stdout } = run(['--help'], { cwd: TEST_DIR })
	const message = 'Usage: create-typezero [DIRECTORY]'
	expect(stdout).toContain(message)
})

it('return help usage how to use create-typezero with -h alias', () => {
	const { stdout } = run(['-h'], { cwd: TEST_DIR })
	const message = 'Usage: create-typezero [DIRECTORY]'
	expect(stdout).toContain(message)
})
