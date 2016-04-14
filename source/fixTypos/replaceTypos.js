import chalk from 'chalk'
import typoFixMap from './extendedMap'

function isLowerCase (string) {
	return string === string.toLowerCase() &&
		string !== string.toUpperCase()
}

export default (fileContent, filePath) => {
	let isChanged = false

	for (const typo in typoFixMap) {
		const typoRegex = new RegExp(
			`(\\W)${typo}(\\W)`,
			'gi'
		)
		if (!typoRegex.test(fileContent)) { continue }

		isChanged = true

		fileContent = fileContent.replace(
			typoRegex,
			(match, p1, p2) => {
				const replacement = p1 +
					(isLowerCase(match[1]) ?
						typoFixMap[typo] :
						typoFixMap[typo].slice(0, 1).toUpperCase() +
					 	typoFixMap[typo].slice(1)
					) +
					p2

				console.log(chalk.green(
					String.raw `"${match}" => "${replacement}" in ${filePath}`
				))
				return replacement
			}
		)
	}

	return (!isChanged) ? null : fileContent
}
