#! /usr/bin/env node

require('babel-register')

const feram = require('./index').default

feram(process.argv)
