/*
 * This class defines an APPX connection
 */

var fs = require('fs');
var net = require('net');
var tls = require('tls');
var utilities = require('./appxutilities');

// So we're within range of the APPX Login Manger's ability, we'll set the minimum and maximum TLS protocol versions
tls.DEFAULT_MIN_VERSION = 'TLSv1';
tls.DEFAULT_MAX_VERSION = 'TLSv1.2';

// APPX handshake message contains 2 bytes. 1) Protocol Version, 2) Encryption type
const HANDSHAKE_VERSION = 4;

const HANDSHAKE_ENC_SSL = 'S'.charCodeAt(0);
const HANDSHAKE_ENC_PLAIN = 'P'.charCodeAt(0);
const HANDSHAKE_ENC_TOKEN = 'T'.charCodeAt(0);
const HANDSHAKE_ENC_REJECTED = 'R'.charCodeAt(0);

// Token logins require a 2 step login.  These values go in the login host field to tell server if you are getting or using a token.
const LOGON_MODE_GET_TOKEN = 'requestToken';
const LOGON_MODE_USE_TOKEN = 'authToken';

const LOGON_TOKEN_LENGTH = 60;

// States used to manage the process of handshaking, logging in, and exchanging data with server
const STATE_INITIAL = 'Initial';
const STATE_HANDSHAKE = 'Handshake';
const STATE_AUTHENTICATE_LOGIN = 'Authenticate Login';
const STATE_AUTHENTICATE_TOKEN = 'Authenticate Token';
const STATE_AUTHENTICATED = 'Authenticated';
const STATE_FAILURE = 'Failure';

// Class Constructor
function Appx() {
	let logmsg = 'Created Appx() instance' +
		', host=' + providerConfig.host +
		', port=' + providerConfig.port +
		', ssl=' + providerConfig.enablessl;

	if (providerConfig.appxuser != '')
		logmsg = logmsg.concat(', user=' + providerConfig.appxuser);

	if (providerConfig.appxtoken != '')
		logmsg = logmsg.concat(', token=' + providerConfig.appxtoken);

	debugConfig.log(debugConfig.STAT, logmsg);
};

