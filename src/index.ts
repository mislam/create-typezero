#!/usr/bin/env node

process.on('SIGINT', () => {
	console.log('\nGracefully shutting down')
	process.exit(0)
})

function main() {
	try {
		console.log(
			'We are still working on the generator!\nUntil then, follow the Quick Start in the README.'
		)
	} catch (error) {
		console.error('Failed to start:', error)
		process.exit(1)
	}
}

main()
