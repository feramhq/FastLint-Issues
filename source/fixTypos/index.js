import fixTyposInFile from './fixTyposInFile'

export default (repo, tree, signature) => new Promise((resolve, reject) => {
	console.log('- Tree of head commit')
	const fileEditPromises = []

	const walker = tree.walk(true)
	walker.on('error', error => reject(error))
	walker.on('entry', (entry) => {
		fileEditPromises.push(
			fixTyposInFile(entry, repo, signature)
		)
	})
	walker.on('end', () => {
		resolve(Promise
			.all(fileEditPromises)
			.then(matchedFiles => {
				console.log()
				return matchedFiles
			})
		)
	})
	walker.start()
})
