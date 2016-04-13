import path from 'path'

import fsp from 'fs-promise'
import {Signature} from 'nodegit'
import chalk from 'chalk'

import typoFixMap from './typoFixMap'

export default (repo, tree, signature) => new Promise((resolve, reject) => {
	console.log('- Tree of head commit')
	let resultString = '- '
	const editPromises = []

	const walker = tree.walk(true)
	walker.on('error', error => reject(error))
	walker.on('entry', entry => {
		const filePath = entry.path()

		if ((/\.(png|jpg|jpeg|gif|pdf|exe)$/.test(filePath))) { return }

		editPromises.push(entry
			.getBlob()
			.then(blob => {
				let fileContent = blob.toString()
				let isChanged = false

				for (const typo in typoFixMap) {
					const typoRegex = new RegExp(
						`(\\W)${typo}(\\W)`,
						'gi'
					)
					if (!typoRegex.test(fileContent)) { continue }

					isChanged = true

					fileContent = fileContent.replace(
						typoRegex,
						(match, p1, p2) => p1 + typoFixMap[typo] + p2
					)

					resultString += '\n' + chalk.green(
						`- Fix typo "${typo}" => "${typoFixMap[typo]}" ` +
						`in ${filePath}`) +
						'\n- '
				}

				if (!isChanged) {
					resultString += '.'
					throw new Error('ignore')
				}

				return fsp.writeFile(
					path.join(repo.workdir(), filePath),
					fileContent
				)
			})
			.then(() => repo.index())
			.then((repoIndex) => {
				repoIndex.addByPath(filePath)
				repoIndex.write()
				return repoIndex.writeTree()
			})
			.then(() => {
				return repo.createCommitOnHead(
					[filePath],
					signature,
					signature,
					`Fix typos`
				)
			})
			.catch(error => {
				if (error.message === 'ignore') { return }
				console.error(chalk.red(error.stack))
			})
		)
	})
	walker.on('end', () => {
		resolve(Promise
			.all(editPromises)
			.then(matchedFiles => {
				console.log(resultString)
				return matchedFiles
			})
		)
	})
	walker.start()
})
