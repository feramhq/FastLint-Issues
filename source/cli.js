#! /usr/bin/env node

require('babel-register')({
	only: filePath =>
		/(.*feram\/source.*|.*(node_modules|Projects)\/fix-.*)/.test(filePath)
})

const feram = require('./index').default

feram(process.argv)
