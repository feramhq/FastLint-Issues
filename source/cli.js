#! /usr/bin/env node

require('babel-register')({
	ignore: fileName =>
		/.*node_modules.*/.test(fileName) && !/.*fix-typos.*/.test(fileName)
})

const feram = require('./index').default

feram(process.argv)
