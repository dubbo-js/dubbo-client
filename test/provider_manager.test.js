'use strict';

const net = require('net');
const url = require('url');
const assert = require('assert');
const Provider = require('../lib/provider');
const ProviderManager = require('../lib/provider_manager');

const version = Number(process.versions.node.split('.')[0]);
const port = 12200 + version;

describe('test/provider_manager.test.js', () => {
  let server;
  let manager;
  before(done => {
    manager = new ProviderManager({ providerClass: Provider });
    server = net.createServer();
    server.listen(port, done);
  });

  after(() => {
    manager.close();
    server.close();
  });

  it('should get provider', function* () {
    const provider_1 = yield manager.getProvider({ address: url.parse(`dubbo://127.0.0.1:${port}/xxx`, true) });
    assert(provider_1 && (provider_1 instanceof Provider));
    yield provider_1.ready();

    const provider_2 = yield manager.getProvider({ address: url.parse(`dubbo://127.0.0.1:${port}/yyy`, true) });
    assert(provider_1 === provider_2);
    assert(manager.providers.size === 1);

    yield [
      provider_1.await('close'),
      provider_1.close(),
    ];
    assert(manager.providers.size === 0);

    const provider_3 = yield manager.getProvider({ address: url.parse(`dubbo://127.0.0.1:${port}/yyy`, true) });
    assert(provider_2 !== provider_3);

    yield [
      provider_3.await('close'),
      provider_3.close(),
    ];
  });

  it('should support customize providerClass', function* () {
    class CustomizeProvider extends Provider {}

    manager.providerClass = CustomizeProvider;

    const provider = yield manager.getProvider({ address: url.parse(`dubbo://127.0.0.1:${port}/xxx`, true) });
    assert(provider && (provider instanceof CustomizeProvider));
    yield provider.ready();
  });
});
