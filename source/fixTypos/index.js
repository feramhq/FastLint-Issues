import fixTyposInFile from './fixTyposInFile'

export default (repo, tree, signature) => new Promise((resolve, reject) => {
	let fileEditPromiseChain = Promise.resolve()
	let commitWasCreated = false

	const walker = tree.walk(true)
	walker.on('error', error => reject(error))
	walker.on('entry', (entry) => {
		fileEditPromiseChain = fileEditPromiseChain
			.then(commitId => {
				if (commitId) {
					commitWasCreated = true
				}
				return fixTyposInFile(entry, repo, signature)
			})
	})
	walker.on('end', () => {
		resolve(fileEditPromiseChain
			.then(() => commitWasCreated)
		)
	})
	walker.start()
})
