import path from 'path'
import util from 'util'

import fsp from 'fs-promise'
import request from 'request-promise'
import nodegit, {Clone, Signature, Remote, Cred, Repository} from 'nodegit'
import chalk from 'chalk'

import fixTypos from './fixTypos'
import getRepoPromiseByUrl from './getRepoPromise'
import getRandomRepoPromise from './getRandomRepoPromise'

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


export default function improveRepo (options = {}) {

	let hoistedGitRepo

	// Remove undefined keys
	options = JSON.parse(JSON.stringify(options))

	options = Object.assign(
		{},
		defaults,
		options,
	)

	const {dry, user, password, author,
		commiter, email, apiUri, submit} = options

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

	function fixBugsInRepo (repoObject) {

		console.log(chalk.blue.underline(repoObject.full_name))
		console.log(chalk.gray(`(${repoObject.html_url})`))

		process.stdout.write('- Clone')

		return Clone
			.clone(
				repoObject.html_url,
				path.join(reposPath, repoObject.full_name)
			)
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
			.then(filesHaveChanged => {
				if (!filesHaveChanged) {
					throw new Error('unfixable')
				}
				return repoObject
			})
	}

	function forkAndCreateMergeRequest (repoObject) {
		process.stdout.write('- Initialize fork')

		return request
			.post(Object.assign(
				{
					uri: `${apiUri}/repos/${repoObject.full_name}/forks`
				},
				options.apiDefaults,
			))
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

				const repoPromise = hoistedGitRepo ?
					Promise.resolve(hoistedGitRepo) :
					Repository.open(path.join(reposPath, repoObject.full_name))

				return repoPromise
					.then(gitRepo => {
						process.stdout.write('- Push repo to Fork')
						Remote.setPushurl(gitRepo, 'origin', fork.html_url)
						return gitRepo.getRemote('origin')
					})
			})
			.then(remote => remote.push(
				['refs/heads/master:refs/heads/master'],
				{
					callbacks: {
						credentials: () =>
							Cred.userpassPlaintextNew(user, password)
					}
				}
			))
			.then(() => {
				console.log(chalk.green(' ✔'))

				process.stdout.write('- Create merge request')
				return request.post(Object.assign(
					{
						uri: `${apiUri}/repos/${repoObject.full_name
							}/pulls`,
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
	}

	repoPromise
		.then(repoObject => {
			if (!submit) {
				return fixBugsInRepo(repoObject)
			}
			return repoObject
		})
		.then(repoObject => {
			if (dry) {
				chalk.cyan('- Dry run => Stop execution')
				return
			}
			return forkAndCreateMergeRequest(repoObject)
		})
		.catch(error => {
			if (error.message === 'unfixable') {
				return console.log(chalk.red('- Nothing to fix'))
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
