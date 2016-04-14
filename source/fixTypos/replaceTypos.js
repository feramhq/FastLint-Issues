import chalk from 'chalk'
import typoFixMap from './typoFixMap'

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
				const replacement = p1 + typoFixMap[typo] + p2
				console.log(chalk.green(
					`"${match}" => "${replacement}" in ${filePath}`
				))
				return replacement
			}
		)
	}

	return (!isChanged) ? null : fileContent
}
