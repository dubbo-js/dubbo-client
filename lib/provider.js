'use strict';

const net = require('net');
const url = require('url');
const Base = require('tcp-base');
const assert = require('assert');
const protocol = require('dubbo-remoting');

const defaultOptions = {
  noDelay: true,
  logger: console,
};

class DubboProvider extends Base {
  /**
   * Dubbo provider
   *
   * @param {Object} options
   *   - {Url} address - provider address object
   *   - {Logger} logger - the logger instance
   *   - {String} appName - the application name
   *   - {Boolean} [noDelay] - whether use the Nagle algorithm or not，defaults to true
   * @constructor
   */
  constructor(options) {
    assert(options.address, '[dubbo-client] options.address is required');
    const query = options.address.query || {};
    const responseTimeout = query.timeout ? Number(query.timeout) : 1000;
    const heartbeatInterval = query.heartbeat ? Number(query.heartbeat) : 60000;
    const serialization = query.serialization || 'hessian2';
    const version = query.version || '1.0.0';
    const interfaceName = query.interface;
    const group = query.group;
    let path = options.address.pathname || (group ? `${group}/${interfaceName}` : interfaceName);
    if (path.startsWith('/')) {
      path = path.slice(1);
    }
    super(Object.assign({
      host: options.address.hostname,
      port: options.address.port,
      protocol,
      responseTimeout,
      heartbeatInterval,
      serialization,
      interfaceName,
      version,
      group,
      path,
    }, defaultOptions, options));
  }

  get logger() {
    return this.options.logger;
  }

  get protocol() {
    return this.options.protocol;
  }

  get address() {
    return url.format(this.options.address);
  }

  get serialization() {
    return this.options.serialization;
  }

  get heartBeatPacket() {
    const req = new this.protocol.Request();
    req.event = null;
    return req.encode(this.serialization);
  }

  /**
   * Invoke service api
   *
   * @param {String} methodName - the method name
   * @param {Array} args - the arguments
   * @param {Object} options
   *   - {Number} timeout - the api timeout
   *   - {String} interface - the api interface
   *   - {String} version - the api version
   * @return {Object} result
   */
  * invoke(methodName, args, options) {
    const req = new this.protocol.Request();
    req.data = new this.protocol.Invocation({
      methodName,
      args,
      attachments: Object.assign({
        dubbo: '5.3.0',
        path: this.options.path,
        interface: this.options.interfaceName,
        version: this.options.version,
        timeout: this.options.responseTimeout,
      }, options),
    });
    return yield this.sendThunk({
      id: req.id,
      data: req.encode(this.serialization),
    });
  }

  _handlePacket(packet) {
    if (packet.isResponse) {
      const invoke = this._invokes.get(packet.id);
      if (invoke) {
        this._finishInvoke(packet.id);
        clearTimeout(invoke.timer);
        process.nextTick(() => {
          if (packet.isSuccess) {
            invoke.callback(packet.data.error, packet.data.value);
          } else {
            invoke.callback(new Error(packet.errorMsg || 'unknow server error'));
          }
        });
      } else if (!packet.isEvent) {
        this.logger.warn('[dubbo-client] paired request not found, maybe it\'s removed for timeout and the response is %j', packet);
      }
    } else {
      if (packet.isHeartbeat) {
        const res = new this.protocol.Response(packet.id);
        res.event = null;
        this._socket.write(res.encode(this.serialization));
      } else {
        this.logger.warn('[dubbo-client] can not process dubbo request packet => %j', packet);
      }
    }
  }

  _handleDecodeError(err) {
    err.message += ` (address: ${this.address})`;
    this.close(err);
  }

  _handleSocketError(err) {
    err.message += ` (address: ${this.address})`;
    if (!this.inited) {
      this.ready(err);
    } else {
      this.emit('error', err);
    }
  }

  _connect(done) {
    if (!done) {
      done = () => this.ready(true);
    }
    this._decoder = this.protocol.decoder(this.address);
    this._decoder.once('error', err => this._handleDecodeError(err));
    this._decoder.on('packet', packet => this._handlePacket(packet));

    this._socket = net.connect(this.options.port, this.options.host);
    this._socket.setNoDelay(this.options.noDelay);
    this._socket.once('close', () => { this._handleClose(); });
    this._socket.once('error', err => { this._handleSocketError(err); });
    this._socket.once('connect', done);
    this._socket.pipe(this._decoder);

    if (this.options.needHeartbeat) {
      this._heartbeatTimer = setInterval(() => {
        if (this._invokes.size > 0 || !this.isOK) {
          return;
        }
        this.sendHeartBeat();
      }, this.options.heartbeatInterval);
    }
  }
}

module.exports = DubboProvider;
