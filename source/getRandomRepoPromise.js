import _ from 'lodash'
import request from 'request-promise'

export default (options) => {
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
