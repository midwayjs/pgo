'use strict';
let cost = null;
const startTime = Date.now();

require('eslint');
require('lodash');
require('egg');
require('react-dom/server');
require('grunt');
require('jsdom');
require('jquery');
require('esprima');
require('vue');
require('rax');

exports.initializer = (context, callback) => {
  cost = Date.now() - startTime;
  callback(null, '');
};

exports.handler = (event, context, callback) => {
  const { JSDOM } = require('jsdom')
  const dom = new JSDOM(`<!DOCTYPE html><title>dom title via js dom</title><p>Hello world</p>`);
  let urllib = null;
  try {
    urllib = require('urllib');
  } catch(err) {
    urllib = err;
  }
  callback(null, JSON.stringify({
    service: context.service.name,
    function: context.function.name,
    cost, ...pgoHelper.flags,
    testRun: dom.window.document.title,
    urllib
  }));
};