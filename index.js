#!/usr/bin/env node
console.log(`This utility fixes cases where Git considers moved/renamed files as delete-creates, causing their history to become disconnected.
It does so by putting the rename in a separate commit.
The script ONLY considers staged changes!
So you can run it before committing, while editing commits during a rebase, etc...
`);

const { execSync } = require('child_process');
const { basename, extname } = require('path');
const inquirer = require('inquirer');
const leven = require('leven');
const groupBy = require('lodash.groupby');

async function selectRename(prevDone, group) {
  const choices = await prevDone;
  const keep = '<keep as deleted>';
  const from = group[0].from;
  const chosenTos = choices.map(choice => choice.to);
  const tos = group.map(m => m.to).filter(to => !chosenTos.includes(to));
  const anwsers = await inquirer.prompt([
    {
      type: 'list',
      name: 'to',
      message: `"${from}" was deleted. In stead rename it to ...`,
      default: tos[0],
      choices: [keep, ...tos],
      loop: false,
    },
  ]);
  if (anwsers.to !== keep) {
    choices.push({ from, to: anwsers.to });
  }
  return choices;
}

function doRenames(choices) {
  execSync('git reset');

  choices.forEach(({ from, to }) => {
    execSync(`git restore "${from}"`);
    execSync(`mv "${to}" "${to}.new"`);
    execSync(`git mv "${from}" "${to}"`);
    execSync(`git add "${to}"`);
    execSync(`git commit -m "renamed ${from} to ${to}"`);
    execSync(`mv -f "${to}.new" "${to}"`);
  });

  execSync('git add .');

  console.log('All done');
}

function extractFileName(path) {
  const ext = extname(path);
  return basename(path, ext);
}

const status = execSync('git status -s', { encoding: 'utf8' });

const statusLines = status
  .split('\n')
  .map(line => {
    const add = line[0] === 'A' || line[1] === 'A';
    const del = line[0] === 'D' || line[1] === 'D';
    const path = line.substr(3);
    const module = extractFileName(path);
    return { add, del, path, module };
  });

const added = statusLines.filter(l => l.add);
const deleted = statusLines.filter(l => l.del);

const matches = added.flatMap(a => deleted.map(d => ({
  to: a.path,
  from: d.path,
  dist: leven(a.module, d.module),
}))).sort((a, b) => a.dist - b.dist);

if (matches.length) {
  const groups = groupBy(matches, 'from');
  Object.values(groups).reduce(selectRename, []).then(doRenames);
} else {
  console.log('No renames detected');
}