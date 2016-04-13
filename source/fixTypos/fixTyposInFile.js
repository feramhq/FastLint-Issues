import path from 'path'

import chalk from 'chalk'
import {Signature} from 'nodegit'
import fsp from 'fs-promise'

import typoFixMap from './typoFixMap'

export default (entry, repo, signature) => {
	const filePath = entry.path()

	if ((/\.(png|jpg|jpeg|gif|pdf|exe)$/.test(filePath))) { return }

	return entry
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

				console.log()
				process.stdout.write(chalk.green(
					`${typo} => ${typoFixMap[typo]} in ${filePath}`
				))
			}

			if (!isChanged) {
				process.stdout.write('.')
				throw new Error('ignore')
			}
			else {
				console.log()
			}

			return fsp.writeFile(
				path.join(repo.workdir(), filePath),
				fileContent
			)
		})
		.then(() => repo.index())
		.then(repoIndex => {
			repoIndex.addByPath(filePath)
			repoIndex.write()
			return repoIndex.writeTree()
		})
		.then(() => repo.createCommitOnHead(
			[filePath],
			signature,
			signature,
			`Fix typos`
		))
		.catch(error => {
			if (error.message === 'ignore') { return }
			console.error(chalk.red(error.stack))
		})
}
