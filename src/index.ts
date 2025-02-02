#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import minimist from 'minimist'
import prompts from 'prompts'
import { execaCommandSync } from 'execa'
import colors from 'picocolors'
const { red, reset } = colors

// Configure minimist to preserve positional arguments (project name) as strings
// Prevents numeric project names like "my-app-2024" from being converted to numbers
// The '_' array contains all non-option arguments (positional arguments)
const argv = minimist<{
	template?: string
	help?: boolean
}>(process.argv.slice(2), {
	default: { help: false },
	alias: { h: 'help', t: 'template' },
	string: ['_'] // force all positional arguments to be parsed as strings
})

const cwd = process.cwd()

const helpMessage = `\
Usage: create-typezero [DIRECTORY]

Create a new TypeZero project.
With no arguments, start the CLI in interactive mode.`

const defaultTargetDir = 'my-app'
const pkgInfo = pkgFromUserAgent(process.env.npm_config_user_agent)
const pkgManager = pkgInfo ? pkgInfo.name : 'npm'

async function main() {
	const argTargetDir = formatTargetDir(argv._[0])

	const help = argv.help
	if (help) {
		console.log(helpMessage)
		return
	}

	let targetDir = argTargetDir || defaultTargetDir
	const getProjectName = () => path.basename(path.resolve(targetDir))

	let result: prompts.Answers<'projectName' | 'overwrite' | 'packageName'>

	try {
		result = await prompts(
			[
				{
					type: argTargetDir ? null : 'text',
					name: 'projectName',
					message: reset('Project name:'),
					initial: defaultTargetDir,
					onState: (state) => {
						targetDir = formatTargetDir(state.value) || defaultTargetDir
					}
				},
				{
					type: () => (!fs.existsSync(targetDir) || isEmpty(targetDir) ? null : 'select'),
					name: 'overwrite',
					message: () =>
						(targetDir === '.' ? 'Current directory' : `Target directory "${targetDir}"`) +
						` is not empty. Please choose how to proceed:`,
					initial: 0,
					choices: [
						{
							title: 'Cancel operation',
							value: 'no'
						},
						{
							title: 'Remove existing files and continue',
							value: 'yes'
						},
						{
							title: 'Ignore files and continue',
							value: 'ignore'
						}
					]
				},
				{
					type: (_, { overwrite }: { overwrite?: string }) => {
						if (overwrite === 'no') {
							throw new Error(red('✖') + ' Operation cancelled')
						}
						return null
					},
					name: 'overwriteChecker'
				},
				{
					type: () => (isValidPackageName(getProjectName()) ? null : 'text'),
					name: 'packageName',
					message: reset('Package name:'),
					initial: () => toValidPackageName(getProjectName()),
					validate: (dir) => isValidPackageName(dir) || 'Invalid package.json name'
				}
			],
			{
				onCancel: () => {
					throw new Error(red('✖') + ' Operation cancelled')
				}
			}
		)
	} catch (cancelled: unknown) {
		if (cancelled instanceof Error) {
			console.log(cancelled.message)
		}
		return
	}

	// user choice associated with prompts
	const { overwrite, packageName } = result

	const root = path.join(cwd, targetDir)

	if (overwrite === 'yes') {
		emptyDir(root)
	} else if (!fs.existsSync(root)) {
		fs.mkdirSync(root, { recursive: true })
	}

	console.log(`\nScaffolding project in ${root}`)

	const { templatePath, tmpRoot } = downloadTemplate('typezero')

	const write = (file: string, content?: string) => {
		const targetPath = path.join(root, file)
		if (content) {
			fs.writeFileSync(targetPath, content)
		} else {
			copy(path.join(templatePath, file), targetPath)
		}
	}

	// copy all files from the template to the new project (except package.json)
	const files = fs.readdirSync(templatePath)
	for (const file of files.filter((f) => f !== 'package.json')) {
		write(file)
	}

	// update package.json and place it in the new project
	const pkg = JSON.parse(fs.readFileSync(path.join(templatePath, `package.json`), 'utf-8'))
	pkg.name = packageName || getProjectName()
	pkg.version = '0.1.0'
	write('package.json', JSON.stringify(pkg, null, '\t') + '\n')

	// cleanup the tmp directory
	fs.rmSync(tmpRoot, { recursive: true, force: true })

	const cdProjectName = path.relative(cwd, root)
	console.log(`\nDone. Now run:\n`)
	if (root !== cwd) {
		console.log(`  cd ${cdProjectName.includes(' ') ? `"${cdProjectName}"` : cdProjectName}`)
	}

	switch (pkgManager) {
		case 'yarn':
			console.log('  yarn')
			console.log('  yarn dev')
			break
		default:
			console.log(`  ${pkgManager} install`)
			console.log(`  ${pkgManager} run dev`)
			break
	}
	console.log()
}

