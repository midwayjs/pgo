#!/usr/bin/env node
'use strict';
const { PGO } = require('../dist');
const minimist = require('minimist');
const argv = minimist(process.argv.slice(2));
const pgo = new PGO(process.cwd(), argv);
pgo.gen();
