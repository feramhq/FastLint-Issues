import request from 'request-promise'

export default (repoUrl, options) => {
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
