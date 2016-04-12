import path from 'path'

import fsp from 'fs-promise'
import request from 'request-promise'
import nodegit, {Clone, Signature} from 'nodegit'
import _ from 'lodash'

import fixTypos from './fixTypos'

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
					'Parallel.js is a tiny library for multi-core processing in Javascript',
					// 'size:<10000', // Smaller than 10 Mb
					// `pushed:${randomDaysAgo}`
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
			const signature = Signature.now(author, email)
			return fixTypos(hoistedGitRepo, tree, signature)
		})
		.then(console.log)
		.catch(error => console.error(error.stack))
		// .then(improveRandomRepo)
}

improveRandomRepo()
