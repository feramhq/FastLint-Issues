import path from 'path'

import fsp from 'fs-promise'
import request from 'request-promise'
import nodegit, {Clone, Signature, Remote, Cred} from 'nodegit'
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
const userName = 'adius'
const author = 'Adrian Sieber'
const commiter = 'Adrian Sieber'
const email = 'mail@adriansieber.com'
const rootPath = path.resolve(__dirname, '..')
const reposPath = path.join(rootPath, 'repos')
const disclaimer = fsp.readFileSync(
	path.join(rootPath, 'disclaimer.md'),
	'utf8'
)
const developmentMode = (process.env.NODE_ENV !== 'production')

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
					// 'Parallel.js is a tiny library for multi-core processing in Javascript',
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
	let hoistedRepoObject

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
			hoistedRepoObject = repoObject
			return Clone.clone(
				repoObject.html_url,
				path.join(reposPath, repoObject.full_name)
			)
		})
		.then(gitRepo => {
			console.log('- Clone')
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
		.then((matchedFiles) => {
			const changedFiles = matchedFiles.filter(file => Boolean(file))
			if (!changedFiles.length) {
				throw new Error('unfixable')
			}
			if (developmentMode) {
				throw new Error('development mode')
			}

			return request.post(Object.assign(
				{
					uri: `${apiUri}/repos/${hoistedRepoObject.full_name}/forks`
				},
				defaults
			))
		})
		.then(forkResponse => {
			console.log('- Initialized forking')

			const forkObject = JSON.parse(forkResponse)
			// console.dir(forkObject, {depth: null, colors: true})

			return new Promise((resolve, reject) => {
				// Poll until fork was created
				function pollRepo () {
					setTimeout(
						() => request
							.head({uri: forkObject.html_url})
							.then(headResponse => {
								if (headResponse.status === '200 OK') {
									resolve(forkObject)
								}
								else {
									console.log(
										'Fork not yet created.',
										'Trying again …'
									)
									pollRepo()
								}
							})
						,
						2000
					)
				}
				pollRepo()
			})
		})
		.then(fork => {
			console.log('- Fork is available')

			Remote.setPushurl(hoistedGitRepo, 'origin', fork.html_url)

			return hoistedGitRepo.getRemote('origin')
		})
		.then(remote => remote.push(
			['refs/heads/master:refs/heads/master'],
			{
				callbacks: {
					credentials: (url) => Cred.userpassPlaintextNew(
						userName,
						defaults.auth.pass
					)
				}
			}
		))
		.then(() => {
			console.log('- Fork was updated')
			return request.post(Object.assign(
				{
					uri: `${apiUri}/repos/${hoistedRepoObject.full_name}/pulls`,
					json: true,
					body: {
						title: 'Minor fixes',
						body: disclaimer,
						head: userName + ':master',
						base: 'master',
					},
				},
				defaults
			))
		})
		.then(mergeRequestResponse => console.log(
			'- Merge-request was created: ' + mergeRequestResponse.html_url
		))
		.catch(error => {
			if (error.message === 'unfixable') {
				return console.log('- Nothing to fix')
			}
			if (error.message === 'development mode') {
				return console.log('- Development Mode => Stop execution')
			}
			console.error(error)
		})
		.then(() => console.log('\n'))
		.then(improveRandomRepo)
}

improveRandomRepo()
