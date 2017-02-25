'use strict';

const assert = require('assert');
const Base = require('sdk-base');
const utils = require('./utils');
const ProviderManager = require('./provider_manager');

const defaultOptions = {
  logger: console,
  consumerClass: require('./consumer'),
  providerClass: require('./provider'),
};

class DubboClient extends Base {
  /**
   * Dubbo Client
   *
   * @param {Object} options
   *   - {DubboRegistry} registry - dubbo service registry client
   *   - {String} appName - the application name
   *   - {Logger} logger - the logger instance, default is console
   * @constructor
   */
  constructor(options) {
    assert(options && options.registry, '[dubbo-client] options.registry is required');
    super(Object.assign({}, defaultOptions, options));
    this.consumerCache = new Map(); // key => consumer
    this.providerManager = options.providerManager || new ProviderManager({
      providerClass: this.options.providerClass,
    });
    this.providerManager.on('error', err => { this.emit('error', err); });
  }

  get logger() {
    return this.options.logger;
  }

  get consumerClass() {
    return this.options.consumerClass;
  }

  set consumerClass(clazz) {
    this.options.consumerClass = clazz;
  }

  get providerClass() {
    return this.options.providerClass;
  }

  set providerClass(clazz) {
    this.options.providerClass = clazz;
    this.providerManager.providerClass = clazz;
  }

  /**
   * Creates a consumer
   *
   * @param {Object} options
   *   - {String} interfaceName - the service interface name
   *   - {String} version - the service version
   *   - {String} group - the service group
   * @return {DubboConsumer} consumer
   */
  createConsumer(options) {
    const key = utils.normalizeKey(options);
    if (this.consumerCache.has(key)) {
      this.logger.warn('[dubbo-client] consumer already exists, just use it, interfaceName => %s, version => %s, group => %s',
        options.interfaceName, options.version || '', options.group || '');
      return this.consumerCache.get(key);
    }
    const consumer = new this.consumerClass(Object.assign({
      logger: this.logger,
      appName: this.options.appName,
      registry: this.options.registry,
      providerManager: this.providerManager,
    }, options));
    this.consumerCache.set(key, consumer);
    return consumer;
  }

  close() {
    for (const consumer of this.consumerCache.values()) {
      consumer.close();
    }
    this.consumerCache.clear();
    this.providerManager.close();
  }
}

module.exports = DubboClient;
