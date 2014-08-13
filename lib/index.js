#!/usr/bin/env node
var styleDocFactory = require('./style-doc');

var styleDoc = styleDocFactory.create();

styleDoc.initialize();
styleDoc.generateStyleGuide();
