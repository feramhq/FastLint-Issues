import yargs from 'yargs'
import improveRepo from './improveRepo'

export default (argv) => {
	const options = yargs
		.options({
			'dry': {
				describe: 'Do not push & do not create merge request for changes',
				type: 'boolean',
			},
			'user': {
				demand: true,
				describe: 'Feram acts in behalf of this user',
				type: 'string',
			},
			'password': {
				describe: 'Password for the user',
				type: 'string',
			},
		})
		.usage('feram <repo-url>')
		.example(
			'feram --dry --user octocat --password 12345',
			'Feram gets a random repo, fixes it on behalf of octocat, ' +
			'but doesn\'t push the changes',
		)
		.help()
		.parse(argv)

	improveRepo(options)
}
