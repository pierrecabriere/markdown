/**
 * @license
 * 
 * marked tests
 * Copyright (c) 2011-2013, Christopher Jeffrey. (MIT Licensed)
 * https://github.com/chjj/marked
 * 
 * marked-ts tests
 * Copyright (c) 2018, Третяк Костя. (MIT Licensed)
 * https://github.com/KostyaTretyak/marked-ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { Marked,
  MarkedOptions,
  Replacements,
  DebugReturns,
  Token,
  Links,
  TokenType
} from '../';

interface RunTestsOptions
{
  files?: {[key: string]: any},
  marked?: MarkedOptions,
  stop?: boolean
}

const testDir = path.normalize(__dirname + '/../test/tests');

/**
 * Execute
 */
main();

function main()
{
  const opt = parseArg();
  return runTests(opt);
}

function runTests(options?: RunTestsOptions): boolean;
function runTests(engine: Function, options?: RunTestsOptions): boolean;
function runTests(functionOrEngine?: Function | RunTestsOptions, options?: RunTestsOptions): boolean
{
  if(typeof functionOrEngine != 'function')
  {
    options = functionOrEngine;
    functionOrEngine = null;
  }

  const engine: (md: string) => DebugReturns = functionOrEngine || Marked.debug.bind(Marked);
  options = options || {};
  const files = options.files || load();
  const filenames = Object.keys(files);

  let original: MarkedOptions
  ,filename
  ,failed = 0
  ,complete = 0
  ,file: {text: string, html: string}
  ,flags
  ,actualRows: string[]
  ,actualStr: string
  ,expectedRows: string[]
  ,expectedStr: string
  ,tokens: Token[]
  ,links: Links
  ,result: string
  ;

  if(options.marked)
  {
    Marked.setOptions(options.marked);
  }

  const len = filenames.length;

  mainFor:
  for(let indexFile = 0; indexFile < len; indexFile++)
  {
    filename = filenames[indexFile];
    file = files[filename];

    if(original)
    {
      Marked.options = original;
      original = null;
    }

    flags = filename.split('.').slice(1);

    if(flags.length)
    {
      original = Marked.options;
      Marked.options = {...original};

      flags.forEach( key =>
      {
        let val = true;

        if(key.indexOf('no') === 0)
        {
          key = key.substring(2);
          val = false;
        }

        if(Marked.options.hasOwnProperty(key))
        {
          (<any>Marked.options)[key] = val;
        }
      });
    }

    try
    {
      expectedRows = file.html.split('\n');
      ({result, tokens, links} = engine(file.text));
      fs.writeFileSync(`${testDir}/${filename}-actual.html`, result, 'utf8');
      tokens = transform(tokens);
      actualRows = result.split('\n');
    }
    catch(e)
    {
      console.log('%s failed.', filename);
      throw e;
    }

    const lenRows = Math.max(expectedRows.length, actualRows.length);

    for(let indexRow = 0; indexRow < lenRows; indexRow++)
    {
      let expectedRow = expectedRows[indexRow];
      let actualRow = actualRows[indexRow];
      // 1 to check empty rows.
      const lenStr = Math.max(expectedRows.length, actualRows.length) || 1;

      for(let indexChar = 0; indexChar < lenStr; indexChar++)
      {
        if
        (
          expectedRow !== undefined
          && actualRow !== undefined
          && expectedRow[indexChar] === actualRow[indexChar]
        )
        {
          continue;
        }

        failed++;

        if(expectedRow !== undefined)
        expectedRow = expectedRow.substring
        (
          Math.max(indexChar - 30, 0),
          Math.min(indexChar + 30, expectedRow.length)
        );

        if(actualRow !== undefined)
        actualRow = actualRow.substring
        (
          Math.max(indexChar - 30, 0),
          Math.min(indexChar + 30, actualRow.length)
        );

        expectedRow = escapeAndShow(expectedRow);
        actualRow = escapeAndShow(actualRow);
        const erroredLine = indexRow + 1;
        const indexBefore = findIndexBefore(tokens, erroredLine);
        const indexAfter = findIndexAfter(tokens, erroredLine, lenRows);

        console.log(`\n#${indexFile + 1}. failed ${filename}.md`);
        console.log(`\nExpected:\n~~~~~~~~> in ${testDir}/${filename}.html:${erroredLine}:${indexChar + 1}\n\n'${expectedRow}'\n`);
        console.log(`\nActual:\n--------> in ${testDir}/${filename}-actual.html:${erroredLine}:${indexChar + 1}\n\n'${actualRow}'\n`);
        console.log(`\nExcerpt tokens:`, tokens.filter((token, index) => (index >= indexBefore && index <= indexAfter)));
        console.log(`links:`,links);

        if(options.stop)
        {
          break mainFor;
        }

        continue mainFor;
      }
    }

    complete++;
    console.log(`#${indexFile + 1}. ${filename}.md completed.`);
  }

  console.log('%d/%d tests completed successfully.', complete, len);

  if(failed)
  {
    console.log('%d/%d tests failed.', failed, len);
    // console.log(`tokens:`, tokens);
  }

  return !failed;
}

