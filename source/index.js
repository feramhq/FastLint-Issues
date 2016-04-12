import path from 'path'

import fsp from 'fs-promise'
import request from 'request-promise'
import nodegit, {Clone, Signature} from 'nodegit'
import _ from 'lodash'

import typoFixMap from './typoFixMap'


const apiUri = 'https://api.github.com'
const defaults = {
	auth: {
		user: 'adius',
		pass: process.env.FERAM_PASSWORD,
	},
	headers: {
		'User-Agent': 'feram'
	}
}
const author = 'Adrian Sieber'
const commiter = 'Adrian Sieber'
const email = 'mail@adriansieber.com'
const reposPath = path.resolve(__dirname, '../repos')

fsp.mkdir(reposPath)

function improveRandomRepo () {

	let oneYearAgo = new Date()
	oneYearAgo.setUTCFullYear(oneYearAgo.getUTCFullYear() - 1)
	oneYearAgo = oneYearAgo.toISOString().slice(0, 10)

	let oneDayAgo = new Date()
	oneDayAgo.setUTCDate(oneDayAgo.getUTCDate() - 1)
	oneDayAgo = oneDayAgo.toISOString().slice(0, 10)

	let randomDaysAgo = new Date()
	randomDaysAgo.setUTCDate(
		randomDaysAgo.getUTCDate() - Math.trunc(Math.random() * 100)
	)
	randomDaysAgo = randomDaysAgo.toISOString().slice(0, 10)

	const config = Object.assign(
		{
			uri: apiUri + '/search/repositories',
			qs: {
				q: [
					'size:<10000', // Smaller than 10 Mb
					`pushed:${randomDaysAgo}`
				].join(' '),
				// sort: 'updated',
				per_page: 1,
			}
		},
		defaults
	)
	let hoistedGitRepo

	request(config)
		.then(searchResponse => {
			const searchObject = JSON.parse(searchResponse)

			if (!searchObject.total_count) {
				throw new Error('No repos were found')
			}

			return _.sample(searchObject.items)
		})
		.then(repoObject => {
			console.log('Repo: ' + repoObject.html_url)

			return Clone.clone(
				repoObject.html_url,
				path.join(reposPath, repoObject.full_name)
			)
		})
		.then(gitRepo => {
			console.log('    - Clone')
			if (gitRepo.isEmpty()) {
				throw new Error('Repo is empty')
			}
			hoistedGitRepo = gitRepo
			return gitRepo.getHeadCommit()
		})
		.then(commit => commit.getTree())
		.then(tree => {
			console.log('    - Tree of head commit')
			let resultString = '    - '

			const walker = tree.walk(true)
			walker.on('error', error => console.error(error))
			walker.on('entry', entry => {
				const filePath = entry.path()
				// const notFixable = 'File %s has no fixable typos'

				if (!(/\.md$/.test(filePath))) { return }

				entry
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

							resultString += `\n    - Fix typo "${typo
								}" => "${typoFixMap[typo]
								}" in ${filePath}\n    - `
						}

						if (!isChanged) {
							resultString += '.'
							throw new Error('ignore')
						}

						return fsp.writeFile(
							path.join(hoistedGitRepo.workdir(), filePath),
							fileContent
						)
					})
					.then(() => hoistedGitRepo.index())
					.then((repoIndex) => {
						repoIndex.addByPath(filePath)
						repoIndex.write()
						return repoIndex.writeTree()
					})
					.then(() => {
						const signature = Signature.now(author, email)

						return hoistedGitRepo.createCommitOnHead(
							[filePath],
							signature,
							signature,
							`Fix typos`
						)
					})
					.catch(error => {
						if (error.message === 'ignore') { return }
						console.error(error.stack)
					})
			})
			walker.on('end', () => {
				console.log(resultString)
			})
			walker.start()
		})
		.catch(error => console.error(error.stack))
		.then(improveRandomRepo)
}

improveRandomRepo()
