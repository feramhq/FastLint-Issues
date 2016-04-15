import chalk from 'chalk'
import cssTypoFixes from './cssTypoFixes'

export default (fileContent, filePath) => {
	let isChanged = false

	for (const typo in cssTypoFixes) {
		const typoRegex = new RegExp(`(\\W)${typo}(\\W)`, 'g')

		if (!typoRegex.test(fileContent)) {
			continue
		}

		isChanged = true

		fileContent = fileContent.replace(
			typoRegex,
			(match, p1, p2) => {
				const replacement = p1 + cssTypoFixes[typo] + p2
				console.log(
					chalk.yellow(JSON.stringify(match)) +
					' -> ' +
					chalk.green(JSON.stringify(replacement)) +
					chalk.gray(' in ' + filePath)
				)
				return replacement
			}
		)
	}

	return isChanged ? fileContent : null
}
