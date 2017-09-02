'use strict';

const is = require('is-type-of');
const Base = require('sdk-base');
const assert = require('assert');
const utils = require('./utils');
const urlparse = require('url').parse;
const random = require('utility').random;

const defaultOptions = {
  defaultPort: 20880,
};

class DubboConsumer extends Base {
  /**
   * dubbo service consumer
   *
   * @param {Object} options
   *   - {String} interfaceName - service interface name
   *   - {String} version - service version
   *   - {String} group - service group
   *   - {Registry} registry - dubbo registry client
   *   - {ProviderManager} providerManager - provider manager
   *   - {String} appName - the application name
   *   - {Logger} logger - the logger instance
   * @constructor
   */
  constructor(options) {
    super(Object.assign({}, defaultOptions, options));

    this._inited = false;
    this._addresses = [];
    this._curIndex = null;
    this._init();
    this.ready(() => { this._inited = true; });
  }

  get logger() {
    return this.options.logger;
  }

  get registry() {
    return this.options.registry;
  }

  get providerManager() {
    return this.options.providerManager;
  }

  get serviceKey() {
    return utils.normalizeKey(this.options);
  }

  _init() {
    // @example
    // 127.0.0.1:12200,127.0.0.2:12200
    if (this.options.address) {
      setImmediate(() => {
        const urls = this.options.address.split(',');
        this._addresses = urls.map(url => {
          if (!url.includes('://')) {
            const arr = url.split(':');
            const host = arr[0];
            const port = arr[1] || this.options.defaultPort;
            const group = this.options.group ? `/${this.options.group}` : '';
            const version = this.options.version ? `?version=${this.options.version}` : '';
            url = `dubbo://${host}:${port}/${group}${this.options.interfaceName}${version}`;
          }
          return urlparse(url, true);
        });
        this._curIndex = random(urls.length);
        this.ready(true);
      });
    } else {
      this._addressesHandler = val => {
        this._addresses = val.map(url => urlparse(url, true)).filter(url => url.protocol === 'dubbo:');
        this._curIndex = random(this._addresses.length);
        if (!this._inited) {
          this.ready(true);
        }
      };
      this.registry.subscribe({
        interfaceName: this.options.interfaceName,
        version: this.options.version,
        group: this.options.group,
      }, this._addressesHandler);
    }
  }

  /**
   * Get the provider
   *
   * @param {String} methodName - the method name
   * @return {Provider} provider
   */
  * getProvider(methodName) {
    yield this.ready();
    const total = this._addresses ? this._addresses.length : 0;
    if (total === 0) {
      const err = new Error(`[dubbo-client#Consumer] No provider Can not get ${this.serviceKey}::${methodName}() address info from dubbo registry!`);
      err.name = 'DubboNoProviderError';
      throw err;
    }
    if (this._curIndex >= total) {
      this._curIndex = 0;
    }
    const address = this._addresses[this._curIndex];
    const options = { address };
    if (this.options.responseTimeout) {
      options.responseTimeout = this.options.responseTimeout;
    }
    return yield this.providerManager.getProvider(options);
  }

  * invoke(methodName, args, options) {
    assert(is.string(methodName), '[dubbo-client#consumer] methodName should be a string');
    assert(is.array(args), '[dubbo-client#consumer] args should be an array');
    yield this.ready();
    const provider = yield this.getProvider(methodName, args, options);
    return yield provider.invoke(methodName, args, options);
  }

  close() {
    if (this._addressesHandler) {
      this.registry.unSubscribe({
        interfaceName: this.options.interfaceName,
        version: this.options.version,
        group: this.options.group,
      }, this._addressesHandler);
      this._addressesHandler = null;
    }
  }
}

module.exports = DubboConsumer;
