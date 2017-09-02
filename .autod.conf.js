'use strict';

module.exports = {
  write: true,
  prefix: '^',
  devprefix: '^',
  devdep: [
    'egg-bin',
    'egg-ci',
    'eslint',
    'eslint-config-egg'
  ],
  test: [
    'test',
    'example'
  ],
};
