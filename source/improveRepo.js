import path from 'path'
import util from 'util'

import fsp from 'fs-promise'
import request from 'request-promise'
import nodegit, {Clone, Signature, Remote, Cred} from 'nodegit'
import _ from 'lodash'
import chalk from 'chalk'

import fixTypos from './fixTypos'

const rootPath = path.resolve(__dirname, '..')
const reposPath = path.join(rootPath, 'repos')
const disclaimer = fsp.readFileSync(
	path.join(rootPath, 'disclaimer.md'),
	'utf8'
)
const defaults = {
	apiUri: 'https://api.github.com',
	headers: {
		'User-Agent': 'feram',
	},
	user: 'adius',
	password: process.env.FERAM_PASSWORD,
	author: 'Adrian Sieber',
	commiter: 'Adrian Sieber',
	email: 'mail@adriansieber.com',
}

fsp.mkdir(reposPath)


export default function improveRepo (options = {}) {

	// Remove undefined keys
	options = JSON.parse(JSON.stringify(options))

	options = Object.assign(
		{},
		defaults,
		options,
	)

	const {dry, user, password, author, commiter, email, apiUri} = options

	const apiDefaults = {
		headers: options.headers,
		auth: {user, pass: password}
	}


	const maxDaysAgo = 300
	let randomMoment = new Date()
	randomMoment.setUTCDate(
		randomMoment.getUTCDate() - Math.trunc(Math.random() * maxDaysAgo)
	)
	let randomMomentOffset = new Date(randomMoment)
	randomMomentOffset.setUTCHours(randomMomentOffset.getUTCHours() + 2)

	const dateRangeString = 'pushed:"' +
		randomMoment.toISOString() +
		' .. ' +
		randomMomentOffset.toISOString() +
		'"'

	// Smaller than 10 Mb
	const searchString = 'size:<10000 ' + dateRangeString

	const config = Object.assign(
		{
			uri: apiUri + '/search/repositories',
			qs: {
				q: searchString,
				sort: 'updated',
				per_page: 1,
			}
		},
		apiDefaults,
	)
	let hoistedGitRepo
	let hoistedRepoObject

	return request(config)
		.then(searchResponse => {
			const searchObject = JSON.parse(searchResponse)

			if (!searchObject.total_count) {
				throw new Error('No repos were found')
			}

			return _.sample(searchObject.items)
		})
		.then(repoObject => {
			console.log(chalk.blue.underline('Repo: ' + repoObject.html_url))
			hoistedRepoObject = repoObject

			process.stdout.write('- Clone')
			return Clone.clone(
				repoObject.html_url,
				path.join(reposPath, repoObject.full_name)
			)
		})
		.then(gitRepo => {
			console.log(chalk.green(' ✔'))
			if (gitRepo.isEmpty()) {
				throw new Error('Repo is empty')
			}
			hoistedGitRepo = gitRepo

			process.stdout.write('- Get head commit')
			return gitRepo.getHeadCommit()
		})
		.then(commit => commit.getTree())
		.then(tree => {
			console.log(chalk.green(' ✔'))
			const signature = Signature.now(author, email)
			return fixTypos(hoistedGitRepo, tree, signature)
		})
		.then((matchedFiles) => {
			const changedFiles = matchedFiles.filter(file => Boolean(file))
			if (!changedFiles.length) {
				throw new Error('unfixable')
			}
			if (dry) {
				throw new Error('dry run')
			}

			process.stdout.write('- Initialize fork')
			return request.post(Object.assign(
				{
					uri: `${apiUri}/repos/${hoistedRepoObject.full_name}/forks`
				},
				apiDefaults,
			))
		})
		.then(forkResponse => {
			console.log(chalk.green(' ✔'))

			const forkObject = JSON.parse(forkResponse)
			// console.dir(forkObject, {depth: null, colors: true})

			process.stdout.write('- Wait for fork to be available')
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
									process.stdout.write(' .')
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
			console.log(chalk.green(' ✔'))

			process.stdout.write('- Push repo to Fork')
			Remote.setPushurl(hoistedGitRepo, 'origin', fork.html_url)
			return hoistedGitRepo.getRemote('origin')
		})
		.then(remote => remote.push(
			['refs/heads/master:refs/heads/master'],
			{
				callbacks: {
					credentials: (url) => Cred.userpassPlaintextNew(
						user,
						options.password,
					)
				}
			}
		))
		.then(() => {
			console.log(chalk.green(' ✔'))

			process.stdout.write('- Create merge request')
			return request.post(Object.assign(
				{
					uri: `${apiUri}/repos/${hoistedRepoObject.full_name}/pulls`,
					json: true,
					body: {
						title: 'Minor fixes',
						body: disclaimer,
						head: user + ':master',
						base: 'master',
					},
				},
				apiDefaults,
			))
		})
		.then(mergeRequestResponse => console.log(
			chalk.green(' ✔ ') + chalk.gray(mergeRequestResponse.html_url)
		))
		.catch(error => {
			if (error.message === 'unfixable') {
				return console.log(chalk.red('- Nothing to fix'))
			}
			if (error.message === 'dry run') {
				return console.log(
					chalk.cyan('- Dry run => Stop execution')
				)
			}
			console.error(chalk.red(
				util.inspect(error, {showHidden: true, depth: null})
			))
		})
		.then(() => console.log('\n'))
		.then(() => improveRepo(options))
}
