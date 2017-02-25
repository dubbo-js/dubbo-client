'use strict';

const net = require('net');
const assert = require('assert');
const protocol = require('dubbo-remoting');
const DubboClient = require('../lib/client');
const { Client, Server } = require('dubbo-registry');

const version = Number(process.versions.node.split('.')[0]);
const port = 12200 + version;

describe('test/client.test.js', () => {
  let server;
  let registry;
  let registryServer;
  const url = `dubbo://127.0.0.1:${port}/com.aliyun.account.newapi.service.AccountSessionQueryService?version=1.0.0`;

  before(function* () {
    registryServer = new Server({ port: 9090 });
    yield registryServer.ready();
    registry = new Client({
      address: '127.0.0.1:9090',
      appName: 'unittest',
    });
    yield registry.ready();

    server = net.createServer();
    server.on('connection', socket => {
      const decoder = protocol.decoder(url);
      decoder.on('packet', packet => {
        if (!packet.isResponse && !packet.isEvent) {
          const buf = new Buffer('2rsCFAAAAAAAAAACAAAAeZFDMCRjb20uYWxpeXVuLmFjY291bnQuZW50aXR5LkJhc2VSZXN1bHSUBGNvZGUDbXNnCXJlcXVlc3RJZARkYXRhYAM0MDUwL3BhcmFtZXRlciBlcnJvci5udWxsIHJlcXVlc3Qgb3IgdGlja2V0IGlzIGVtcHR5Tk4=', 'base64');
          buf.writeInt32BE(packet.id, 8);
          socket.write(buf);
        }
      });
      socket.pipe(decoder);
    });
    server.listen(port, '127.0.0.1');

    registry.publish({
      interfaceName: 'com.aliyun.account.newapi.service.AccountSessionQueryService',
      version: '1.0.0',
      url,
    });
  });

  after(function* () {
    yield registry.close();
    yield registryServer.close();
    server.close();
  });

  it('should support directly address call', function* () {
    const client = new DubboClient({
      registry,
      appName: 'unittest',
    });
    const consumer = client.createConsumer({
      interfaceName: 'com.aliyun.account.newapi.service.AccountSessionQueryService',
      version: '1.0.0',
      address: `127.0.0.1:${port}`,
    });
    const result = yield consumer.invoke('loadSessionInfoByTicket', [{
      $class: 'com.aliyun.account.newapi.model.request.SessionQueryRequest',
      $: {
        ticket: '',
        pk: '',
      },
    }]);
    assert.deepEqual(result, {
      code: '405',
      msg: 'parameter error.null request or ticket is empty',
      requestId: null,
      data: null,
    });

    client.close();
  });

  it('should invoke ok', function* () {
    const client = new DubboClient({
      registry,
      appName: 'unittest',
    });
    const consumer = client.createConsumer({
      interfaceName: 'com.aliyun.account.newapi.service.AccountSessionQueryService',
      version: '1.0.0',
    });
    const result = yield consumer.invoke('loadSessionInfoByTicket', [{
      $class: 'com.aliyun.account.newapi.model.request.SessionQueryRequest',
      $: {
        ticket: '',
        pk: '',
      },
    }]);
    assert.deepEqual(result, {
      code: '405',
      msg: 'parameter error.null request or ticket is empty',
      requestId: null,
      data: null,
    });

    client.close();
  });

  it('should get same consumer at second time', function* () {
    const client = new DubboClient({
      registry,
      appName: 'unittest',
    });
    const consumer_1 = client.createConsumer({
      interfaceName: 'com.aliyun.account.newapi.service.AccountSessionQueryService',
      group: 'DUBBO',
      version: '1.0.0',
    });
    const consumer_2 = client.createConsumer({
      interfaceName: 'com.aliyun.account.newapi.service.AccountSessionQueryService',
      group: 'DUBBO',
      version: '1.0.0',
    });
    assert(consumer_1 === consumer_2);

    client.close();
  });

  it('should customize consumer & provider', function* () {
    const client = new DubboClient({
      registry,
      appName: 'unittest',
    });
    class CustomizeConsumer extends client.consumerClass {
      //
      * invoke(...args) {
        console.log('calling invoke');
        return yield super.invoke(...args);
      }
    }
    client.consumerClass = CustomizeConsumer;
    class CustomizeProvider extends client.providerClass {}
    client.providerClass = CustomizeProvider;

    const consumer = client.createConsumer({
      interfaceName: 'com.aliyun.account.newapi.service.AccountSessionQueryService',
      version: '1.0.0',
    });
    const result = yield consumer.invoke('loadSessionInfoByTicket', [{
      $class: 'com.aliyun.account.newapi.model.request.SessionQueryRequest',
      $: {
        ticket: '',
        pk: '',
      },
    }]);
    assert.deepEqual(result, {
      code: '405',
      msg: 'parameter error.null request or ticket is empty',
      requestId: null,
      data: null,
    });

    client.close();
  });
});
