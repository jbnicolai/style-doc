var fs = require('fs');
var docBlockParserFactory = require('doc-block-parser');
var marked = require('marked');
var mkdirp = require('mkdirp');
var del = require('del');
var globArray = require('glob-array');
var _ = require('lodash');
var exec = require('child_process').exec;
var asyncBlock = require('asyncblock');
var oneColor = require('onecolor');
var util = require('util');
var chalk = require('chalk');
var bluebird = require('bluebird');
var ncp = require('ncp').ncp
var logMessage = function(message) {
  if(!chalk.hasColor(message)) {
    message = chalk.cyan(message);
  }

  console.log(chalk.magenta('Style Doc: ') + message);
};
var configFileName = 'style-doc.json';

//TODO: figure out how to get the output of this to show
var childProcess = function(command, arguments, cb) {
  var childProcess = exec(command + ' ' + arguments.join('  '), {}, cb);
};

module.exports = {
  create: function() {
    var styleDoc = {
      options: {
        templatePath: __dirname + '/../templates/' + 'default',
        outputPath: 'styleguide',
        externalAssetsPath: 'style-doc-assets'
      },

      parser: null,

      docBlocks: [],

      sections: [],

      topLevelSections: [],

      template: null,

      variables: {},

      initialize: function() {
        var self = this;
        //look for the style-docer .json configuration file
        var directoryChanged = false;

        if(!fs.existsSync(configFileName)) {
          logMessage('looking for ' + configFileName + ' file');
          directoryChanged = true;

          while(!fs.existsSync('style-doc.json') && process.cwd() !== '/') {
            process.chdir('..');
          }
        }

        //if we still could not find the style-docer.json file, error out
        if(!fs.existsSync(configFileName)) {
          logMessage(chalk.red('could not find ' + configFileName));
          process.exit(1);
        }

        if(directoryChanged) {
          logMessage('changed process working directory to: ' + process.cwd());
        }

        _.extend(this.options, require(process.cwd() + '/' + configFileName));

        this.parser = docBlockParserFactory.create({
          tagValueParsers: {
            sassVariable: function(tagContent, fileContents) {
              var match;
              var tagContentParts = tagContent.split(' ');
              var regex = new RegExp('\\' + tagContentParts[0] + ':\\s(.*);', 'g');

              if(match = regex.exec(fileContents)) {
                var color = oneColor(match[1]);
                var returnObject = {
                  name: tagContentParts[0],
                  value: match[1],
                  type: 'value'
                };

                if(color) {
                  returnObject.type = 'color';
                }

                if(tagContentParts.length > 1) {
                  returnObject.description = tagContentParts.slice(1, tagContentParts.length).join(' ');
                }

                //keep a copy of all variables incase another variable uses a variables as it's value
                self.variables[returnObject.name] = returnObject;

                return returnObject;
              } else {
                return tagContent
              }
            },
            sassMixinParamter: function(tagContent, fileContents) {
              var tagContentParts = tagContent.split(' ');
              var parameterType = tagContentParts[0];
              var parameterName = tagContentParts[1];
              var parameterDescription = tagContentParts.slice(2, tagContentParts.length).join( ' ');

              return {
                name: parameterName,
                type: parameterType,
                description: parameterDescription
              };
            }
          },
          tagParserMap: {
            'var': 'sassVariable',
            'param': 'sassMixinParamter'
          },
          multiValueTags: [
            'var',
            'param'
          ]
        });

        this.template = _.template(fs.readFileSync(this.options.templatePath + '/index.html', {
          encoding: 'utf8'
        }));
      },

      generateStyleGuide: function() {
        logMessage('starting style guide generation');

        this._process();
        this._clearOutputDirectory();
        this._copyTemplateStaticAssets();
        this._generateSectionPages();
        this._generateExternalStyles().then(function() {
          if(fs.existsSync(process.cwd() + '/' + this.options.externalAssetsPath)) {
            logMessage('copying external assets');
            ncp(process.cwd() + '/' + this.options.externalAssetsPath, process.cwd() + '/' + this.options.outputPath, function() {
              logMessage(chalk.green('style guide generated'));
            });
          } else {
            logMessage(chalk.green('style guide generated'));
          }
        }.bind(this));
      },

      _process: function() {
        this.docBlocks = this.parser.parse(this.options.source);
        this._processVariableVariables();
        this._combineDocBlocks();
        this._generateSectionData();
      },

      _generateSectionData: function() {
        var grouped = {};

        grouped[0] = [{
          section: 0,
          title: 'Overview',
          description: marked(fs.readFileSync(this.options.overview, {
            encoding: 'utf8'
          }))
        }];

        if(this.docBlocks.length > 0) {
          this.docBlocks.forEach(function(docBlock) {
            if(!grouped[docBlock.section]) {
              grouped[docBlock.section] = [];
            }

            //process description mark down
            docBlock['description'] = this._duplicateCodeExamples(docBlock['description'], 'html');
            docBlock['description'] = marked(docBlock['description']);

            if(!docBlock['title']) {
              docBlock['title'] = docBlock.subsection ? docBlock.subsection : docBlock.section;
            }

            grouped[docBlock.section].push(docBlock);
          }.bind(this));
        }

        //sort by section automatically section
        //TODO: add user defined sorting?
        groupedKeys = Object.keys(grouped);
        groupedKeys.sort();
        temp = {};
        groupedKeys.forEach(function(key) {
          temp[key] = grouped[key];
        });
        grouped = temp;

        //sort sections by sub section
        //TODO: add user defined sorting?
        _.forEach(grouped, function(group, key) {
          grouped[key].sort(this.parser.generateSorter('subsection', 'alpha'));
        }, this);

        this.sections = grouped;

        _.forEach(this.sections, function(section, key) {
          if(key != 0) {
            this.topLevelSections.push({
              section: section[0].section,
              title: section[0].title
            });
          }
        }, this);
      },

      _duplicateCodeExamples: function(description, exampleType) {
        exampleType = exampleType || html;
        var newDescription = '';
        var currentHtmlExample = '';
        var isHtmlExample = false;

        if(description) {
          description.split('\n').forEach(function(line) {
            if(line === '```' + exampleType) {
              isHtmlExample = true;
              currentHtmlExample += line + '\n';
            } else if (isHtmlExample === true) {
              currentHtmlExample += line + '\n';

              if(line === '```') {
                isHtmlExample = false;
                newDescription += '\n' + currentHtmlExample.split('\n').slice(1, currentHtmlExample.split('\n').length - 2).join('\n') + '\n';
                newDescription += currentHtmlExample;
                currentHtmlExample = '';
              }
            } else {
              newDescription += line + '\n';
            }
          }.bind(this));
        }

        return newDescription;
      },

      _combineDocBlocks: function() {
        var combinedDocBlocks = [];
        var currentDocBlock = null;

        this.docBlocks.forEach(function(docBlock, key) {
          if(key === 0) {
            currentDocBlock = docBlock;
            return;
          }

          //if we have a section, let save the currect block and start a new one, else we combine this block with the current one assuming that it should be included
          //in the previous section
          if(docBlock.section) {
            combinedDocBlocks.push(currentDocBlock);
            currentDocBlock = docBlock
          } else {
            //combine var declarations
            if(docBlock.var) {
              if(!currentDocBlock.var) {
                currentDocBlock.var = docBlock.var;
              } else {
                currentDocBlock.var = currentDocBlock.var.concat(docBlock.var);
              }
            }
          }
        }.bind(this));

        //make sure to add the last doc block
        if(currentDocBlock) {
          combinedDocBlocks.push(currentDocBlock);
        }

        this.docBlocks = combinedDocBlocks;
      },

      _copyTemplateStaticAssets: function() {
        logMessage('copying static assets from template directory for output');

        var files = globArray.sync([
          this.options.templatePath + '/*.css',
          this.options.templatePath + '/*.js',
          this.options.templatePath + '/*.svg',
          this.options.templatePath + '/*.license'
        ]);

        files.forEach(function(file) {
          fs.writeFileSync(this.options.outputPath + '/' + file.split('/')[file.split('/').length - 1], fs.readFileSync(file));
        }.bind(this));
      },

      _clearOutputDirectory: function() {
        logMessage('clearing output directory');

        del.sync(this.options.outputPath, {
          force: true
        });
        mkdirp.sync(this.options.outputPath);
      },

      _generateSectionPages: function() {
        logMessage('generating html files for all the sections');

        _.forEach(this.sections, function(section, key) {
          var filePath = this.options.outputPath + '/';
          var data = {
            currentTopSection: key,
            topLevelSections: this.topLevelSections,
            currentSections: section
          }

          if(key == 0) {
            filePath += 'index.html';
          } else {
            filePath += 'section-' + section[0].section.toLowerCase().replace(/\s/g, '-') + '.html';
          }

          if(this.options.customJavaScriptIncludes) {
            data.customJavaScriptIncludes = this.options.customJavaScriptIncludes;
          }

          logMessage('generating ' + filePath + ' file');

          fs.writeFileSync(filePath, this.template(data));
        }, this);
      },

      _generateExternalStyles: function() {
        var defer = bluebird.defer();

        logMessage('compiling external styles');

        asyncBlock(function(flow) {
          var externalStyleContent = '';

          if(this.options.externalStyles) {
            if(!_.isArray(this.options.externalStyles)) {
              this.options.externalStyles = [this.options.externalStyles];
            }

            this.options.externalStyles.forEach(function(externalStyle) {
              if(externalStyle.type === 'sass') {
                childProcess('sass', [
                  '--scss',
                  '-q',
                  '-t',
                  'compressed',
                  externalStyle.file,
                  this.options.outputPath + '/temp.css'
                ], flow.add(0));

                var test = flow.wait();
                externalStyleContent += fs.readFileSync(this.options.outputPath + '/temp.css', {
                  encoding: 'utf-8'
                });
                del.sync(this.options.outputPath + '/temp.css');
              } else if(externalStyle.type === 'css') {
                externalStyleContent += fs.readFileSync(process.cwd() + '/' + externalStyle.file, {
                  encoding: 'utf-8'
                });
              }
            }.bind(this));
          }

          fs.writeFileSync(this.options.outputPath + '/external.css', externalStyleContent);
          defer.resolve();
        }.bind(this));

        return defer.promise;
      },

      _processVariableVariables: function() {
        this.docBlocks.forEach(function(docBlock, docBlockKey) {
          if(docBlock.var) {
            docBlock.var.forEach(function(variable, variableKey) {
              if(this.variables[variable.value]) {
                this.docBlocks[docBlockKey].var[variableKey] = _.extend(_.clone(this.variables[variable.value], true), {name: this.docBlocks[docBlockKey].var[variableKey].name});
              }
            }.bind(this));
          }
        }.bind(this));
      }
    };

    return Object.create(styleDoc);
  }
};