// Send a request to the APPX server to login
Appx.prototype.login = function (callback) {
	var instance = {};

	instance.onloggedin = callback;
	instance.requestID = (Math.random(100000) * 100000 + 10000).toString().substring(0, 5);
	instance.token = providerConfig.appxtoken;
	instance.appxResult = [];

	debugConfig.log(debugConfig.INFO, 'New Request: ID=' + instance.requestID);

	setState(STATE_INITIAL);

	if (providerConfig.enablessl && providerConfig.appxtoken.length == LOGON_TOKEN_LENGTH) {
		instance.appxUser = instance.token.substr(0, 20);
		instance.appxPswd = instance.token.substr(20, 20);
		instance.appxHost = instance.token.substr(40, 20);
		authenticateToken();
	}
	else {
		instance.appxUser = providerConfig.appxuser;
		instance.appxPswd = providerConfig.appxpass;
		instance.appxHost = '';
		authenticate();
	}

	// End of the login() function main code, the rest of this function defines other local functions.

	// Start authentication ad processing of data.  This is an interesting mix of callbacks needed
	// to handle plain text and SSL connections.  For plain text the authenticate() function handles
	// all the logic.  That's easy but insecure.  For SSL connections we must connect and log into
	// the server twice since the NodeJS SSL stack refuses to let us upgrade our raw socket to SSL
	// to log in, downgrade back to a raw socket to run the appx engine, then upgrade the socket to
	// SSL again.  The solution to that is to connect, upgrade to SSL, send login/password, get back
	// a one time 40 byte random authentication token, and disconnect the session.  Then connect a
	// second time, send the authentication token to the login manager to get us in and then as the
	// appx engine is starting upgrade our connect to SSL for all data traffic.  That is where we 
	// get into callback hell.  There are 4 main functions involved.
	//
	// authenticate() will made the initial raw socket connection then call authenticateSSL().
	//
	// authenticateSSL() will upgrade the socket to SSL and login.  Then call authenticateToken().
	//
	// authenticateToken() will make the second raw socket connection, send the login token, then call authenticateTokenSSL()
	//
	// authenticateTokenSSL() will upgrade the connection to SSL then send and receive the API request and result.
	//
	// There are a lot of helper functions below to reduce the duplication of code and to make the
	// functions smaller and easier to understand.

	function authenticate() {
		instance.appxResult = [];
		instance.sslType = providerConfig.enablessl ? HANDSHAKE_ENC_SSL : HANDSHAKE_ENC_PLAIN;

		function dataCallback(data) {
			if (instance.state == STATE_HANDSHAKE && instance.appxResult.length >= 2) {
				if (instance.appxResult[0] == HANDSHAKE_VERSION) {
					instance.sslType = instance.appxResult[1];
					instance.appxResult = instance.appxResult.slice(2);
					setState(STATE_AUTHENTICATE_LOGIN);
					
					if (instance.sslType != HANDSHAKE_ENC_REJECTED) {
						if (instance.sslType == HANDSHAKE_ENC_SSL) {
							authenticateSSL(raw_socket);
						}
						else {
							sendLogin(raw_socket);
						}
					} 
					else {
						// Make the callback to the calller so they can process the handshake failure  
						if (instance.onloggedin != null) {
							instance.onloggedin(raw_socket, 0, instance.appxResult.slice(4));
						}
					}
				}
				else {
					setState(STATE_FAILURE); // handshake failure
				}
			}
			else if (instance.state == STATE_AUTHENTICATE_LOGIN && instance.sslType == HANDSHAKE_ENC_PLAIN && instance.appxResult.length >= 2) {
				if (instance.appxResult[0] == 0 && instance.appxResult[1] == 1) {
					setState(STATE_AUTHENTICATED);
				}
				instance.appxResult = instance.appxResult.slice(2);
				// Make the callback to the caller so they can set up their events and either process the successful login or failed login 
				if (instance.onloggedin != null && ((instance.state == STATE_AUTHENTICATED) || instance.appxResult.length > 2)) {
					instance.onloggedin(raw_socket, (instance.state == STATE_AUTHENTICATED), instance.appxResult.slice(2));
				}
			}
		};

		function closeCallback() {
			setTimeout(function () {
				if (instance.state == STATE_AUTHENTICATE_TOKEN) {
					authenticateToken();
				}
				raw_socket.destroy();
			}, 0);
		};

		var callbacks = {
			data: dataCallback,
			close: closeCallback
		};

		var raw_socket = createAndConnectSocket(callbacks);
		
		// Send handshake requesting plain text
		sendHandshake(raw_socket);
	};

	function authenticateSSL(raw_socket) {
		logWithID(debugConfig.INFO, 'starting SSL...');

		instance.appxResult = [];

		function secureCallback() {
			logWithID(debugConfig.INFO, 'Requesting user token...');
			logWithID(debugConfig.INFO, 'send user=' + providerConfig.appxuser);
			sendLogin(tls_socket, 'requestToken');
		};

		function closeCallback() {
			var result = instance.appxResult;

			if (result.length >= 2 && result[0] == 0 && result[1] == 1) {
				result = result.slice(2);
			}
			else {
				setState(STATE_FAILURE);
				// Make the callback to the caller so they can set up their events and process the failed login 
				if (instance.onloggedin != null) {
					instance.onloggedin(raw_socket, 0, instance.appxResult.slice(6));
				}
			}

			if (instance.state == STATE_AUTHENTICATE_LOGIN && result.length == LOGON_TOKEN_LENGTH + 4) {
				var len = Buffer.from(result.slice(0, 4), 'utf8').readUInt32BE(0);

				if (len == LOGON_TOKEN_LENGTH) {
					setState(STATE_AUTHENTICATE_TOKEN);
					result = result.slice(4);
					instance.token = Buffer.from(result).toString();
					result = '';
					logWithID(debugConfig.INFO, 'Token = ' + instance.token);
					instance.appxUser = instance.token.substr(0, 20);
					instance.appxPswd = instance.token.substr(20, 20);
					instance.appxHost = instance.token.substr(40, 20);
					tls_socket.destroy();

					authenticateToken();
				}
				else {
					setState(STATE_FAILURE);
				}
			}
			else {
				setState(STATE_FAILURE);
			}
		};

		var callbacks = {
			secureCallback: secureCallback,
			closeCallback: closeCallback
		}

		var tls_socket = createAndConnectSocketSSL(raw_socket, callbacks);
	};

	function authenticateToken() {
		instance.appxResult = [];
		instance.sslType = HANDSHAKE_ENC_TOKEN;

		logWithID(debugConfig.INFO, 'Start of authenticateToken() function');

		function dataCallback(data) {
			if (instance.state == STATE_HANDSHAKE && instance.appxResult.length >= 2) {
				if (instance.appxResult[0] == HANDSHAKE_VERSION) {
					var sslType = instance.appxResult[1];
					instance.appxResult = instance.appxResult.slice(2);
					setState(STATE_AUTHENTICATE_TOKEN);
					logWithID(debugConfig.INFO, 'Sending authentication token');
					sendLogin(raw_socket, 'authToken');
				}
			}

			if (instance.state == STATE_AUTHENTICATE_TOKEN && instance.appxResult.length >= 2) {
				if (instance.appxResult[0] == 0 && instance.appxResult[1] == 1) {
					instance.appxResult = instance.appxResult.slice(2);
					setState(STATE_AUTHENTICATED);
					authenticateTokenSSL(raw_socket);
				}
			}
		}
		var callbacks = {
			data: dataCallback
		};

		var raw_socket = createAndConnectSocket(callbacks);

		logWithID(debugConfig.INFO, 'user=' + instance.appxUser);

		sendHandshake(raw_socket);
	};

	function authenticateTokenSSL(raw_socket) {
		logWithID(debugConfig.INFO, 'starting SSL...');

		instance.appxResult = [];
		
		function closeCallback(data) {
			setState(STATE_INITIAL);
		}

		var callbacks = {
			closeCallback: closeCallback
		}

		var tls_socket = createAndConnectSocketSSL(raw_socket, callbacks);
		
		return tls_socket;
	};

	function createAndConnectSocket(callbacks) {
		instance.appxResult = [];

		var raw_socket = new net.Socket();

		raw_socket.on('data', function (data) {
			logWithID(debugConfig.DATA, 'SOCKET RECEIVED DATA - (' + data.length + ')');
			logWithID(debugConfig.DATA, data.toString('utf8'));
			logWithID(debugConfig.DATA, '0x' + data.toString('hex'));
			instance.appxResult.push(...data);
			if (callbacks.data)
				callbacks.data(data);
		});

		raw_socket.on('close', function () {
			logWithID(debugConfig.INFO, 'SOCKET CLOSE');
			if (callbacks.close)
				callbacks.close();
		});

		raw_socket.on('end', function () {
			logWithID(debugConfig.INFO, 'SOCKET END');
			if (callbacks.end)
				callbacks.end();
		});

		raw_socket.on('error', function (err) {
			logWithID(debugConfig.INFO, 'SOCKET ERROR: ' + err);
			if (callbacks.error)
				callbacks.error();
		});

		raw_socket.connect(parseInt(providerConfig.port), providerConfig.host, function () {
			logWithID(debugConfig.INFO, 'authenticate() Connected to ' + providerConfig.host + ':' + providerConfig.port);
			if (callbacks.connect)
				callbacks.connect();
		});

		return raw_socket;
	};

	function createAndConnectSocketSSL(raw_socket, callbacks) {
		instance.appxResult = [];

		var options = {
			socket: raw_socket,
			rejectUnauthorized: providerConfig.sslRejectUnauth
		};

		if (providerConfig.sslCaFilePath != '') {
			options.ca = providerConfig.sslCaFilePath;
		}

		if (!providerConfig.sslCheckSvrName) {
			options.checkServerIdentity = (servername, cert) => { return undefined; }
		}

		var tls_socket = tls.connect(options, function () {
			logWithID(debugConfig.INFO, 'connection upgraded to SSL!');
		});

		tls_socket.on('secureConnect', () => {
			logWithID(debugConfig.INFO, 'TLS SOCKET SECURE' + ' - Using Protocols: [' + tls_socket.getProtocol() + ']');
			// Make the callback to the caller so they have can set up their events  
			if (instance.state == 'Authenticated' && instance.onloggedin != null) {
				instance.onloggedin(tls_socket, 1, "");
			}
			if (callbacks.secureCallback)
				callbacks.secureCallback();
		});

		tls_socket.on('data', (data) => {
			logWithID(debugConfig.INFO, 'TLS SOCKET RECEIVED DATA - (' + data.length + ') ');
			logWithID(debugConfig.DATA, data.toString('utf8'));
			logWithID(debugConfig.DATA, '0x' + data.toString('hex'));
			instance.appxResult.push(...data);
			if (callbacks.dataCallback)
				callbacks.dataCallback(data);
		});

		tls_socket.on('close', () => {
			logWithID(debugConfig.INFO, 'TLS SOCKET CLOSED');
			if (callbacks.closeCallback)
				callbacks.closeCallback();
		});

		tls_socket.on('error', (err) => {
			logWithID(debugConfig.ERROR, 'TLS SOCKET ERROR - ' + err);
			if (callbacks.errorCallback)
				callbacks.errorCallback(err);
		});

		tls_socket.on('end', () => {
			logWithID(debugConfig.INFO, 'TLS SOCKET END');
			if (callbacks.endCallback)
				callbacks.endCallback();
		});

		tls_socket.on('timeout', () => {
			logWithID(debugConfig.ERROR, 'TLS SOCKET TIMEOUT');
			if (callbacks.timeoutCallback)
				callbacks.timeoutCallback();
		});

		return tls_socket;
	};

	function sendHandshake(raw_socket) {
		setState(STATE_HANDSHAKE);
		var thandshake = new Buffer.alloc(2);
		thandshake[0] = HANDSHAKE_VERSION;
		thandshake[1] = instance.sslType;
		raw_socket.write(thandshake);
	}

	function sendLogin(socket, extra) {
		var tlogin = new Buffer.alloc(331);

		if (providerConfig.enablessl)
			logWithID(debugConfig.INFO, 'Sending login for SSL user: ' + instance.appxUser);
		else
			logWithID(debugConfig.INFO, 'Sending login for user: ' + providerConfig.appxuser);

		tlogin.fill();

		if (providerConfig.enablessl) {
			tlogin.write(instance.appxUser);
			tlogin.write(instance.appxPswd, 21);
		}
		else {
			tlogin.write(providerConfig.appxuser);
			tlogin.write(providerConfig.appxpass, 21);
		}
		
		if (providerConfig.runApplication != null) {
			if (providerConfig.reconnectId != 'reconnect') {
				tlogin.write(providerConfig.runApplication, 74);
			}
			  else { 
				for (var rc = 0; rc < providerConfig.runApplication.length; rc++) {
					tlogin[320 + rc] = providerConfig.runApplication.charCodeAt(rc);
				}
			}
		}
		if (providerConfig.runDatabase != null) {
			tlogin.write(providerConfig.runDatabase, 77);
		}
		if (providerConfig.runProcessType != null) {
			tlogin.write(providerConfig.runProcessType, 80);
		}
		if (providerConfig.runProcess != null) {
			tlogin.write(providerConfig.runProcess, 90);
		}

		if (extra) {
			logWithID(debugConfig.INFO, 'extra=' + extra);
			tlogin.write(extra, 42);
			if (extra == 'authToken')
				tlogin.write(instance.appxHost, 52);
		}

		socket.write(tlogin);
	};

	function setState(newState) {
		instance.state = newState;
		logWithID(debugConfig.INFO, 'STATE: ' + instance.state, new Error().stack);
	};

	function logWithID(type, str, err) {
		debugConfig.log(type, '(ReqID:' + instance.requestID + ') ' + str, (err ? err : new Error().stack));
	}

}; // end of login function

