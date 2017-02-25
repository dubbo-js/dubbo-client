'use strict';

const net = require('net');
const assert = require('assert');
const pedding = require('pedding');
const urlparse = require('url').parse;
const protocol = require('dubbo-remoting');
const DubboProvider = require('../lib/provider');

describe('test/provider.test.js', () => {

  const version = Number(process.versions.node.split('.')[0]);
  const port = 12200 + version;

  it('should invoke api ok', function* () {
    const url = `dubbo://127.0.0.1:${port}/com.aliyun.account.newapi.service.AccountSessionQueryService?version=1.0.0`;
    const server = net.createServer();
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

    const address = urlparse(url, true);
    const provider = new DubboProvider({ address });
    const result = yield provider.invoke('loadSessionInfoByTicket', [{
      $class: 'com.aliyun.account.newapi.model.request.SessionQueryRequest',
      $: {
        ticket: '',
        pk: '',
      },
    }]);
    assert(result, {
      code: '405',
      msg: 'parameter error.null request or ticket is empty',
      requestId: null,
      data: null,
    });
    provider.close();
    server.close();
  });

  it('should sendHeartbeat periodically', finish => {
    let server;
    let provider;
    const done = pedding(() => {
      provider.close();
      server.close();
      finish();
    }, 2);
    const url = `dubbo://127.0.0.1:${port}/com.aliyun.account.newapi.service.AccountSessionQueryService?version=1.0.0&heartbeat=1000`;
    server = net.createServer();
    server.on('connection', socket => {
      const decoder = protocol.decoder(url);
      decoder.on('packet', packet => {
        if (packet.isHeartbeat) {
          const res = new protocol.Response(packet.id);
          res.event = null;
          socket.write(res.encode());
          done();
        }
      });
      socket.pipe(decoder);
    });
    server.listen(port, '127.0.0.1');
    const address = urlparse(url, true);
    provider = new DubboProvider({ address });
  });

  it('should ignore unpaired packet', done => {
    const url = `dubbo://127.0.0.1:${port}/com.aliyun.account.newapi.service.AccountSessionQueryService?version=1.0.0`;
    const server = net.createServer();
    server.on('connection', socket => {
      const buf = new Buffer('2rsCFAAAAAAAAAACAAAAeZFDMCRjb20uYWxpeXVuLmFjY291bnQuZW50aXR5LkJhc2VSZXN1bHSUBGNvZGUDbXNnCXJlcXVlc3RJZARkYXRhYAM0MDUwL3BhcmFtZXRlciBlcnJvci5udWxsIHJlcXVlc3Qgb3IgdGlja2V0IGlzIGVtcHR5Tk4=', 'base64');
      socket.write(buf);
    });
    server.listen(port, '127.0.0.1');
    const address = urlparse(url, true);
    const provider = new DubboProvider({
      address,
      logger: {
        warn(msg, opts) {
          assert(msg === '[dubbo-client] paired request not found, maybe it\'s removed for timeout and the response is %j');
          assert.deepEqual(opts, {
            id: 2,
            version: null,
            status: 20,
            errorMsg: null,
            data: {
              value: {
                code: '405',
                msg: 'parameter error.null request or ticket is empty',
                requestId: null,
                data: null,
              },
              error: null,
            },
            isEvent: false,
          });
          provider.close();
          server.close();
          done();
        },
      },
    });
  });

  it('should handle system exception', function* () {
    const url = `dubbo://127.0.0.1:${port}/com.aliyun.account.newapi.service.AccountSessionQueryService?version=1.0.0`;
    const server = net.createServer();
    server.on('connection', socket => {
      const decoder = protocol.decoder(url);
      decoder.on('packet', packet => {
        if (!packet.isResponse && !packet.isEvent) {
          const res = new protocol.Response(packet.id);
          res.status = 80;
          res.errorMsg = 'sys error';
          socket.write(res.encode());
        }
      });
      socket.pipe(decoder);
    });
    server.listen(port, '127.0.0.1');
    const address = urlparse(url, true);
    const provider = new DubboProvider({ address });
    let error;
    try {
      yield provider.invoke('loadSessionInfoByTicket', []);
    } catch (err) {
      error = err;
    }
    assert(error && error.message.includes('sys error'));
    provider.close();
    server.close();
  });

  it('should handle exception packet', function* () {
    const url = `dubbo://127.0.0.1:${port}/com.aliyun.account.newapi.service.AccountSessionQueryService?version=1.0.0`;
    const server = net.createServer();
    server.on('connection', socket => {
      const decoder = protocol.decoder(url);
      decoder.on('packet', packet => {
        if (!packet.isResponse && !packet.isEvent) {
          const res = new protocol.Response(packet.id);
          res.data = new protocol.Result({
            error: new Error('mock error'),
          });
          socket.write(res.encode());
        }
      });
      socket.pipe(decoder);
    });
    server.listen(port, '127.0.0.1');
    const address = urlparse(url, true);
    const provider = new DubboProvider({ address });
    let error;
    try {
      yield provider.invoke('loadSessionInfoByTicket', []);
    } catch (err) {
      error = err;
    }
    assert(error && error.message.includes('mock error'));
    provider.close();
    server.close();
  });

  it('should handle heartbeat from server', done => {
    const url = `dubbo://127.0.0.1:${port}/com.aliyun.account.newapi.service.AccountSessionQueryService?version=1.0.0&timeout=3000`;
    let provider;
    const server = net.createServer();
    server.on('connection', socket => {
      const decoder = protocol.decoder(url);
      decoder.on('packet', packet => {
        if (packet.isResponse && packet.isHeartbeat) {
          provider.close();
          server.close();
          done();
        }
      });
      socket.pipe(decoder);

      const heartbeat = new protocol.Request();
      heartbeat.event = null;
      socket.write(heartbeat.encode());
    });
    server.listen(port, '127.0.0.1');
    const address = urlparse(url, true);
    provider = new DubboProvider({ address });
  });

  it('should throw error if invoke timeout', function* () {
    const url = `dubbo://127.0.0.1:${port}/com.aliyun.account.newapi.service.AccountSessionQueryService?version=1.0.0`;
    const server = net.createServer();
    server.listen(port, '127.0.0.1');
    const address = urlparse(url, true);
    const provider = new DubboProvider({ address });
    let error;
    try {
      yield provider.invoke('loadSessionInfoByTicket', [{
        $class: 'com.aliyun.account.newapi.model.request.SessionQueryRequest',
        $: {
          ticket: '',
          pk: '',
        },
      }]);
    } catch (err) {
      error = err;
    }
    assert(error.name === 'ResponseTimeoutError');
    assert(error.message.includes('Server no response in 1000ms, address#127.0.0.1'));
    provider.close();
    server.close();
  });

  it('should ignore request from server', done => {
    const url = `dubbo://127.0.0.1:${port}/com.aliyun.account.newapi.service.AccountSessionQueryService?version=1.0.0`;
    const server = net.createServer();
    const req = new protocol.Request();
    req.data = new protocol.Invocation({
      methodName: 'test-method',
      args: [],
      attachments: {
        dubbo: '5.3.0',
        path: 'com.aliyun.account.newapi.service.AccountSessionQueryService',
        interface: 'com.aliyun.account.newapi.service.AccountSessionQueryService',
        version: '1.0.0',
        timeout: 3000,
      },
    });
    server.on('connection', socket => {
      socket.write(req.encode());
    });
    server.listen(port, '127.0.0.1');
    const address = urlparse(url, true);
    const provider = new DubboProvider({
      address,
      logger: {
        warn(msg, opts) {
          assert(msg === '[dubbo-client] can not process dubbo request packet => %j');
          assert.deepEqual(opts, req);
          provider.close();
          server.close();
          done();
        },
      },
    });
  });

  it('should handle decode error', done => {
    const url = `dubbo://127.0.0.1:${port}/com.aliyun.account.newapi.service.AccountSessionQueryService?version=1.0.0`;
    const server = net.createServer();
    server.on('connection', socket => {
      socket.write(new Buffer('fake data'));
    });
    server.listen(port, '127.0.0.1');
    const address = urlparse(url, true);
    const provider = new DubboProvider({ address });
    provider.once('error', err => {
      assert(err);
      assert(err.message.includes('invalid packet with magic'));
    });
    provider.once('close', () => {
      server.close();
      done();
    });
  });

  it('should connect failed', done => {
    const url = `dubbo://127.0.0.1:${port}/com.aliyun.account.newapi.service.AccountSessionQueryService?version=1.0.0`;
    const address = urlparse(url, true);
    const provider = new DubboProvider({ address });
    provider.once('error', err => {
      assert(err);
      assert(err.message.includes('ECONNREFUSED'));
    });
    provider.once('close', done);
  });
});
