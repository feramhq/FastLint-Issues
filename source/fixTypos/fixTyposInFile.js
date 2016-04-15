import path from 'path'

import chalk from 'chalk'
import {Signature} from 'nodegit'
import fsp from 'fs-promise'
import isBinary from 'is-binary'

import replaceTypos from './replaceTypos'
import replaceCssTypos from './replaceCssTypos'

export default (entry, repo, signature) => {
	const filePath = entry.path()

	return entry
		.getBlob()
		.then(blob => {
			let fileContent = blob.toString()
			let isFixed = false

			if (!isBinary(fileContent) &&
				!/\.min\.(css|js|html)$/.test(filePath) &&
				!/\.(css|js)\.map$/.test(filePath)
			) {
				const newFileConent = replaceTypos(fileContent, filePath)
				if (newFileConent) {
					isFixed = true
					fileContent = newFileConent
				}

				if (/\.(css|styl|scss|sass|less)$/.test(filePath)) {
					const newFileConent = replaceCssTypos(fileContent, filePath)
					if (newFileConent) {
						isFixed = true
						fileContent = newFileConent
					}
				}
			}

			if (!isFixed) {
				process.stdout.write('.')
				throw new Error('goto end')
			}

			fsp.writeFile(
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
			`Fix typos in ` + path.basename(filePath)
		))
		.catch(error => {
			if (error.message === 'goto end') { return }
			console.error(chalk.red(error.stack))
		})
}
