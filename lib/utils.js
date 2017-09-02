'use strict';

/**
 * get service unique key
 *
 * @param {Object} serviceInfo
 *   - {String} interfaceName - the service interface name
 *   - {String} version - the service version
 *   - {String} group - the service group
 * @return {String} unique key
 */
exports.normalizeKey = serviceInfo => {
  let key = serviceInfo.interfaceName;
  if (serviceInfo.group) {
    key = `${serviceInfo.group}/${key}`;
  }
  if (serviceInfo.version) {
    key = `${key}:${serviceInfo.version}`;
  }
  return key;
};