/**
 * Searches for the maximum line number preceding the error line number,
 * and returns its index from an array of tokens.
 * 
 * Here, "line number" refers to the line number of the resulting HTML file.
 */
function findIndexBefore(tokens: Token[], erroredLine: number)
{
  let indexBefore = 0;

  tokens.reduce( (acc, token, index) =>
  {
    if(token.line < erroredLine)
    {
      const nextMax = Math.max(acc, token.line);
      if(acc !== nextMax)
      {
        indexBefore = index;
      }
      return nextMax;
    }
    else
    {
      return acc;
    }
  }, 0);

  return indexBefore;
}

/**
 * Searches for the minimum line number that goes after the error line number,
 * and returns its index from an array of tokens.
 * 
 * Here, "line number" refers to the line number of the resulting HTML file.
 */
function findIndexAfter(tokens: Token[], erroredLine: number, lenRows: number)
{
  let indexAfter = tokens.length - 1;

  tokens.reduce( (acc, token, index) =>
  {
    if(token.line > erroredLine)
    {
      const nextMin = Math.min(acc, token.line);
      if(nextMin !== acc)
      {
        indexAfter = index;
      }
      return nextMin;
    }
    else
    {
      return acc;
    }
  }, lenRows);

  return indexAfter;
}

/**
 * Translates a token type into a readable form,
 * and moves `line` field to the first place in a token object.
 */
function transform(tokens: Token[])
{
  return tokens.map( token =>
  {
    token.type = (<any>TokenType)[token.type] || token.type;

    const line = token.line;
    delete token.line;
    if(line)
      return {...{line}, ...token};
    else
      return token;
  });
}

function escapeAndShow(str: string)
{
  if(str === '')
    return '\\n';
  else if(str === undefined)
    return `[missing '\\n' here]`;

  const escapeReplace = /[\r\t\f\v]/g;
  const replacements: Replacements =
  {
    '\r': '\\r',
    '\t': '\\t',
    '\f': '\\f',
    '\v': '\\v'
  };

  return str.replace(escapeReplace, (ch: string) => replacements[ch]);
}

/**
 * Load Tests
 */

function load()
{
  let files: {[key: string]: any} = {};

  const list = fs
  .readdirSync(testDir)
  .filter(file => path.extname(file) == '.md')
  .sort((fileName1, fileName2) =>
  {
    const a = path.basename(fileName1).toLowerCase().charCodeAt(0);
    const b = path.basename(fileName2).toLowerCase().charCodeAt(0);
    return a > b ? 1 : (a < b ? -1 : 0);
  });

  const length = list.length;

  for(let i = 0; i < length; i++)
  {
    const file = path.join(testDir, list[i]);
    const ext = path.extname(file);
    const fineName = path.basename(file).replace(ext, '');

    files[fineName] =
    {
      text: fs.readFileSync(file, 'utf8'),
      html: fs.readFileSync(file.replace(/[^.]+$/, 'html'), 'utf8')
    };
  }

  return files;
}

/**
 * Argument Parsing
 */

function parseArg(): RunTestsOptions
{
  const argv = process.argv.slice(2);
  const options: RunTestsOptions = {};

  for(let i = 0; i < argv.length; i++)
  {
    let [key, value] = argv[i].split('=');

    // In `argv` we have next parameter or value of current parameter.
    if(!value && argv[i + 1])
    {
      value = argv[i + 1].split('-')[0];

      // Skip next parameter.
      if(value) i++;
    }

    switch (key)
    {
      case '-s':
      case '--stop':
        options.stop = true;
        break;
    }
  }

  return options;
}
