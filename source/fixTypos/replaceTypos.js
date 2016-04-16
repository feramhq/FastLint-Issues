import chalk from 'chalk'

function isLowerCase (string) {
	return string === string.toLowerCase() &&
		string !== string.toUpperCase()
}

export default (fileContent, filePath, typoMap) => {
	let isChanged = false

	for (const typo in typoMap) {
		const typoRegex = new RegExp(`(\\W)${typo}(\\W)`, 'gi')

		if (!typoRegex.test(fileContent)) {
			continue
		}

		isChanged = true

		fileContent = fileContent.replace(
			typoRegex,
			(match, p1, p2) => {
				const replacement = p1 +
					(isLowerCase(match[1]) ?
						typoMap[typo] :
						typoMap[typo].slice(0, 1).toUpperCase() +
					 	typoMap[typo].slice(1)
					) +
					p2

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