// Send a request to the APPX server and return the response
Appx.prototype.send = function (sendMessage, sendCallback) {
	var instance = {};

	instance.requestID = (Math.random(100000) * 100000 + 10000).toString().substring(0, 5);
	instance.token = providerConfig.appxtoken;
	instance.appxResult = [];

	debugConfig.log(debugConfig.INFO, 'New Request: ID=' + instance.requestID);
	debugConfig.log(debugConfig.DATA, 'New Request: ' + instance.requestID + ', req=' + JSON.stringify(sendMessage));

	setState(STATE_INITIAL);

	if (providerConfig.enablessl && providerConfig.appxtoken.length == LOGON_TOKEN_LENGTH) {
		instance.appxUser = instance.token.substr(0, 20);
		instance.appxPswd = instance.token.substr(20, 20);
		instance.appxHost = instance.token.substr(40, 20);
		authenticateToken();
	}
	else {
		instance.appxUser = providerConfig.appxuser;
		instance.appxPswd = providerConfig.appxpass;
		instance.appxHost = '';
		authenticate();
	}

	function sendMessageToServer(socket) {
		var data = JSON.stringify(sendMessage);
		var dlen = data.length;
		var reqb = new Buffer.alloc(dlen + 1);

		reqb.fill();
		reqb.write(data);
		reqb.writeUInt8(10, dlen);

		logWithID(debugConfig.INFO, 'Sending API Request to server (' + reqb.byteLength + ')');
		logWithID(debugConfig.DATA, JSON.stringify(sendMessage));
		socket.write(reqb);
	}

	function returnResultsToCaller(data) {
		var result = '';
		logWithID(debugConfig.INFO, 'Returning API Response to caller (' + data.length + ')');
		if (data) {
			try {
				var jdata = new Buffer.from(data).toString();
				result = JSON.parse((jdata));
				logWithID(debugConfig.DATA, jdata);
			} catch (ex) {
				logWithID(debugConfig.ERROR, 'Bad JSON.');
			}
		}
		else {
			logWithID(debugConfig.INFO, 'undefined')
		}

		sendCallback(result);
	}

	// End of the send() function main code, the rest of this function defines other local functions.

	// Start authentication ad processing of data.  This is an interesting mix of callbacks needed
	// to handle plain text and SSL connections.  For plain text the authenticate() function handles
	// all the logic.  That's easy but insecure.  For SSL connections we must connect and log into
	// the server twice since the NodeJS SSL stack refuses to let us upgrade our raw socket to SSL
	// to log in, downgrade back to a raw socket to run the appx engine, then upgrade the socket to
	// SSL again.  The solution to that is to connect, upgrade to SSL, send login/password, get back
	// a one time 40 byte random authentication token, and disconnect the session.  Then connect a
	// second time, send the authentication token to the login manager to get us in and then as the
	// appx engine is starting upgrade our connect to SSL for all data traffic.  That is where we 
	// get into callback hell.  There are 4 main functions involved.
	//
	// authenticate() will made the initial raw socket connection then call authenticateSSL().
	//
	// authenticateSSL() will upgrade the socket to SSL and login.  Then call authenticateToken().
	//
	// authenticateToken() will make the second raw socket connection, send the login token, then call authenticateTokenSSL()
	//
	// authenticateTokenSSL() will upgrade the connection to SSL then send and receive the API request and result.
	//
	// There are a lot of helper functions below to reduce the duplication of code and to make the
	// functions smaller and easier to understand.

	function authenticate() {
		instance.appxResult = [];
		instance.sslType = providerConfig.enablessl ? HANDSHAKE_ENC_SSL : HANDSHAKE_ENC_PLAIN;

		function dataCallback(data) {
			if (instance.state == STATE_HANDSHAKE && instance.appxResult.length >= 2) {
				if (instance.appxResult[0] == HANDSHAKE_VERSION) {
					instance.sslType = instance.appxResult[1];
					instance.appxResult = instance.appxResult.slice(2);
					setState(STATE_AUTHENTICATE_LOGIN);

					if (instance.sslType == HANDSHAKE_ENC_SSL) {
						authenticateSSL(raw_socket);
					}
					else {
						sendLogin(raw_socket);
					}
				}
				else {
					setState(STATE_FAILURE); // handshake failure
				}
			}
			else if (instance.state == STATE_AUTHENTICATE_LOGIN && instance.sslType == HANDSHAKE_ENC_PLAIN && instance.appxResult.length >= 2) {
				if (instance.appxResult[0] == 0 && instance.appxResult[1] == 1) {
					setState(STATE_AUTHENTICATED);
					sendMessageToServer(raw_socket);
				}
				instance.appxResult = instance.appxResult.slice(2);
			}
		};

		function closeCallback() {
			setTimeout(function () {
				if (instance.state == STATE_AUTHENTICATE_TOKEN) {
					authenticateToken();
				}
				else if (instance.state == STATE_AUTHENTICATED && instance.sslType == HANDSHAKE_ENC_PLAIN) {
					returnResultsToCaller(instance.appxResult);
				}
				raw_socket.destroy();
			}, 0);
		};

		var callbacks = {
			data: dataCallback,
			close: closeCallback
		};

		var raw_socket = createAndConnectSocket(callbacks);

		// Send handshake requesting plain text
		sendHandshake(raw_socket);
	};

	function authenticateSSL(raw_socket) {
		logWithID(debugConfig.INFO, 'starting SSL...');

		instance.appxResult = [];

		function secureCallback() {
			logWithID(debugConfig.INFO, 'Requesting user token...');
			logWithID(debugConfig.INFO, 'send user=' + providerConfig.appxuser);
			sendLogin(tls_socket, 'requestToken');
		};

		function closeCallback() {
			var result = instance.appxResult;

			if (result.length >= 2 && result[0] == 0 && result[1] == 1) {
				result = result.slice(2);
			}
			else {
				setState(STATE_FAILURE);
			}

			if (instance.state == STATE_AUTHENTICATE_LOGIN && result.length == LOGON_TOKEN_LENGTH + 4) {
				var len = new Buffer.from(result.slice(0, 4), 'utf8').readUInt32BE(0);

				if (len == LOGON_TOKEN_LENGTH) {
					setState(STATE_AUTHENTICATE_TOKEN);
					result = result.slice(4);
					instance.token = new Buffer.from(result).toString();
					result = '';
					logWithID(debugConfig.INFO, 'Token = ' + instance.token);
					instance.appxUser = instance.token.substr(0, 20);
					instance.appxPswd = instance.token.substr(20, 20);
					instance.appxHost = instance.token.substr(40, 20);
					tls_socket.destroy();

					authenticateToken();
				}
				else {
					setState(STATE_FAILURE);
				}
			}
			else {
				setState(STATE_FAILURE);
			}
		};

		var callbacks = {
			secureCallback: secureCallback,
			closeCallback: closeCallback
		}

		var tls_socket = createAndConnectSocketSSL(raw_socket, callbacks);
	};

	function authenticateToken() {
		instance.appxResult = [];
		instance.sslType = HANDSHAKE_ENC_TOKEN;

		logWithID(debugConfig.INFO, 'Start of authenticateToken() function');

		function dataCallback(data) {
			if (instance.state == STATE_HANDSHAKE && instance.appxResult.length >= 2) {
				if (instance.appxResult[0] == HANDSHAKE_VERSION) {
					var sslType = instance.appxResult[1];
					instance.appxResult = instance.appxResult.slice(2);
					setState(STATE_AUTHENTICATE_TOKEN);

					logWithID(debugConfig.INFO, 'Sending authentication token');

					sendLogin(raw_socket, 'authToken');
				}
			}

			if (instance.state == STATE_AUTHENTICATE_TOKEN && instance.appxResult.length >= 2) {
				if (instance.appxResult[0] == 0 && instance.appxResult[1] == 1) {
					instance.appxResult = instance.appxResult.slice(2);
					setState(STATE_AUTHENTICATED);
					authenticateTokenSSL(raw_socket);
				}
			}
		}

		function closeCallback() {
			returnResultsToCaller(instance.appxResult);
		}

		var callbacks = {
			data: dataCallback,
			close: closeCallback
		};

		var raw_socket = createAndConnectSocket(callbacks);

		logWithID(debugConfig.INFO, 'user=' + instance.appxUser);

		sendHandshake(raw_socket);
	};

	function authenticateTokenSSL(raw_socket) {
		logWithID(debugConfig.INFO, 'starting SSL...');

		instance.appxResult = [];

		function secureCallback() {
			sendMessageToServer(tls_socket);
		}

		function closeCallback(data) {
			setState(STATE_INITIAL);
		}

		var callbacks = {
			secureCallback: secureCallback,
			closeCallback: closeCallback
		}

		var tls_socket = createAndConnectSocketSSL(raw_socket, callbacks);
	};

	function createAndConnectSocket(callbacks) {
		instance.appxResult = [];

		var raw_socket = new net.Socket();

		raw_socket.on('data', function (data) {
			logWithID(debugConfig.DATA, 'SOCKET RECEIVED DATA - (' + data.length + ')');
			logWithID(debugConfig.DATA, data.toString('utf8'));
			logWithID(debugConfig.DATA, '0x' + data.toString('hex'));
			instance.appxResult.push(...data);
			if (callbacks.data)
				callbacks.data(data);
		});

		raw_socket.on('close', function () {
			logWithID(debugConfig.INFO, 'SOCKET CLOSE');
			if (callbacks.close)
				callbacks.close();
		});

		raw_socket.setTimeout(60000, function () {
			logWithID(debugConfig.ERROR, 'SOCKET TIMEOUT');
			if (callbacks.timeout)
				callbacks.timeout();
			raw_socket.destroy();
		});

		raw_socket.on('end', function () {
			logWithID(debugConfig.INFO, 'SOCKET END');
			if (callbacks.end)
				callbacks.end();
		});

		raw_socket.on('error', function (err) {
			logWithID(debugConfig.INFO, 'SOCKET ERROR: ' + err);
			if (callbacks.error)
				callbacks.error();
		});

		raw_socket.connect(parseInt(providerConfig.port), providerConfig.host, function () {
			logWithID(debugConfig.INFO, 'authenticate() Connected to ' + providerConfig.host + ':' + providerConfig.port);
			if (callbacks.connect)
				callbacks.connect();
		});

		return raw_socket;
	};

	function createAndConnectSocketSSL(raw_socket, callbacks) {
		instance.appxResult = [];

		var options = {
			socket: raw_socket,
			rejectUnauthorized: providerConfig.sslRejectUnauth
		};

		if (providerConfig.sslCaFilePath != '') {
			options.ca = providerConfig.sslCaFilePath;
		}

		if (!providerConfig.sslCheckSvrName) {
			options.checkServerIdentity = (servername, cert) => { return undefined; }
		}

		var tls_socket = tls.connect(options, function () {
			logWithID(debugConfig.INFO, 'connection upgraded to SSL!');
		});

		tls_socket.on('secureConnect', () => {
			logWithID(debugConfig.INFO, 'TLS SOCKET SECURE');
			if (callbacks.secureCallback)
				callbacks.secureCallback();
		});

		tls_socket.on('data', (data) => {
			logWithID(debugConfig.INFO, 'TLS SOCKET RECEIVED DATA - (' + data.length + ') ');
			logWithID(debugConfig.DATA, data.toString('utf8'));
			logWithID(debugConfig.DATA, '0x' + data.toString('hex'));
			instance.appxResult.push(...data);
			if (callbacks.dataCallback)
				callbacks.dataCallback(data);
		});

		tls_socket.on('close', () => {
			logWithID(debugConfig.INFO, 'TLS SOCKET CLOSED');
			if (callbacks.closeCallback)
				callbacks.closeCallback();
		});

		tls_socket.on('error', (err) => {
			logWithID(debugConfig.ERROR, 'TLS SOCKET ERROR - ' + err);
			if (callbacks.errorCallback)
				callbacks.errorCallback(err);
		});

		tls_socket.on('end', () => {
			logWithID(debugConfig.INFO, 'TLS SOCKET END');
			if (callbacks.endCallback)
				callbacks.endCallback();
		});

		tls_socket.on('timeout', () => {
			logWithID(debugConfig.ERROR, 'TLS SOCKET TIMEOUT');
			if (callbacks.timeoutCallback)
				callbacks.timeoutCallback();
		});

		return tls_socket;
	};

	function sendHandshake(raw_socket) {
		setState(STATE_HANDSHAKE);
		var thandshake = new Buffer.alloc(2);
		thandshake[0] = HANDSHAKE_VERSION;
		thandshake[1] = instance.sslType;
		raw_socket.write(thandshake);
	}

	function sendLogin(socket, extra) {
		var tlogin = new Buffer.alloc(331);

		if (providerConfig.enablessl)
			logWithID(debugConfig.INFO, 'Sending login for SSL user: ' + instance.appxUser);
		else
			logWithID(debugConfig.INFO, 'Sending login for user: ' + providerConfig.appxuser);

		tlogin.fill();

		if (providerConfig.enablessl) {
			tlogin.write(instance.appxUser);
			tlogin.write(instance.appxPswd, 21);
		}
		else {
			tlogin.write(providerConfig.appxuser);
			tlogin.write(providerConfig.appxpass, 21);
		}

		if (extra) {
			logWithID(debugConfig.INFO, 'extra=' + extra);
			tlogin.write(extra, 42);
			if (extra == 'authToken')
				tlogin.write(instance.appxHost, 52);
		}

		socket.write(tlogin);
	};

	function setState(newState) {
		instance.state = newState;
		logWithID(debugConfig.INFO, 'STATE: ' + instance.state, new Error().stack);
	};

	function logWithID(type, str, err) {
		debugConfig.log(type, '(ReqID:' + instance.requestID + ') ' + str, (err ? err : new Error().stack));
	}

}; // end of send function

module.exports = Appx;
