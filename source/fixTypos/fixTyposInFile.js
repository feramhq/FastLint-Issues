import path from 'path'

import chalk from 'chalk'
import {Signature} from 'nodegit'
import fsp from 'fs-promise'
import isBinary from 'is-binary'

import replaceTypos from './replaceTypos'

import generalTypoMap from '../typoMaps/general'
import styleTypoMap from '../typoMaps/style'
import scriptTypoMap from '../typoMaps/script'


function isHumanReadable (filePath, fileContent) {
	return !isBinary(fileContent) &&
		!/\.min\.(css|js|html)$/.test(filePath) &&
		!/\.(css|js)\.map$/.test(filePath)
}

function isStyle (filePath) {
	return /\.(css|styl|scss|sass|less)$/.test(filePath)
}

function isScript (filePath) {
	const regex = new RegExp(
		'\\.(' +
		'javascript|js|jsx|' +
		'ecmascript|es|es2015|' +
		'typescript|ts|' +
		'coffeescript|coffee' +
		'livescript|ls' +
		')$'
	)
	regex.test(filePath)
}

const typoMapObjects = [
	{
		name: 'general',
		map: generalTypoMap,
		test: () => true,
	},
	{
		name: 'css',
		map: styleTypoMap,
		test: isStyle,
	},
	{
		name: 'js',
		map: scriptTypoMap,
		test: isScript,
	},
]


export default (options = {}) => {
	const {entry, repo, authorSignature, commiterSignature} = options
	const filePath = entry.path()

	return entry
		.getBlob()
		.then(blob => {
			let fileContent = blob.toString()
			let isFixed = false

			if  (!isHumanReadable(filePath, fileContent)) {
				throw new Error('not human readable')
			}

			typoMapObjects.forEach(mapObject => {
				if (!mapObject.test(filePath)) { return }

				const newFileConent = replaceTypos(
					fileContent,
					filePath,
					mapObject.map,
				)
				if (newFileConent) {
					isFixed = true
					fileContent = newFileConent
				}
			})

			if (!isFixed) {
				process.stdout.write('.')
				throw new Error('nothing was fixed')
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
			authorSignature,
			commiterSignature,
			`Fix typos in ` + path.basename(filePath)
		))
		.catch(error => {
			if (['nothing was fixed', 'not human readable']
				.indexOf(error.message) >= 0
			) { return }

			console.error(chalk.red(error.stack))
		})
}