function formatTargetDir(targetDir: string | undefined) {
	return targetDir?.trim().replace(/\/+$/g, '')
}

function isValidPackageName(projectName: string) {
	return /^(?:@[a-z\d\-*~][a-z\d\-*._~]*\/)?[a-z\d\-~][a-z\d\-._~]*$/.test(projectName)
}

function toValidPackageName(projectName: string) {
	return projectName
		.trim()
		.toLowerCase()
		.replace(/\s+/g, '-')
		.replace(/^[._]/, '')
		.replace(/[^a-z\d\-~]+/g, '-')
}

function isEmpty(path: string) {
	const files = fs.readdirSync(path)
	return files.length === 0 || (files.length === 1 && files[0] === '.git')
}

function emptyDir(dir: string) {
	if (!fs.existsSync(dir)) {
		return
	}
	for (const file of fs.readdirSync(dir)) {
		if (file === '.git') {
			continue
		}
		fs.rmSync(path.resolve(dir, file), { recursive: true, force: true })
	}
}

function downloadTemplate(templateName: string) {
	// create unique template directory in user's home directory
	const tmpRoot = path.join(os.homedir(), `.tmp-${templateName}`)
	const templatePath = path.join(tmpRoot, 'node_modules', templateName)

	// remove (if exists) and create the tmp directory
	fs.rmSync(tmpRoot, { recursive: true, force: true })
	fs.mkdirSync(tmpRoot, { recursive: true })

	// create a dummy package.json
	fs.writeFileSync(path.join(tmpRoot, 'package.json'), '{}')

	// install the template
	const cmd = `${pkgManager} ${pkgManager === 'npm' ? 'install' : 'add'} ${templateName}@latest`
	const { stdout } = execaCommandSync(cmd, {
		cwd: tmpRoot
	})

	// rename .npmignore to .gitignore if it exists (while using npm)
	const npmIgnorePath = path.join(templatePath, '.npmignore')
	if (fs.existsSync(npmIgnorePath)) {
		fs.renameSync(npmIgnorePath, path.join(templatePath, '.gitignore'))
	}

	return {
		stdout,
		templatePath,
		tmpRoot // for cleanup
	}
}

function copy(src: string, dest: string) {
	const stat = fs.statSync(src)
	if (stat.isDirectory()) {
		copyDir(src, dest)
	} else {
		fs.copyFileSync(src, dest)
	}
}

function copyDir(srcDir: string, destDir: string) {
	fs.mkdirSync(destDir, { recursive: true })
	for (const file of fs.readdirSync(srcDir)) {
		const srcFile = path.resolve(srcDir, file)
		const destFile = path.resolve(destDir, file)
		copy(srcFile, destFile)
	}
}

interface PkgInfo {
	name: string
	version: string
}

function pkgFromUserAgent(userAgent: string | undefined): PkgInfo | undefined {
	if (!userAgent) return undefined
	const pkgSpec = userAgent.split(' ')[0]
	const pkgSpecArr = pkgSpec.split('/')
	return {
		name: pkgSpecArr[0],
		version: pkgSpecArr[1]
	}
}

main().catch((e) => {
	console.error(e)
})
