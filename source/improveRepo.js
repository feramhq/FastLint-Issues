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
	user: 'adius',
	password: process.env.FERAM_PASSWORD,
	author: 'Adrian Sieber',
	commiter: 'Adrian Sieber',
	email: 'mail@adriansieber.com',
}

fsp.mkdir(reposPath)


function getRepoPromiseByUrl (repoUrl, options) {
	const matches = repoUrl.match(/^(.+):(.+)\/(.+)$/)

	if (!matches) {
		throw new Error('No valid repo-url was provided')
	}

	const targetRepo = {
		provider: matches[1],
		user: matches[2],
		name: matches[3],
	}

	if (targetRepo.provider !== 'github') {
		throw new Error('GitHub is currently the only supported provider')
	}

	const config = Object.assign(
		{
			uri: `${options.apiUri}/repos/${targetRepo.user
				}/${targetRepo.name}`,
		},
		options.apiDefaults,
	)

	return request(config)
		.then(response => JSON.parse(response))
}

function getRandomRepoPromise (options) {
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
	const searchString = `size:<10000 ${dateRangeString}`

	const config = Object.assign(
		{
			uri: `${options.apiUri}/search/repositories`,
			qs: {
				q: searchString,
				sort: 'updated',
				per_page: 1,
			}
		},
		options.apiDefaults,
	)

	return request(config)
		.then(searchResponse => {
			const searchObject = JSON.parse(searchResponse)

			if (!searchObject.total_count) {
				throw new Error('No repos were found')
			}

			return _.sample(searchObject.items)
		})
}


export default function improveRepo (options = {}) {

	// Remove undefined keys
	options = JSON.parse(JSON.stringify(options))

	options = Object.assign(
		{},
		defaults,
		options,
	)

	const {dry, user, password, author, commiter, email, apiUri} = options

	options.apiDefaults = {
		headers: {
			'User-Agent': 'feram',
		},
		auth: {user, pass: password},
	}

	const repoUrl = options._[2]
	let config = {}
	let repoPromise

	if (repoUrl) {
		repoPromise = getRepoPromiseByUrl(repoUrl, options)
	}
	else { // Use random repo
		repoPromise = getRandomRepoPromise(options)
	}

	let hoistedGitRepo
	let hoistedRepoObject

	repoPromise
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
		.then(changedFiles => {
			if (!changedFiles) {
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
				options.apiDefaults,
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
					credentials: () => Cred.userpassPlaintextNew(user, password)
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
				options.apiDefaults,
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
				util.inspect(error, {depth: null})
			))
		})
		.then(() => console.log('\n'))
		.then(() => {
			if (!repoUrl) {
				return improveRepo(options)
			}
		})
}
