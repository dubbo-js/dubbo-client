'use strict';

const Base = require('sdk-base');
const assert = require('assert');

class ProviderManager extends Base {
  constructor(options) {
    assert(options && options.providerClass, '[dubbo-client] options.providerClass is required');
    super(options);
    this.providers = new Map(); // hostname => provider
    this.ready(true);
  }

  get providerClass() {
    return this.options.providerClass;
  }

  set providerClass(val) {
    this.options.providerClass = val;
  }

  * getProvider(options) {
    const address = options.address;
    const key = address.host;
    let provider = this.providers.get(key);
    if (provider) {
      return provider;
    }
    provider = new this.providerClass(options);
    yield provider.ready();
    provider.on('error', err => { this.emit('error', err); });
    provider.on('close', () => { this.providers.delete(key); });
    this.providers.set(key, provider);
    return provider;
  }

  close() {
    for (const provider of this.providers.values()) {
      provider.close();
    }
  }
}

module.exports = ProviderManager;
