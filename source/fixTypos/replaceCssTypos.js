import chalk from 'chalk'
import cssTypoFixes from './cssTypoFixes'

export default (fileContent, filePath) => {
	let isChanged = false

	for (const typo in cssTypoFixes) {
		const typoRegex = new RegExp(
			`(\\W)${typo}(\\W)`,
			'g'
		)
		if (!typoRegex.test(fileContent)) { continue }

		isChanged = true

		fileContent = fileContent.replace(
			typoRegex,
			(match, p1, p2) => {
				const replacement = p1 + cssTypoFixes[typo] + p2
				console.log(chalk.green(
					`"${match}" => "${replacement}" in ${filePath}`
				))
				return replacement
			}
		)
	}

	return (!isChanged) ? null : fileContent
}
