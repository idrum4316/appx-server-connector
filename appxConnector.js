"use strict";

const serverConnectorVersionStr = "6.0.0.20072712";
const serverConnectorVersionNum = 60000.20072712;

const cluster = require('cluster');
const os = require('os');

//  *********************************************************
//  Configuration Section - Begin
//  *********************************************************

const connectorPort         = process.env.APPX_CONNECTOR_PORT;    // Port the appxConnector listens on for client connections
const workers               = os.cpus().length;                   // Number of worker processes spawned to listen for incoming connections

const sslEnabled            = true;                               // Are we using SSL for our connections?
const sslPrivateKey         = "/etc/pki/tls/private/appx.com.key";
const sslCertificate        = "/etc/pki/tls/certs/appx.com.crt";
const sslCertAuthority      = "/etc/pki/tls/certs/ca-bundle.crt";

const cryptoEnabled         = false;                              // Are we using Crypto to encrypt traffic?  Must be off if SSL is on
const mongoDatabase         = "AppxDatabaseCache";                // The name of the database in Mongo we use to cache all of our data
const mongoHost             = "localhost";                        // The hostname of the server mongo is running on
const mongoPort             = 27017;                              // The port number on that server that mongo is listening on
const appxdebug             = false;                              // Dump debug log info to stdout of the worker process?
const appxlog               = false;                              // Create a disk log file?
const useoldsocket			= false;							  // If set to true, the non SSL capable APPX engine socket and logic are used 	

const appxLocalConnectorCert= null;   							  // If local connector needs certificate authority point to it here  

//  *********************************************************
//  Configuration Section - End
//  *********************************************************

const TMNET_FEATURE2_APPX64_BIT = 0x00001000;
const TMNET_FEATURE2_LARGE_WORK_FIELD = 0x00002000;
const TMNET_FEATURE2_UNICODE_ENGINE = 0x00000100;

const FLD_SPEC_TOKEN = 0x02;

function dlog( msg, obj ) {
    if( appxdebug ) {
	var nowStr = new Date(Date.now()).toISOString();
	if( obj ) {
	    console.log( nowStr + " - " + msg + "..." );
	    console.dir(obj);
	}
	else {
	    console.log( nowStr + " - " + msg );
	}
    }
}

function dlogForce( msg, obj ) {
    if( true ) {
	var nowStr = new Date(Date.now()).toISOString();
	if( obj ) {
	    console.log( nowStr + " - " + msg + "..." );
	    console.dir(obj);
	}
	else {
	    console.log( nowStr + " - " + msg );
	}
    }
}

if (process.argv.length > 2) {
    process.chdir(process.argv[2]);
} else if (process.env.APPX_CONNECTOR_DIR) {
    process.chdir(process.env.APPX_CONNECTOR_DIR);
}

if (workers < 1) {
    masterCode();
    workerCode();
} else {
    if (cluster.isMaster) {
        masterCode();
    } else {
        dlog("appxConnector Worker process started, pid: " + process.pid);
        process.title = "node appxConnector.js worker #" + cluster.worker.id;
        workerCode();
    }
}

function masterCode() {
    //  *********************************************************
    //  Master process code
    //  *********************************************************

    var MongoClient = require('mongodb').MongoClient;
    var mongoOptions = {
                        serializeFunctions: true,
                        useNewUrlParser: true,
                        useUnifiedTopology: true
                        };
    var mongoUrl = 'mongodb://' + mongoHost + ':' + mongoPort + '/' + mongoDatabase + '?socketTimeoutMS=30000';
    var mongoCacheDb = null;


    // Make sure we can connect to Mongo
    MongoClient.connect(mongoUrl, mongoOptions, function mongoClient_connectCallback(err, client) {
        if (err) {
            dlog("appxConnector - mongo.connect() failed: " + err);
        } else {

            // Initialize our working database
            mongoCacheDb = client.db(mongoDatabase);
            mongoCacheDb.dropDatabase({}, function mongo_dropdatabase(err) {

                if (err) {
                    dlog("appxConnector - mongo.dropDatabase() failed: " + err);
                }

                // Close the mongo connection
                client.close(true, function mongo_closeCallback() {

                    // Mongo is good to go so spin up the worker processes
                    if (workers > 0) {
                        dlog(`MongoDB ${mongoDatabase} initialized, Creating ${workers} appxConnector worker processes`);
                        dlog("appxConnector Master process running, pid: " + process.pid);
                        for (let i = 0; i < workers; i++) {
                            cluster.fork();
                        }
                    }
                });

            });
        }
    });
}

function workerCodeChild() {
    //  *********************************************************
    //  Worker process code
    //  *********************************************************

    const fs = require('fs');
    const cp = require('child_process');

    if (sslEnabled)
        var https = require('https');
    else
        var https = require('http');

    // Configure the websocket
    if (sslEnabled) {
        var options = {
            key: fs.readFileSync(sslPrivateKey),
            cert: fs.readFileSync(sslCertificate),
            ca: fs.readFileSync(sslCertAuthority)
        };

        var app = https.createServer(options, function https_createServerCallback() {}).listen(connectorPort);
    } else {
        var app = https.createServer(function https_createServerCallback() {}).listen(connectorPort);
    }

    // Websocket Connection Handler - must catch upgrade from http to ws and fork the raw http socket
    app.on('upgrade', function wss_onConnectionCallback(req, ws, head) {
        // The space argument on the next line is to reserve some space on the OS process list display for updating
        var child = cp.fork('appxConnectorChild.js', ['.', '                                 ']);
//        var child = cp.spawn('node', ['./appxConnectorChild.js','.', '                                 '],{detached: true, stdio: ['ignore','ignore','ignore','ipc']});
        child.send({
            headers: req.headers,
            method: req.method,
            config: {
                cryptoEnabled: cryptoEnabled,
                mongoDatabase: mongoDatabase,
                mongoHost: mongoHost,
                mongoPort: mongoPort,
                appxdebug: appxdebug,
                appxlog: appxlog
            }
        }, ws, head);
        child.disconnect();
        child.unref();
    });
}

function workerCode() {
//  *********************************************************
//  Configuration Section - Begin
//  *********************************************************
"use strict";
var rotLog = false;
var mongoStatus = "Running";

//  *********************************************************
//  Configuration Section - End
//  *********************************************************

/************************************************************
    Library Imports - Begin
*************************************************************/
var atob = require('atob');
var StripHtml = require("string-strip-html");
var GridFSBucket = require('mongodb').GridFSBucket;
var MongoClient = require('mongodb').MongoClient;
var MongoServer = require('mongodb').Server;
var fs = require('fs');
var WebSocket = require('ws').WebSocket;
var WebSocketServer = require('ws').Server;
const { Readable } = require('stream');
var net = require('net');
var hexy = require('hexy');
var crypto = require('crypto');
var node_cryptojs = require('node-cryptojs-aes');
var iconv = require('iconv-lite');
var appxSocket = require('./appxsocket');

/************************************************************
    Library Imports - End
*************************************************************/

// Global variables and Objects
var mongoUrl = 'mongodb://' + mongoHost + ':' + mongoPort + '/' + mongoDatabase + '?socketTimeoutMS=30000';
var mongoCacheDb = null;
var mongoOptions = {
	useNewUrlParser: true,
    useUnifiedTopology: true
};

MongoClient.connect(mongoUrl, mongoOptions, function mongoClient_connectCallback(err, client) {
    mongoCacheDb = client.db(mongoDatabase);
    if (err) {
        mongoStatus = "Error";
    } else {
        mongoCacheDb.dropDatabase({}, function mongo_dropdatabase(err, result) {
            createWebSocket();
        });
    }
});

var arrayPush = Array.prototype.push;

// If there is an extra argument on the command line that is a request to change our working directory

if (process.argv.length > 2)
    process.chdir(process.argv[2]);
else if (process.env.APPX_CONNECTOR_DIR)
    process.chdir(process.env.APPX_CONNECTOR_DIR);

// Find out which result Buffer.toJSON() returns.  This changed between Node 11.0 and 11.1
var appxToJsonTest = Buffer.from("test");
var appxIsToJsonAnArray = appxToJsonTest.toJSON(appxToJsonTest) instanceof Array;

// create a log file
if (appxlog) {
    var d = new Date();
    var logfile = d.getMonth() + 1 + '' + d.getDate() + '' + d.getFullYear() + '' + d.getHours() + '' + d.getMinutes() + '' + d.getSeconds() + '' + '.log';
    fs.appendFile(logfile, 'creating the logfile', function fs_appendFileCallback(err) {
        if (err) {
            dlog("Log File Error:  " + err);
        }
        dlog('Created log file:  ' + logfile);
    });
}

function createWebSocket() {
    var CryptoJS = node_cryptojs.CryptoJS;
    var JsonFormatter = node_cryptojs.JsonFormatter;
    var uploadLocation;

	// Create the arguments we'll be using to configure the APPX SSL socket
    var conf = {
        ProviderConfig: {},
		DebugConfig: {}
    };

    if (sslEnabled)
        var https = require('https');
    else
        var https = require('http');

    // Configure the websocket
    if (sslEnabled) {
        var options = {
            key: fs.readFileSync(sslPrivateKey),
            cert: fs.readFileSync(sslCertificate),
            ca: fs.readFileSync(sslCertAuthority)
        };

        var app = https.createServer(options, function https_createServerCallback(req, res) {
        }).listen(connectorPort);
    }
    else {
        var app = https.createServer(function https_createServerCallback(req, res) {
        }).listen(connectorPort);
    }

    // start a websocket server
    var wss = new WebSocketServer({
        server: app
    });

    // globals
    var clientnumber = 0;

    // Websocket Connection Handler
    wss.on('connection', function wss_onConnectionCallback(ws) {
        dlog("connected: " + Date.now());
        var gridStoreData = [];
        ws.send2 = function ws_send2(s) {
            var m = s;
            if (cryptoEnabled)
                m = CryptoJS.AES.encrypt(s, "APPX", {
                    format: JsonFormatter
                }).toString();
            try {
                this.send(m, function ws_send2_sendCallback(error) {
                    if (error) {
                        dlog(error.stack);

                    }
                });
            }
            catch (ex) {
                dlog("send2() failed, exception=" + ex);
            }
        };

        // Add connection meta data to this message for easier debugging
        logactivity("user connected...");

        //increment the client number to have a way to kill it's session's server loop
        var myid = clientnumber++;
        // Start a server loop specific to the client
        // The scope of variables in Javascript and Node allows this websocket connection ("ws") to be
        // mappped to the APPX socket ("client") created below
        var appxprocessor = new APPXProcessor(ws, myid);

        //passed login, so now we're safe to connect to the db
        //will we need this on reconnect and new session?
        //may want to add user/pass to mongodb to challenge
        appxprocessor.mongoconnector = new appxTableDataHandler();
		
		if (useoldsocket) {
			// Create a socket client to APPX
			var client_appx_socket = new net.Socket();
			appxprocessor.clientsocket = client_appx_socket;
		}
		  else {
			// Create a placeholder for a socket client to APPX
			var client_appx_socket;
		}
		
		// Setup the debug parameters 
		conf.DebugConfig.stackWidth = 22;
		conf.DebugConfig.STAT = { "desc": "STATUS ", "trace": false, "show": true  }; // Log Status messages
		conf.DebugConfig.ERROR = { "desc": "ERROR  ", "trace": true,  "show": true };  // Log Error messages
		conf.DebugConfig.WARN =	{ "desc": "WARNING", "trace": false, "show": false }; // Log Warning messages
		conf.DebugConfig.INFO =	{ "desc": "INFO   ", "trace": false, "show": false }; // Log Informational messages
		conf.DebugConfig.DATA =	{ "desc": "DATA   ", "trace": false, "show": false }; // Log Data summary information
		conf.DebugConfig.DUMP =	{ "desc": "DUMP   ", "trace": false, "show": false }; // Log Data detailed strings/dumps
		conf.DebugConfig.ALL = { "desc": "       ", "trace": false, "show": true } ; // Log all of the above
		// Make the debug parameters global for the APPX socket's use
		global.debugConfig = conf.DebugConfig;
	
		// Setup as global, the APPX socket logging function 
		global.debugConfig.log = function debug_log(type, str, stk) {
			if (appxdebug) {
				if (type.show || this.ALL.show) {
					var stack = stk ? stk : new Error().stack;
					var line = stack.split('\n')[2]
					.replace(global.dirname, '.')
					.replace(/^.*[.][/]/, '')
					.replace(/[:][^:]*[)]$/, '')
					.concat(' '.repeat(this.stackWidth))
					.substring(0, this.stackWidth);

					console.log('[ %s %s] %s', type.desc, line, str);

					if (type.trace)
						console.trace();
				}
			}
		};

        // Map a function to cleanup on websocket close event
        ws.on('close', function ws_onCloseCallback(evt) {
            dlog("Client side socket closing: " + Date.now());
            logactivity('ws client disconnected... #:' + myid);
			
			if (useoldsocket) {
				client_appx_socket.destroy();
			}				
			  else if (typeof client_appx_socket !== 'undefined') {
				client_appx_socket.destroy();
			}
            appxprocessor.end();
        });

        // Map a function to log on websocket error event
        ws.on('error', function ws_onErrorCallback(err) {
            logactivity('ws client error occurred' + err);
            dlog("error: " + err);
            appxprocessor.end();
        });
		
		if (useoldsocket) {
			// Add a 'close' event handler for the engine socket
			client_appx_socket.on('close', function client_appx_socket_onCloseCallback(evt) {
				dlog("Engine side socket closing: " + Date.now());
				appxprocessor.end();
				logactivity('ALERT:  Connection closed');
			});

			// Map a function to handle data from the APPX server
			client_appx_socket.on('data', function client_appx_socket_onDataCallback(data) {
				// push data from the server onto the clients buffer(an array)
				if (appxIsToJsonAnArray) {
					appxprocessor.rtndata = appxprocessor.rtndata.concat(data.toJSON(), new Array());
				}
				else {
					arrayPush.apply(appxprocessor.rtndata, Buffer.from(data));
				}
				// if we have received enough bytes to satify the next parser request
				// run the parser before receiving any more data.
				if (appxprocessor.needbytes <= appxprocessor.rtndata.length || appxprocessor.rtndata.length >= appxprocessor.maxByteSize || (appxprocessor.rtndata.length + appxprocessor.byteCount) >= appxprocessor.needbytes ) {
					var prcd;
					try {
						prcd = appxprocessor.appxprocessmsg();
					}
					catch (ex) {
						logactivity("appxprocessmsg() failed, ex=" + ex);
						dlog(ex.stack);
					}
				}
			});

			// Add an 'end' event handler for the client socket
			client_appx_socket.on('end', function client_appx_socket_onEndCallback() {
				logactivity('ALERT:  client_appx_socket disconnected');
				ws.close();
			});

			// Map a function to log client error event
			client_appx_socket.on('error', function client_appx_socket_onErrorCallback(err) {
				logactivity('ERROR:  client_appx_socket error \n\n' + err);
				dlog("client-socket error: " + err);
				ws.close();
				appxprocessor.end();
			});
		}
		else {
				
			// A 'close' event handler for the engine socket
			function appxsocket_onCloseCallback(evt) {
				dlog("Engine side socket closing: " + Date.now());
				appxprocessor.end();
				logactivity('ALERT:  Connection closed');
			};

			// A 'data' event handler for the engine socket
			function appxsocket_onDataCallback(data) {
				// push data from the server onto the clients buffer(an array)
				if (appxIsToJsonAnArray) {
					appxprocessor.rtndata = appxprocessor.rtndata.concat(data.toJSON(), new Array());
				}
				else {
					arrayPush.apply(appxprocessor.rtndata, Buffer.from(data));
				}
				// if we have received enough bytes to satify the next parser request
				// run the parser before receiving any more data.
				if (appxprocessor.needbytes <= appxprocessor.rtndata.length || appxprocessor.rtndata.length >= appxprocessor.maxByteSize || (appxprocessor.rtndata.length + appxprocessor.byteCount) >= appxprocessor.needbytes ) {
					var prcd;
					try {
						prcd = appxprocessor.appxprocessmsg();
					}
					catch (ex) {
						logactivity("appxprocessmsg() failed, ex=" + ex);
						dlog(ex.stack);
					}
				}
			};

			// An 'end' event handler for the engine socket
			function appxsocket_onEndCallback() {
				logactivity('ALERT:  client_appx_socket disconnected');
				ws.close();
			};

			// An 'error' event handler for the engine socket
			function appxsocket_onErrorCallback(err) {
				logactivity('ERROR:  client_appx_socket error \n\n' + err);
				dlog("client-socket error: " + err);
				ws.close();
				appxprocessor.end();
			};

			// A 'loggedin' event handler for the APPX socket class
			var onLoggedIn = function appxsocket_onLoggedIn(socket, loginstatus, servermessage) {
				client_appx_socket = socket;
				appxprocessor.clientsocket = client_appx_socket;
				remove_listener(socket, 'close');
				remove_listener(socket, 'data');
				remove_listener(socket, 'end');
				remove_listener(socket, 'error');
				socket.on('close', appxsocket_onCloseCallback);
				socket.on('data', appxsocket_onDataCallback);
				socket.on('end', appxsocket_onEndCallback);
				socket.on('error', appxsocket_onErrorCallback);

				// When this 'loggedin' event is called, the 'loginstatus' as to whether we have successfully or failed to logged in to APPX has already been recieved.
				// That 'loginstatus', regardless of it's value, is considered to be a part of a longer message that we will either receive on the socket
				// 	if the login was successful or will have already received if the handshake or login has failed.
				// Since the 'loginstatus' is in essence 'lost', we must add it to the receive buffer so it is a part of that longer message and
				// in the case of a login failure the 'servermessage' must be added too.				
				if (loginstatus) { 
					appxprocessor.rtndata.length = 0;
					arrayPush.apply(appxprocessor.rtndata, Buffer.from("0001", 'hex'));
					appxprocessor.appxprocessmsg();
				} 
				  else {
					appxprocessor.rtndata.length = 0;
					arrayPush.apply(appxprocessor.rtndata, Buffer.from("0000000000", 'hex'));
					arrayPush.apply(appxprocessor.rtndata, Buffer.from(servermessage.length.toString(16), 'hex'));
					appxprocessor.appxprocessmsg();
					arrayPush.apply(appxprocessor.rtndata, Buffer.from(servermessage, 'utf8'));
					appxprocessor.appxprocessmsg();
				} 
			};
			
			function remove_listener(object, name) {
				var listeners = [];
				listeners = object.listeners(name);
				for (var i = 0; i < listeners.length; i++) {
					object.off(name, listeners[i]);
				}
				logactivity('INFO:  Removing ' + listeners.length + ' listeners from event ' + name);
			}
		}

        // Map a function to handle web client message events
        ws.on('message', function ws_onMessageCallback(messageCrypt) {
            var message = messageCrypt;
            if (cryptoEnabled) {
                message = CryptoJS.AES.decrypt(messageCrypt, "APPX", {
                    format: JsonFormatter
                });
                message = CryptoJS.enc.Utf8.stringify(message);
            }

            // stub up a message object
            var ms = {};
            var g;

            try {
                if (message[0] !== "{") {
                    ms.cmd = "appxfileuploadmessage";
                    ms.base64 = true;
                    ms.args = Buffer.from(atob(message).split(","));
                    ms.handler = uploadLocation;
                    g = true;
                } else {
                    ms = JSON.parse(message);
                    if (ms.hasOwnProperty("handler")) {
                        uploadLocation = ms.handler;
                    }
                    g = true;
                    logactivity("received good message:  " + message);
                }
            }
            catch (appxerror) {
                logactivity("Message:  " + message);
                logactivity(appxerror);
                g = false;
                dlog("Message: " + message);
                dlog(appxerror.stack);
            }

            try {
                if (g) {
                    if (rotLog) {
                        dlog("Client message: " + ms.cmd);
                    }

                    switch (ms.cmd) {
                        case "openfile":
                            // may not use this
                            break;
                        case "appxlogin":
							if (useoldsocket) {
								//Connect to Appx Connection Manager
								client_appx_socket.connect(parseInt(ms.args[1]), ms.args[0], function client_appx_socket_connectCallback() {
									logactivity("CONNECTED TO " + ms.args[0] + ":" + ms.args[1]);
								});
								//created and send login to APPX
								appxprocessor.uid = ab2str(ms.args[2]);
								var tlogin = Buffer.alloc(331);
								tlogin.write(ms.args[2]);
								tlogin.write(ms.args[3], 21);
								client_appx_socket.write(tlogin);
								appxprocessor.cacheCollection = ms.args[0] + "_" + ms.args[1];
								appxprocessor.hostCollection = ms.args[0] + "/" + ms.args[1];
							}
							  else {
								  
								// Setup the login parameters 
								conf.ProviderConfig.host = ms.args[0];
								conf.ProviderConfig.port = ms.args[1];
								conf.ProviderConfig.appxuser = ms.args[2];
								conf.ProviderConfig.appxpass = ms.args[3];
								conf.ProviderConfig.runApplication = null;
								conf.ProviderConfig.runDatabase = null;
								conf.ProviderConfig.runProcessType = null;
								conf.ProviderConfig.runProcess = null;
								conf.ProviderConfig.filler = null;
								conf.ProviderConfig.reconnectId = null;
								conf.ProviderConfig.appxtoken = "";
								conf.ProviderConfig.enablessl = sslEnabled;
								// Make the login parameters global for the APPX socket's use
								global.providerConfig = conf.ProviderConfig;
								
								// Save the configuration (We don't use but we could and this how we could use it)		
								//var config_filename = 'default-' + conf.ProviderConfig.host + '_'  + conf.ProviderConfig.port
								//fs.writeFileSync('config/' + config_filename + '.json', JSON.stringify(conf, null, 4));
								
								
								// Setup the APPX Socket for a send (test code for the 'data connector') 
								//var returnResults;
								//global.appxsocket = new appxSocket();
								//global.appxsocket.send("Test", function(result) { returnResults = result; });
				
								// Setup the APPX Socket
								var appxsocket = new appxSocket();
							
								// Request an APPX Login
								//appxsocket.login(appxsocket_onLoggedIn);
								appxsocket.login(onLoggedIn);
							
								appxprocessor.uid = ab2str(ms.args[2]);
								appxprocessor.cacheCollection = ms.args[0] + "_" + ms.args[1];
								appxprocessor.hostCollection = ms.args[0] + "/" + ms.args[1];
							}
                            break;
                        case "appxreconnect":
							if (useoldsocket) {
								//Connect to Appx Connection Manager
								client_appx_socket.connect(parseInt(ms.args[1]), ms.args[0], function client_appx_socket_connectCallback() {
									logactivity("CONNECTED TO " + ms.args[0] + ":" + ms.args[1]);
								});
								//created and send login to APPX
								var treconnect = Buffer.alloc(331);
								treconnect.write(ms.args[2]);
								treconnect.write(ms.args[3], 21);
								for (var rc = 0; rc < ms.args[4].length; rc++) {
									treconnect[320 + rc] = ms.args[4].charCodeAt(rc);
								}
								client_appx_socket.write(treconnect);
							}
							  else {
								//Connect to Appx Connection Manager
								appxprocessor.uid = ab2str(ms.args[2]);
							
								// Setup the login parameters 
								conf.ProviderConfig.host = ms.args[0];
								conf.ProviderConfig.port = ms.args[1];
								conf.ProviderConfig.appxuser = ms.args[2];
								conf.ProviderConfig.appxpass = ms.args[3];
								conf.ProviderConfig.runApplication = ms.args[4];
								conf.ProviderConfig.reconnectId = 'reconnect';
								conf.ProviderConfig.appxtoken = "";
								conf.ProviderConfig.enablessl = sslEnabled;
								// Make the login parameters global for the APPX socket's use
								global.providerConfig = conf.ProviderConfig;
								
								// Setup the APPX Socket
								var appxsocket = new appxSocket();
							
								// Request an APPX Login
								//appxsocket.login(appxsocket_onLoggedIn);
								appxsocket.login(onLoggedIn);
							}
                            break;
                        case "appxnewsession":
							if (useoldsocket) {
								client_appx_socket.connect(parseInt(ms.args[1]), ms.args[0], function client_appx_socket_connectCallback() {
									logactivity("CONNECTED TO " + ms.args[0] + ":" + ms.args[1]);
								});
								//created and send login to APPX
								var tlogin = Buffer.alloc(331);
								tlogin.write(ms.args[2]);
								tlogin.write(ms.args[3], 21);
								//add 32 bytes for host and remap
								if (ms.args.length > 4) {
									if (ms.args[4]) {
										tlogin.write(ms.args[4], 74);
									}
									if (ms.args[5]) {
										tlogin.write(ms.args[5], 77);
									}
									if (ms.args[6]) {
										tlogin.write(ms.args[6], 80);
									}
									if (ms.args[7]) {
										tlogin.write(ms.args[7], 90);
									}
								}
								client_appx_socket.write(tlogin);
							}
							  else {
								  
								//Connect to Appx Connection Manager
								appxprocessor.uid = ab2str(ms.args[2]);
							
								// Setup the login parameters 
								conf.ProviderConfig.host = ms.args[0];
								conf.ProviderConfig.port = ms.args[1];
								conf.ProviderConfig.appxuser = ms.args[2];
								conf.ProviderConfig.appxpass = ms.args[3];
								conf.ProviderConfig.runApplication = ms.args[4];
								conf.ProviderConfig.runDatabase = ms.args[5];
								conf.ProviderConfig.runProcessType = ms.args[6];
								conf.ProviderConfig.runProcess = ms.args[7];
								conf.ProviderConfig.filler = ms.args[8];
								conf.ProviderConfig.reconnectId = ms.args[9];
								conf.ProviderConfig.appxtoken = "";
								conf.ProviderConfig.enablessl = sslEnabled;
								// Make the login parameters global for the APPX socket's use
								global.providerConfig = conf.ProviderConfig;
								
								// Setup the APPX Socket
								var appxsocket = new appxSocket();
							
								// Request an APPX Login
								//appxsocket.login(appxsocket_onLoggedIn);
								appxsocket.login(onLoggedIn);
							}
                            break;
                        case "appxmessage":
                                var b = Buffer.from(ms.args);
                                logactivity("ARGS:  " + b);
                                logHexDump("CLI->APX", b, "Client message to Server...");
                                client_appx_socket.write(b);
                            break;
                        case "appxfileuploadmessage":
                            if (ms.base64) {
                                var b = ms.args;
                            } else {
                                var b = Buffer.from(ms.args);
                            }
                            /*If we are uploading file to mongo instead of sending
                            **directly to server, then each args array is pushed into
                            **gridStoreData array to be processed when the close 
                            **message is sent.*/
                            if (ms.handler === "uploadfiletomongo") {
                                Array.prototype.push.apply(gridStoreData, b);
                                var msrtn = new Message();
                                msrtn.data = ms.data;
                                msrtn.datatype = "object";
                                msrtn.hasdata = "yes";
                                msrtn.haserrors = "no";
                                msrtn.type = "APPXFILEUPLOADPROGRESS";
                                sendMessage(ws, msrtn);
                            } else {
                                logactivity("ARGS:  " + b);
                                logHexDump("CLI->APX", b, "Client message to Server...");
                                client_appx_socket.write(b);
                                var msrtn = new Message();
                                msrtn.data = ms.args;
                                msrtn.datatype = "object";
                                msrtn.hasdata = "yes";
                                msrtn.haserrors = "no";
                                msrtn.type = "APPXFILEUPLOADPROGRESS";
                                sendMessage(ws, msrtn);
                            }
                            break;
                        case "appxclipboard":
                            var msg = Buffer.alloc(ms.args[0].length + 6);
                            msg.writeUInt32BE(ms.args[0].length, 0); // group
                            msg.writeUInt8(3, 4); // filler
                            msg.writeUInt8(1, 5); // ?senddata, 0 for now, 1 if data length is > amount server asked for
                            //the actual clipboard data
                            msg.write(ms.args[0], 6);
                            logactivity("ARGS:  " + ms.args + ", MSG: " + msg);
                            logHexDump("CLI->APX", msg, "Client message to Server...");
                            client_appx_socket.write(msg);
                            break;
                        case "appxtoken":
                            var msg = Buffer.alloc(12);
                            appxprocessor.curtoken = new TokenStructure();
                            msg.writeUInt32BE(new DataView(new Uint8Array(ms.args.slice(0, 2)).buffer).getUint16(0), 0); // group
                            msg.writeUInt32BE(0, 4); // st pos
                            msg.writeUInt32BE(0, 8); // max pos
                            logactivity("ARGS: " + ms.args + ", MSG: " + msg);
                            logHexDump("CLI->APX", msg, "Client message to Server...");
                            var header = Buffer.alloc(8);
                            header.writeUInt32BE(3, 0);
                            header.writeUInt8(79, 4);
                            header.fill(0, 5);
                            appxprocessor.curtokencount++;
                            client_appx_socket.write(header);
                            client_appx_socket.write(msg);
                            break;
                        case "appxresource":
                            var argsArray = ms.args.substring(1).split(",");
                            var arg0Array = argsArray[0].split(".");
                            var arg2Array = argsArray[2].split(".");
                            var currency = argsArray[1];
                            var cacheid2 = argsArray[0];
                            if (currency.length > 8) {
                                cacheid2 = argsArray[0].substring(0, argsArray[0].length - 11) + "XXXXXXXX" + argsArray[0].substring(argsArray[0].length - 3);
                            }
                            var fileName = appxprocessor.hostCollection + "/" + cacheid2 + "." + currency;
                            fileName = encodeURI(fileName);
                            var resQuery = mongoCacheDb.collection("resource.files").find({ filename: fileName });

                            resQuery.toArray(function resQuery_toArray(error, docs) {
                                if (error) {
                                    dlog("appxresource query.toArray error: " + error);
                                }
                                if (docs.length > 0) {
                                    var res = new ResourceStructure();
                                    res.ap = docs[0].metadata.ap;
                                    res.ver = docs[0].metadata.ver;
                                    res.cacheid = str4ab(argsArray[0].substring(7, 15));
                                    res.state = docs[0].metadata.state;
                                    res.ext = docs[0].metadata.ext;
                                    var path = docs[0].metadata.url;
                                    res.loctype = 1;
                                    res.data = str4ab(docs[0].metadata.url);
                                    res.len = res.data.length;
                                    var ms = new Message();
                                    ms.data = res;
                                    ms.datatype = "object";
                                    ms.hasdata = "yes";
                                    ms.haserrors = "no";
                                    ms.type = "APPXRESOURCE";
                                    sendMessage(ws, ms);
                                }
                                else {
                                    logactivity("sending getresource request 64-bit Engine="+ appxprocessor._APPX64);
                                    if(appxprocessor._APPX64){
                                        var msg = Buffer.alloc(32);
                                        msg.write(arg0Array[0].slice(0, 3), 0); // ap
                                        msg.write(arg0Array[1].slice(0, 2), 3); // ver
                                        msg.write(arg0Array[2].slice(0, 8), 5); // cacheid
                                        msg.writeUInt8(parseInt("0x" + arg0Array[3].slice(0, 2)), 13); // state
                                        msg.writeUInt16BE(parseInt("0x" + arg2Array[1].slice(0, 4)), 14); // id
                                        msg.writeBigUInt64BE(BigInt("0x" + arg2Array[0].slice(0, 16)), 16); // ctx
                                        msg.writeUInt8(parseInt("0x" + arg2Array[2].slice(0, 2)), 24); // type
                                        msg.fill(0, 25); // filler
                                    }
                                    else{
                                        var msg = Buffer.alloc(24);
                                        msg.write(arg0Array[0].slice(0, 3), 0); // ap
                                        msg.write(arg0Array[1].slice(0, 2), 3); // ver
                                        msg.write(arg0Array[2].slice(0, 8), 5); // cacheid
                                        msg.writeUInt8(parseInt("0x" + arg0Array[3].slice(0, 2)), 13); // state
                                        msg.writeUInt16BE(parseInt("0x" + arg2Array[1].slice(0, 4)), 14); // id
                                        msg.writeUInt32BE(parseInt("0x" + arg2Array[0].slice(0, 8)), 16); // ctx
                                        msg.writeUInt8(parseInt("0x" + arg2Array[2].slice(0, 2)), 20); // type
                                        msg.fill(0, 21); // filler
                                    }
                                    var header = Buffer.alloc(8);
                                    header.writeUInt32BE(12, 0);
                                    header.writeUInt8(83, 4); //TMNET_MSG_TYPE_GET_RESOURCE = 83
                                    header.fill(0, 5);
                                    appxprocessor.curresourcelistOut[argsArray[0]] = argsArray[1];
                                    appxprocessor.curresourcecountOut++;
                                    client_appx_socket.write(header);
                                    client_appx_socket.write(msg);
                                }
                            });

                            break;
                        case "appxdate":
                            var msg = Buffer.alloc(18);
                            appxprocessor.cursetfield = new SetFieldStructure();
                            msg.writeUInt8(ms.args[0], 0); // row
                            msg.writeUInt8(ms.args[1], 1); // col
                            msg.write(ms.args[2], 2); // date alpha16 string

                            var header = Buffer.alloc(8);
                            header.writeUInt32BE(18, 0);
                            header.writeUInt8(84, 4);
                            header.fill(0, 5);
                            appxprocessor.cursetfieldcount++;
                            client_appx_socket.write(header);
                            client_appx_socket.write(msg);
                            break;
                        //TOD) - FIXME - REENGINEER show messages
                        case "appxsendshow":
                            var msg = Buffer.alloc(18);
                            appxprocessor.cursetfield = new SetFieldStructure();
                            msg.writeUInt8(ms.args[0], 0); // row
                            msg.writeUInt8(ms.args[1], 1); // col
                            msg.write(ms.args[2], 2); // date alpha16 string

                            var header = Buffer.alloc(8);
                            header.writeUInt32BE(18, 0);
                            header.writeUInt8(84, 4);
                            header.fill(0, 5);
                            appxprocessor.cursetfieldcount++;
                            client_appx_socket.write(header);
                            client_appx_socket.write(msg);
                            break;
                        case "updatelocal":
                            fs.readFile("localConnectorUpdate.zip", function fs_readFileCallback(err, data) {
                                if (!err) {
                                    ms.data = data;
                                    ms.hasdata = "yes";
                                    ms.haserrors = "no";
                                    ms.type = "UPDATE";
                                    sendMessage(ws, ms);
                                }
                                else {
                                    dlog(err);
                                    ms.hasdata = "no";
                                    ms.haserror = "yes";
                                    ms.error = err;
                                    sendMessage(ws, ms);
                                }
                            });
                            break;
                        case "appxinit":
                            // This appxinit message provides the opportunity to push down any assets needed on the client
                            // Send anything needed to start the session
                            var sendfile = function sendfile(fi) {
                                fs.readFile(fi, 'utf8', function fs_readFileCallback(err, data) {
                                    if (!err) {
                                        ms.data = data;
                                        ms.hasdata = "yes";
                                        ms.haserrors = "no";
                                        ms.serverConnectorVersionStr = serverConnectorVersionStr;
                                        ms.serverConnectorVersionNum = serverConnectorVersionNum;
                                        ms.mongoStatus = mongoStatus;

                                        ms.type = (fi.toLowerCase().indexOf(".js") != -1 ? "SCRIPT" : "STYLE");
                                        sendMessage(ws, ms);
                                    }
                                    else {
                                        dlog(err);
                                        ms.hasdata = "no";
                                        ms.haserror = "yes";
                                        ms.serverConnectorVersionStr = serverConnectorVersionStr;
                                        ms.serverConnectorVersionNum = serverConnectorVersionNum;
                                        ms.error = err;
                                        sendMessage(ws, ms);
                                    }
                                });
                            };
                            /*If we have minified versions available then load the 
                            **minified files*/
                            var min = "";
                            if (ms.args[0] === true) {
                                min = ".min";
                            }
                            // Send client automaticLogin handler library code
                            sendfile('appx-client-automaticLogin' + min + '.js');
                            // Send client utility library code
                            sendfile('appx-client-util' + min + '.js');
                            // Send client item handler library code
                            sendfile('appx-client-item' + min + '.js');
                            // Send client key handler library code
                            sendfile('appx-client-keys' + min + '.js');
                            // Send client localos handler library code
                            sendfile('appx-client-localos' + min + '.js');
                            // Send main Javascript Library code to handle messages like Widgets, etc
                            sendfile('appx-client-main' + min + '.js');
                            // Send client menu handler library code
                            sendfile('appx-client-menu' + min + '.js');
                            // Send client resource handler library code
                            sendfile('appx-client-resource' + min + '.js');
                            // Send client screen handler library code
                            sendfile('appx-client-screen' + min + '.js');
                            // Send client session handler library code
                            sendfile('appx-client-session' + min + '.js');
                            // Send client token handler library code
                            sendfile('appx-client-token' + min + '.js');
                            // Send client token handler library code
                            sendfile('appx-client-setfield' + min + '.js');
                            
                            // Send client widget handler library code
                            sendfile('appx-client-table' + min + '.js');
                            // Send client widget handler library code
                            sendfile('appx-client-widget' + min + '.js');
                            // Send client options handler library code
                            sendfile('appx-client-options' + min + '.js');
                            
                            break;
                        case "ping":
                            break;
                        case "appxMongoToEngine":
                            var fileData = Buffer.alloc(0);
                            var fileName;
                            /*
                            ** check if we have mongoFileName use it if not use fileName, MongoFileName has more
                            ** escaping on the file path to make it more suitable for mongoDB
                            */
                            if(ms.mongoFileName !== undefined && ms.mongoFileName.length > 0){
                                fileName = encodeURI(ms.mongoFileName);
                            }
                            else{
                                fileName = encodeURI(ms.fileName);
                            }

                            var gb = new GridFSBucket(mongoCacheDb, { bucketName: appxprocessor.cacheCollection });
                            var downloadStream = gb.openDownloadStreamByName(fileName);
                            var fileDataLength = null;
                            var id = null;

							dlogForce("appxConnector appxMongoToEngine filename="+fileName);

                            downloadStream.on("error", function downloadStream_onError(error) {
                                dlogForce("appxConnector appxMongoToEngine downloadStream error: " + error);
                                client_appx_socket.write(Buffer.from([3, 0]));
                            });

                            downloadStream.on("data", function downloadStream_onData(data) {
								dlogForce("appxConnector appxMongoToEngine sending data length="+data.length);
                                if (fileDataLength === null) {
                                    client_appx_socket.write(Buffer.from([3, 1]));
                                    fileDataLength = this.s.file.chunkSize;
                                    id = this.s.file._id;
                                    client_appx_socket.write(Buffer.from(hton32(fileDataLength)));
                                }
                                for (var i = 0; i * 2048 < data.length; i++) {
                                    var chunk = data.slice(i * 2048, i * 2048 + 2048);
                                    //send chunk length
                                    client_appx_socket.write(Buffer.from(hton32(chunk.length)));

                                    //send chunk
                                    client_appx_socket.write(Buffer.from(chunk));
                                }
                            });
                            downloadStream.on("end", function downloadStream_onEnd() {
                                dlogForce("appxConnector appxMongoToEngine END");
                                try {
                                    if (id === null) {
                                        client_appx_socket.write(Buffer.from(([3, 1])));
                                        client_appx_socket.write(Buffer.from(hton32(0)));
                                    } else {
                                        gb.delete(id);
                                    }
                                    //send null for EOF
                                    client_appx_socket.write(Buffer.from(hton32(0)));

                                    //send Filename Length
                                    client_appx_socket.write(Buffer.from(hton32(ms.fileName.length)));

                                    client_appx_socket.write(Buffer.from(ms.fileName));

                                    //send client status
                                    client_appx_socket.write(Buffer.from(([3, 1])));
                                } catch (e) {
                                    dlogForce(e);
                                    dlogForce(e.stack);
                                }
                            });
                            break;
                        case "appxCheckCharacterEncoding":
                            if (ms.args[1] !== null) {
                                var encodedStr = iconv.encode(ms.args[0], ms.args[1]);
                                var decodedStr = iconv.decode(encodedStr, ms.args[1]);
                                if (decodedStr !== ms.args[0]) {
                                    var msrtn = new Message();
                                    msrtn.data = ms.args;
                                    msrtn.datatype = "object";
                                    msrtn.hasdata = "yes";
                                    msrtn.haserrors = "no";
                                    msrtn.type = "APPXENCODINGERROR";
                                    sendMessage(ws, msrtn);
                                }
                            }
                            break;
                        default:
                            logactivity('no message');
                    }
                }
            }
            catch (appxerror2) {
                logactivity(appxerror2);
                dlog(appxerror2.stack);
            }
        });
    });

    logactivity("Server Running...");

}

// Logging function, added tracelevel for verbose logging
// May need to make sure file is writable before logging if too much logging is happening
function logactivity(data) {
    try {
        var delimiter = "\r\n";
        if (appxdebug) {
            dlog(data);
        }
        if (appxlog) {
            fs.appendFile(logfile, delimiter + data, function fs_appendFileCallback(err) {
                if (err) {
                    dlog("Log File Error:  " + err);
                }
            });
        }
    }
    catch (e) {
        dlog(e);
        dlog(e.stack);
    }
}

function consoleLogHexDump(tag, data, desc) {
    var format = {
        format: "twos",
        prefix: "[" + tag + "] "
    }
    dlog("");
    dlog("[" + tag + "] " + desc);
    dlog("[" + tag + "] " + data.length + " bytes logged");
    dlog(hexy.hexy(data, format));
}

function logHexDump(tag, data, desc) {
    if (!appxdebug)
        return;
    var format = {
        format: "twos",
        prefix: "[" + tag + "] "
    }
    logactivity("");
    logactivity("[" + tag + "] " + desc);
    logactivity("[" + tag + "] " + data.length + " bytes logged");
    logactivity(hexy.hexy(data, format));
}

// APPXProcessor. Object
// Handle all server Messages
function APPXProcessor(ws, id) {
    // Create a reference to this instance of the APPXProcessor.
    var self = this;
    self.uid = null;
    self.pid = null;
    self.cacheCollection = null;
    self.filesBucketName = null;
    self.hostCollection = null;
    self.pendingInserts = 0;
    self.clientid = id;
    self.ws = ws;
    self.rtndata = [];
    self.loggedin = false;
    self.appxserverversion = null;
    self.init_optimization_flag = null;
    self.override = false;
    self.current_show = null;
    self.widgetCount = 0;
    self.widgets = [];
    self.items = [];
    self.rowHeightPx = 21;
    self.colWidthPx = 8;
    self.screenrows = 31;
    self.screencols = 128;
    self.fileToMongo = [];
    self.fileIdMongo;
    /*START LARGE TABLE DATA VARIABLES*/
    self.currentData = "";
    self.leftoverData = "";
    self.byteCount = 0;
    self.columnData = {};
    self.selectedKeys = [];
    self.selectedRows = [];
    self.beginTableData = true;
    self.maxByteSize = 1048576;
    /*END LARGE TABLE DATA VARIABLES*/
    self.fileData = [];
    self.msgCount = 0;
    self.needbytes = 4;
    self.curhandler = -1;
    self.curhandlerstep = 0;
    self.chunksReceived = 0;
    self.serverFeatureMask = 0;
    self.serverExtendedFeatureMask = 0;
    self._APPX64 = false;
    self.curresourceIn = null;
    self.curresourcelistOut = {};
    self.curresourcelistIn = {};
    self.curresourcecountIn = 0;
    self.curresourcecountOut = 0;
    self.cursetfield = null;
    self.cursetfieldcount = 0;
    self.curtokencount = 0;
    self.menu = null;
    self.cursetclip = null;
    self.current_msg = {
        "header": []
    };

    this.mongoconnector = {};
    // Ends a web client's server loop
    this.end = function APPXProcessor_end() {
        this.mongoconnector.clearCollections(this.cacheCollection);
    };

    // APPX message handlers to send JSON packets to client rather than RAW socket data
    // Server Message Handler Functions
    // Processes server messages
    this.appxprocessmsg = function APPXProcessor_appxprocessmsg() {
		var done = false;
		while ((!done) && ((this.rtndata.length > 0 && (this.rtndata.length >= this.needbytes || this.rtndata.length > this.maxByteSize || this.rtndata.length + this.byteCount >= this.needbytes)) || (this.needbytes == 0 && this.curhandler > 0))) {
            if (rotLog) {
                dlog("Server message: " + this.curhandler);
            }
            switch (this.curhandler) {
                case -1:
                    { // Login needs to be done
                        this.appxloginhandler();
                        break;
                    }
                case 0:
                    { // Message Block
                        this.appxheaderhandler();
                        break;
                    }
                case 6:
                    { // Message Block
                        this.appxreconnecthandler();
                        break;
                    }
                case 10:
                    { // INIT
                        this.appxinithandler();
                        break;
                    }
                case 12:
                    { // SHOW
                        this.appxshowhandler();
                        break;
                    }
                case 14:
                    { // FINISHED
                        this.appxfinishhandler();
                        break;
                    }
                case 17:
                    { // ATTACH
                        this.appxattachhandler();
                        break;
                    }
                case 19:
                    { // KEYMAP
                        this.appxkeymaphandler();
                        break;
                    }
                case 21:
                    { // UPDATE SCREEN
                        this.appxscreenhandler();
                        break;
                    }
                case 22:
                    { // UPDATE ATTRIBUTE
                        this.appxattributeshandler();
                        break;
                    }
                case 25:
                    { // PING
                        this.appxpinghandler();
                        break;
                    }
                case 26:
                    { // LOAD URL
                        this.appxloadurlhandler();
                        break;
                    }
                case 27:
                    { // UPDATE EXTENDEDATTRIBUTE
                        this.appxextraattributeshandler();
                        break;
                    }
                case 64:
                    { // CREATE OBJECT
                        this.appxobjectcreatehandler();
                        break;
                    }
                case 65:
                    { // INVOKE METHOD
                        this.appxobjectinvokehandler();
                        break;
                    }
                case 66:
                    { // DESTROY OBJECT
                        this.appxobjectdestroyhandler();
                        break;
                    }
                case 68:
                    { // FEATURE EXCHANGE
                        this.appxfeatureshandler();
                        break;
                    }
                case 69:
                    { // SERVER PROCESS ID
                        this.appxpidhandler();
                        break;
                    }
                case 71:
                    { // SEND FILE
                        this.appxsendfilehandler();
                        break;
                    }
                case 72: //TAddField.type (TMNET_MSG_TYPE_ADD_FIELD)
                    { // ITEMS
                        this.appxitemshandler();
                        break;
                    }
                case 73: //TAddField.type
                    { // ITEMS
                        this.appxreceivefilehandler();
                        break;
                    }
                case 75:
                    { // WIDGETS
                        this.appxwidgetshandler();
                        //this.appxwidgetshandler();
                        break;
                    }
                case 79:
                    { // TOKEN
                        this.appxtokenhandler();
                        break;
                    }
                case 81:
                    { // MENUS
                        this.appxmenuhandler();
                        break;
                    }
                case 83:
                    { // RESOURCE
                        this.appxresourcehandler();
                        break;
                    }
                case 85:
                    { // SETFIELD
                        this.appxsetfieldhandler();
                        break;
                    }
                case 87:
                    { // SET CLIPBOARD
                        this.appxsetclipboardhandler();
                        break;
                    }
                case 88:
                    { // GET CLIPBOARD
                        this.appxgetclipboardhandler();
                        break;
                    }
                case 89:
                    { // CONSTANTS EXCHANGE
                        this.appxconstantshandler();
                        break;
                    }
                case 91:
                    { // GET MESSAGES
                        this.appxgetmessageshandler();
                        break;
                    }
                case 93:
                    { // PROC STACK
                        this.appxprocstackhandler();
                        break;
                    }
                case 94:
                    { // EXTENDED FEATURE EXCHANGE
                        this.appxextendedfeatureshandler();
                        break;
                    }
                default:
                    { // WE'RE DONE, EXIT LOOP 
						done = true;
                        break;
                    }
            }
        }
        logactivity("appxprocessmsg exiting, needbytes=" + this.needbytes + "gotbytes=" + this.rtndata.length);
    };

    var T_BOOLEAN = 1; // 1 byte
    var T_BYTE = 2; //1 byte
    var T_CHAR = 3; //1 byte
    var T_DOUBLE = 4; //8 bytes
    var T_FLOAT = 5; //4 bytes
    var T_INT = 6; //4 bytes
    var T_LONG = 7; //4 bytes
    var T_SHORT = 8; //2 bytes
    var T_UNSIGNED_BYTE = 9; //1 byte
    var T_UNSIGNED_SHORT = 10; //2 bytes
    var T_STRING = 11;
    var T_DATE = 12;

    this.dataType = null;
    this.data = function APPXProcessor_data() {
        var ret = this.rtndata.slice(0, this.needbytes);
        if (this.dataType && ret.length > 0) {
            var dv = new DataView(new Uint8Array(ret).buffer);
            switch (this.dataType) {
                case T_BYTE:
                    ret = dv.getInt8(0);
                    break;
                case T_UNSIGNED_BYTE:
                case T_BOOLEAN:
                case T_CHAR:
                    ret = dv.getUint8(0);
                    break;
                case T_SHORT:
                    ret = dv.getInt16(0);
                    break;
                case T_UNSIGNED_SHORT:
                    ret = dv.getUint16(0);
                    break;
                case T_INT:
                    ret = dv.getInt32(0);
                    break;
                case T_FLOAT:
                    ret = dv.getFloat32(0);
                    break;
                case T_DOUBLE:
                case T_LONG:
                    ret = dv.getFloat64(0);
                    break;
                default:
                    ret = ab2str(ret).trim();
            }
            this.dataType = null;
        }
        this.rtndata = this.rtndata.slice(this.needbytes);
        return ret;
    };
    this.done = function APPXProcessor_done() {
        this.curhandler = 0;
        this.curhandlerstep = 0;
        this.needbytes = 8;
    };

    this.read = function APPXProcessor_read(len, type) {
        this.dataType = (type ? type : T_STRING);
        this.curhandlerstep++;
        this.needbytes = len;
    };
    this.readByte = function APPXProcessor_readByte() {
        this.read(1, T_BYTE);
    };
    this.readShort = function APPXProcessor_readShort() {
        this.read(2, T_SHORT);
    };
    this.readInt = function APPXProcessor_readInt() {
        this.read(4, T_INT);
    };
    this.send = function APPXProcessor_send(type, data) {
        try {
            var ms = new Message();
            ms.type = type;
            if (data) {
                ms.data = data;
                ms.datatype = "object";
                ms.hasdata = true;
            }
            ms.haserrors = false;
            ms.errormsg = "";
            sendMessage(ws, ms);
            this.done();
        } catch (ex) {
            dlog(ex);
            dlog(ex.stack);
        }
    };

    this.step = function APPXProcessor_step() {
        return this.curhandlerstep;
    };
    this.stepTo = function APPXProcessor_stepTo(step) {
        this.curhandlerstep = step;
        this.needbytes = 0;
    };

    this.hdr = null;
    this.arg = null;
    this.appxobjecthandler = function APPXProcessor_appxobjecthandler(type) {
        switch (this.step()) {
            case 0:
                this.hdr = {};
                this.hdr.argBlocks = [];
                this.readShort();
                break;
            case 1:
                this.hdr.protoLen = this.data();
                this.readByte();
                break;
            case 2:
                this.hdr.argCount = this.data();
                this.readByte();
                break;
            case 3:
                this.hdr.handle = this.data();
                this.read(this.hdr.protoLen);
                break;
            case 4:
                this.hdr.proto = this.data();
                if (this.hdr.argCount == 0) this.stepTo(9);
                else this.read(0);
                break;
            case 5:
                this.arg = {};
                this.readInt();
                break;
            case 6:
                //tmnetsrv actually only supports ELEM_ALP_CONTIG (string) atm
                this.arg.dataType = this.data();
                this.readInt();
                break;
            case 7:
                this.arg.dataLength = this.data();
                this.read(this.arg.dataLength, this.arg.dataType);
                break;
            case 8:
                this.arg.dataObject = this.data();
                this.hdr.argBlocks.push(this.arg);
                if (--this.hdr.argCount > 0) this.stepTo(5);
                else this.read(0); //stepTo(9)
                break;
            case 9:
                this.send("APPX" + type + "OBJECT", this.hdr);
                break;
        }
    };
    this.appxobjectcreatehandler = function APPXProcessor_appxobjectcreatehandler() {
        this.appxobjecthandler("CREATE");
    }; //64
    this.appxobjectinvokehandler = function APPXProcessor_appxobjectinvokehandler() {
        this.appxobjecthandler("INVOKE");
    }; //65
    this.appxobjectdestroyhandler = function APPXProcessor_appxobjectdestroyhandler() {
        this.appxobjecthandler("DESTROY");
    }; //66

    // Login Handler
    this.appxloginhandler = function APPXProcessor_appxloginhandler() {
        logactivity("***** SOCKET_LOGIN *****");

        switch (this.curhandlerstep) {
            case 0:
                var loginresponse = this.rtndata.slice(0, 2);
                this.rtndata = this.rtndata.slice(2, this.rtndata.length);

                if (loginresponse[1] == 1) {

                    logactivity("logged in...");
                    this.loggedin = true;
                    this.appxserverversion = this.rtndata.slice(0, 2);
                    this.rtndata = this.rtndata.slice(2, this.rtndata.length);

                    var ms = new Message();
                    ms.type = "APPXLOGIN";
                    ms.data = "The user logged in successfully!";
                    ms.datatype = "string";
                    ms.hasdata = true;
                    ms.transresult = "SUCCESS";
                    ms.haserrors = false;
                    ms.errormsg = "";          
                    if(appxLocalConnectorCert != null){
                        ms.ca = fs.readFileSync(appxLocalConnectorCert); //local connector certificate authority
                    }
                    sendMessage(ws, ms);

                    this.curhandler = 0;
                    this.curhandlerstep = 0;
                    this.needbytes = 8;
                }
                else {
                    this.curhandlerstep = 1;
                    this.needbytes = 4;
                }

                break;
            case 1:

                this.needbytes = new DataView(new Uint8Array(this.rtndata.slice(0, 4)).buffer).getInt32(0);
                this.rtndata = this.rtndata.slice(4, this.rtndata.length);
                this.curhandlerstep = 2;

                break;
            case 2:

                var msg = this.rtndata.slice(0, this.needbytes);
                this.rtndata = this.rtndata.slice(this.needbytes, this.rtndata.length);
                var ms = new Message();
                ms.type = "APPXLOGIN";
                ms.data = ab2str(msg);
                ms.datatype = "string";
                ms.hasdata = true;
                ms.transresult = "FAIL";
                ms.haserrors = true;
                ms.errormsg = "Login failed";
                sendMessage(ws, ms);

                this.curhandler = 0;
                this.curhandlerstep = 0;
                this.needbytes = 8;

                break;
            default:
                break;
        }

    };

    // Reconnect Handler
    this.appxreconnecthandler = function APPXProcessor_appxreconnecthandler() {
        logactivity("***** SOCKET_RECONNECT *****");
        switch (this.curhandlerstep) {
            case 0:
                var bytes = this.rtndata.slice(0, 4);
                this.rtndata = this.rtndata.slice(4, this.rtndata.length);
                this.recondatalength = new DataView(new Uint8Array(bytes).buffer).getUint32(0);
                this.curhandlerstep = 1;
                this.needbytes = this.recondatalength;
                break;
            case 1:
                var bytes = this.rtndata.slice(0, this.needbytes);
                this.rtndata = this.rtndata.slice(this.needbytes, this.rtndata.length);

                //send the row cols to the client
                var ms = new Message();
                ms.data = bytes;
                ms.hasdata = "yes";
                ms.haserrors = "no";
                ms.type = "APPXRECONNECT";
                sendMessage(ws, ms);

                this.curhandler = 0;
                this.curhandlerstep = 0;
                this.needbytes = 8;
                break;
        }

    };

    this.appxfinishhandler = function APPXProcessor_appxfinishhandler() {

        this.loggedin = false;
        this.curhandler = -1;
        this.curhandlerstep = 0;
        this.needbytes = 0;
        this.rtndata = this.rtndata.slice();
        var ms = new Message();
        ms.type = "APPXFINISH";
        sendMessage(ws, ms);

    };

    // Header Handler
    this.appxheaderhandler = function APPXProcessor_appxheaderhandler() {
        logactivity("***** SOCKET_HEADER *****");

        self.current_msg.header = this.rtndata.slice(0, 8);
        this.rtndata = this.rtndata.slice(8, this.rtndata.length);
        var constants_bytes = self.current_msg.header.slice(0, 4);
        var constants_length = new DataView(new Uint8Array(constants_bytes).buffer).getUint32(0);

        self.needbytes = constants_length;
        self.curhandler = self.current_msg.header[4];
        self.curhandlerstep = 0;

        logactivity("header processed, length=" + self.needbytes + ", command=" + self.curhandler);
    };

    // Init Handler
    this.appxinithandler = function APPXProcessor_appxinithandler(data) {
        logactivity("***** SOCKET_INIT *****, current step=" + this.curhandlerstep);
        switch (this.curhandlerstep) {
            case 0:
                this.needbytes = 1;
                this.curhandlerstep = 1;
                break;
            case 1:
                this.init_optimization_flag = this.rtndata.slice(0, 1);
                this.rtndata = this.rtndata.slice(1, this.rtndata.length);

                var ms = new Message();
                ms.data = data;
                ms.hasdata = "yes";
                ms.haserrors = "no";
                ms.type = "APPXINIT";
                sendMessage(ws, ms);

                this.curhandler = 0;
                this.needbytes = 8;
                this.curhandlerstep = 0;
                break;
        }
    };

    // Features Handler
    this.appxfeatureshandler = function APPXProcessor_appxfeatureshandler(data) {
        logactivity("***** SOCKET_FEATURE_EXCHANGE *****");
        var bytes = this.rtndata.slice(0, 4);
        this.rtndata = this.rtndata.slice(4, this.rtndata.length);

        this.serverFeatureMask = new DataView(new Uint8Array(bytes).buffer).getUint32(0);
        var ms = new Message();
        ms.data = this.serverFeatureMask;
        ms.hasdata = "yes";
        ms.haserrors = "no";
        ms.type = "APPXFEATURES";

        sendMessage(ws, ms);

        logactivity("server feature mask=" + this.serverFeatureMask);

        this.curhandler = 0;
        this.needbytes = 8;
        this.curhandlerstep = 0;
    };

    // Extended Features Handler //94
    this.appxextendedfeatureshandler = function APPXProcessor_appxextendedfeatureshandler(data) {
        logactivity("***** SOCKET_EXTENDED_FEATURE_EXCHANGE *****");
        var bytes = this.rtndata.slice(0, 4);
        this.rtndata = this.rtndata.slice(4, this.rtndata.length);

        this.serverExtendedFeatureMask = new DataView(new Uint8Array(bytes).buffer).getUint32(0);
        if((this.serverExtendedFeatureMask & TMNET_FEATURE2_APPX64_BIT) ==  TMNET_FEATURE2_APPX64_BIT){
            this._APPX64 = true;
            logactivity("Appx Engine is 64-bit");
        }
        var ms = new Message();
        ms.data = this.serverExtendedFeatureMask;
        ms.hasdata = "yes";
        ms.haserrors = "no";
        ms.type = "APPXEXTENDEDFEATURES";
        sendMessage(ws, ms);

        logactivity("server extended feature mask=" + this.serverExtendedFeatureMask);

        this.curhandler = 0;
        this.needbytes = 8;
        this.curhandlerstep = 0;
    };

    // Attach Handler
    this.appxattachhandler = function APPXProcessor_appxattachhandler(data) {
        logactivity("***** SOCKET_ATTACH *****");
        var ms = new Message();
        ms.data = data;
        ms.hasdata = "yes";
        ms.haserrors = "no";
        ms.type = "APPXATTACH";
        sendMessage(ws, ms);

        this.curhandler = 0;
        this.needbytes = 8;
        this.curhandlerstep = 0;
    };

    // KeyMap Handler
    this.appxkeymaphandler = function APPXProcessor_appxkeymaphandler(data) {
        logactivity("***** SOCKET_KEYMAP *****, step=" + this.curhandlerstep);

        switch (this.curhandlerstep) {
            case 0:
                this.needbytes = 10;
                this.curhandlerstep = 1;
                break;
            case 1:
                this.mykeymapkey = this.rtndata.slice(0, 10);
                this.rtndata = this.rtndata.slice(10, this.rtndata.length);
                this.needbytes = 2;
                this.curhandlerstep = 2;
                break;
            case 2:
                this.needbytes = new DataView(new Uint8Array(this.rtndata.slice(0, 2)).buffer).getUint16(0);
                this.rtndata = this.rtndata.slice(2, this.rtndata.length);
                this.curhandlerstep = 3;
                break;
            case 3:
                if (this.needbytes > 0) {
                    self.mykeymapdata = rtndata.slice(0, this.needbytes);
                    this.rtndata = this.rtndata.slice(this.needbytes, this.rtndata.length);
                }
                var ms = new Message();
                ms.data = data;
                ms.hasdata = "yes";
                ms.haserrors = "no";
                ms.type = "APPXKEYMAP";
                sendMessage(ws, ms);

                this.curhandler = 0;
                this.needbytes = 8;
                this.curhandlerstep = 0;
                break;
        }
    };

    // PID Handler
    this.appxpidhandler = function APPXProcessor_appxpidhandler() {
        logactivity("***** SOCKET_SERVER_PID *****, step=" + this.curhandlerstep);

        switch (this.curhandlerstep) {
            case 0:
                this.needbytes = new DataView(new Uint8Array(this.rtndata.slice(0, 2)).buffer).getUint16(0);
                this.rtndata = this.rtndata.slice(2, this.rtndata.length);

                this.curhandlerstep = 1;
                break;
            case 1:
                var mypid = 0;
                var mypidbytes = [];

                mypidbytes = this.rtndata.slice(0, this.needbytes);
                this.rtndata = this.rtndata.slice(this.needbytes, this.rtndata.length);

                mypid = mypidbytes;

                logactivity("my process id=" + mypid);

                self.pid = ab2str(mypid);
                self.cacheCollection = self.uid + "_" + self.pid;

                var ms = new Message();
                ms.data = mypid;
                ms.datatype = "object";
                ms.hasdata = "yes";
                ms.haserrors = "no";
                ms.type = "APPXPID";
                sendMessage(ws, ms);

                this.curhandler = 0;
                this.needbytes = 8;
                this.curhandlerstep = 0;
                break;
        }
    };

    // SEND FILE Handler (Client Receive)
    this.appxsendfilehandler = function APPXProcessor_appxsendfilehandler() {
        logactivity("got a file message...");
        switch (this.curhandlerstep) {
            case 0: // set up to read an item block from the server
                this.currfile = new FileStructure();
                this.needbytes = 4;
                this.curhandlerstep = 1;
                break;
            case 1:
                this.currfile.datalength = new DataView(new Uint8Array(this.rtndata.slice(0, 4)).buffer).getUint32(0);
                this.rtndata = this.rtndata.slice(4, this.rtndata.length);
                this.needbytes = 4;
                this.curhandlerstep = 2;
                break;
            case 2:
                this.currfile.filenamelength = new DataView(new Uint8Array(this.rtndata.slice(0, 4)).buffer).getUint32(0);
                this.rtndata = this.rtndata.slice(4, this.rtndata.length);
                this.needbytes = this.currfile.filenamelength;
                this.curhandlerstep = 3;
                break;
            case 3:
                this.currfile.filename = ab2str(this.rtndata.slice(0, this.needbytes));
                this.rtndata = this.rtndata.slice(this.needbytes, this.rtndata.length);

                this.needbytes = 4;
                this.curhandlerstep = 4;
                /*If we want to open file in the browser or use the browser to save
                **a file to the client then we create a gridfsbucket and mimic client 
                **response to the server so it will send file data*/
                if (this.currfile.filename.indexOf("$(pushAndOpen") > -1 ||
                    this.currfile.filename.indexOf("$(pushAndSave") > -1) {
                    /*Send response to server requesting rest of file*/
                    this.clientsocket.write(Buffer.from([3, 1]));
                    this.createMongoUploadStream = (callback) => {
                        /*Create a readable stream to pass the chunks into, for piping to mongo*/
                        this.rStream = new Readable({ read(size) { } });

                        /*If we want to open file in the browser or use the browser to
                        **save a file to the client, after we have received
                        **the full file, we close the gridfsbucket, send message to client
                        **to load URL, and mimic clients response to server so APPX
                        **will continue to run*/
                        this.currfile.filename = this.currfile.filename.replace(")", Date.now() + ")");
                        var fileName = decodeURI(this.currfile.filename.replace("$(", "").replace(")", ""));
                        fileName = encodeURI(fileName);
                        var self = this;
                        var gb = new GridFSBucket(mongoCacheDb, { bucketName: this.cacheCollection });
                        this.uploadStream = gb.openUploadStream(fileName);

                        this.uploadStream.options.metadata = {
                            'url': "/getFile/" + fileName,
                            'id': this.uploadStream.id
                        }

                        this.uploadStream.once("finish", function uploadStream_onceFinish() {
                            if (this.chunkSizeBytes > 0) {
                                var ms = new Message();
                                ms.data = self.cacheCollection + "/" + self.currfile.filename;
                                ms.datatype = "URL";
                                ms.hasdata = "yes";
                                ms.haserrors = "no";
                                ms.type = "APPXLOADURL";
                                sendMessage(ws, ms);

                                /*Send response to server indicating file receipt*/
                                var nameAB = Buffer.from(self.currfile.filename);
                                self.clientsocket.write(Buffer.from(hton32(nameAB.length)));
                                self.clientsocket.write(Buffer.from(nameAB));
                                self.clientsocket.write(Buffer.from([3, 1]));
                            } else {
                                var nameAB = Buffer.from(self.currfile.filename);
                                self.clientsocket.write(Buffer.from(hton32(nameAB.length)));
                                self.clientsocket.write(Buffer.from(nameAB));
                                self.clientsocket.write(Buffer.from([0, 0]));
                            }
                        });

                        /*Open pipe for streaming*/
                        this.rStream.pipe(this.uploadStream);
                        if (callback) {
                            callback();
                        }
                    };
                } else {
                    //send the file name on to the client so it can send a status
                    //structure whether or not to send the rest of the file.
                    logactivity("sending filename to client:" + this.currfile.filename);

                    var ms = new Message();
                    ms.data = this.currfile;
                    ms.datatype = "object";
                    ms.hasdata = "yes";
                    ms.haserrors = "no";
                    ms.messagepart = 3; // 3 = filename
                    ms.type = "APPXSENDFILE";
                    sendMessage(ws, ms);
                }
                break;
            case 4:
                this.currfile.currdatachunklength = new DataView(new Uint8Array(this.rtndata.slice(0, 4)).buffer).getUint32(0);
                this.rtndata = this.rtndata.slice(4, this.rtndata.length);
                if (this.currfile.currdatachunklength > 0) {
                    this.needbytes = this.currfile.currdatachunklength;
                    this.curhandlerstep = 5;
                }
                else {
                    if (this.currfile.filename.indexOf("$(pushAndOpen") > -1 ||
                        this.currfile.filename.indexOf("$(pushAndSave") > -1) {
                        /*Tell stream we are finished*/
                        if (this.rStream) {
                            this.rStream.push(null);
                        } else { /*Received 0 byte file.*/
                            this.createMongoUploadStream(() => {
                                /*Push each chunk into the pipe as it is received*/
                                this.rStream.push(null);
                            });
                        }
                    } else {
                        /*If we actually received a file then we send end of file
                        **to client. Else we don't need to send anything.*/
                        if (this.chunksReceived > 0) {
                            // send file EOF
                            var ms = new Message();
                            ms.data = this.currfile.currdatachunklength;
                            ms.datatype = "EOF";
                            ms.hasdata = "yes";
                            ms.msgCount = ++this.msgCount;
                            ms.haserrors = "no";
                            ms.messagepart = -1;
                            ms.type = "APPXSENDFILE";
                            sendMessage(ws, ms);
                        } 
                    }
                    //exit this handler, reset to header handler
                    this.curhandler = 0;
                    this.needbytes = 8;
                    this.curhandlerstep = 0;
                    this.chunksReceived = 0;
                    this.fileToMongo = [];
                    this.rStream = null;
                }
                break;

            case 5:
                this.currfile.currdatachunk = this.rtndata.slice(0, this.needbytes);
                this.rtndata = this.rtndata.slice(this.needbytes, this.rtndata.length);
                if (this.currfile.filename.indexOf("$(pushAndOpen") > -1 ||
                    this.currfile.filename.indexOf("$(pushAndSave") > -1) {
                    if (this.chunksReceived === 0) {
                        this.createMongoUploadStream(() => {
                            /*Push each chunk into the pipe as it is received*/
                            this.rStream.push(Buffer.from(this.currfile.currdatachunk));
                        });
                    } else {

                        /*Push each chunk into the pipe as it is received*/
                        this.rStream.push(Buffer.from(this.currfile.currdatachunk));
                    }
                } else {
                    this.fileData = Buffer.from(this.currfile.currdatachunk).toString('base64');

                    // send file data chunk
                    var ms = new Message();
                    ms.data = this.fileData;
                    ms.datatype = "array";
                    ms.hasdata = "yes";
                    ms.msgCount = ++this.msgCount;
                    ms.haserrors = "no";
                    ms.messagepart = 5; // 5 = data chunk
                    ms.type = "APPXSENDFILE";
                    sendMessage(ws, ms);
                }
                                

                /*Keep track of file chunks so that we know whether or not the engine
                **actually sent file*/
                this.chunksReceived++;

                // always go back to step 4 which handles EOF block
                this.needbytes = 4;
                this.curhandlerstep = 4;

                break;
        }
    };

    // LOAD URL Handler
    this.appxloadurlhandler = function APPXProcessor_appxloadurlhandler() {
        logactivity("***** SOCKET_LOAD_URL *****, step=" + this.curhandlerstep);
        switch (this.curhandlerstep) {
            case 0: // set up to read an item block from the server
                this.needbytes = 2;
                this.curhandlerstep = 1;
                break;
            case 1:
                this.needbytes = new DataView(new Uint8Array(this.rtndata.slice(0, 2)).buffer).getUint16(0);
                this.rtndata = this.rtndata.slice(2, this.rtndata.length);

                this.curhandlerstep = 2;
                break;
            case 2:
                var myurlbytes = [];

                myurlbytes = this.rtndata.slice(0, this.needbytes);
                this.rtndata = this.rtndata.slice(this.needbytes, this.rtndata.length);

                logactivity("my url=" + ab2str(myurlbytes));

                var ms = new Message();
                ms.data = ab2str(myurlbytes).trim();
                ms.datatype = "object";
                ms.hasdata = "yes";
                ms.haserrors = "no";
                ms.type = "APPXLOADURL";
                sendMessage(ws, ms);

                this.curhandler = 0;
                this.needbytes = 8;
                this.curhandlerstep = 0;
                break;
        }
    };

    // MENUS Handler
    this.appxmenuhandler = function APPXProcessor_appxmenuhandler() {

        logactivity("***** SOCKET_RESOURCE *****, step=" + this.curhandlerstep);

        var done = false;
        var menuItemDone = false;

        var nb = this.needbytes;
        switch (this.curhandlerstep) {

            case 0: // set up to read an menu headeer block from the server
                this.menu = new Menu();
                this.curhandlerstep++;
                this.needbytes = 6;
                break;

            case 1:
                this.menu.headerstructure = this.rtndata.slice(0, 6);
                //one byte can use rthdata.shift, but it might get confusing
                this.menu.type = this.menu.headerstructure.slice(0, 1);
                this.menu.itemcount = new DataView(new Uint8Array(this.menu.headerstructure.slice(2, 4)).buffer).getUint16(0);
                this.menu.headerdatalength = new DataView(new Uint8Array(this.menu.headerstructure.slice(4, 6)).buffer).getUint16(0);

                if (this.menu.headerdatalength > 0) {
                    this.curhandlerstep++;
                    this.needbytes = this.menu.headerdatalength;
                }
                else { // if menu datalength is 0 skip a step
                    this.curhandlerstep += 2;
                    this.needbytes = 0;
                }
                break;

            case 2: //fetch header
                this.menu.headerdata = ab2str(this.rtndata.slice(0, this.needbytes));
                this.curhandlerstep++;
                this.needbytes = 0;
                break;

            case 3: //are there any menu items?
                if (this.menu.itemcount > 0) {
                    this.curhandlerstep++;
                    this.needbytes = 4; //menu struct = 4 bytes
                }
                else {
                    done = true;
                    menuItemDone = true;
                }
                break;

            case 4: //get next menu item (MMnu)
                this.curmenuitem = new MenuItem();
                this.curmenuitem.structure = this.rtndata.slice(0, 4);
                this.curhandlerstep++;
                this.needbytes = new DataView(new Uint8Array(this.curmenuitem.structure.slice(2, 4)).buffer).getUint16(0);
                break;

            case 5: //process menu item
                this.curmenuitem.data = ab2str(this.rtndata.slice(0, this.needbytes));
                this.curhandlerstep++;
                this.needbytes = 4;
                break;

            case 6: // trim off and process extra data length
                this.needbytes = new DataView(new Uint8Array(this.rtndata.slice(0, 4)).buffer).getInt32(0);
                if (this.needbytes > 0) {
                    this.curhandlerstep++;
                }
                else {
                    if (this.needbytes < 0) {
                        this.curmenuitem.extrareuse = true;
                    }
                    menuItemDone = true;
                }
                break;
            case 7: // trim off and process extra data
                this.curmenuitem.extradata = this.rtndata.slice(0, this.needbytes);
                menuItemDone = true;
                break;
        }
        var hexdata = this.rtndata.slice(0, nb);
        logHexDump("ITEMDATA", hexdata, "item data");
        if (this.curhandlerstep > 1) this.rtndata = this.rtndata.slice(nb);

        if (menuItemDone) {
            this.menu.items.push(this.curmenuitem);
            if (this.menu.items.length < this.menu.itemcount) {
                this.curhandlerstep = 4;
                this.needbytes = 4;
            }
            else {
                var ms = new Message();
                ms.data = this.menu;
                ms.datatype = "array";
                ms.datacount = this.menu.items.length;
                ms.hasdata = "yes";
                ms.haserrors = "no";
                ms.type = "APPXMENU";
                sendMessage(ws, ms);
                done = true;
            }
        }

        if (done) {
            // setup to read next message header
            this.curhandler = 0;
            this.needbytes = 8;
            this.curhandlerstep = 0;
            logHexDump("MENUDATA", "curmenu", "Resource Data Received...");
        }
    };

    // TOKEN Handler
    this.appxtokenhandler = function APPXProcessor_appxtokenhandler() {
        logactivity("***** SOCKET_TOKEN *****, step=" + this.curhandlerstep);
        var done = false;
        switch (this.curhandlerstep) {
            case 0:
                this.curtokencount--;
                var rawdata = this.rtndata.slice(0, 12);
                this.rtndata = this.rtndata.slice(12, this.rtndata.length);

                logHexDump("resHeader", rawdata, "Resource header...");
                this.curtoken.grp = rawdata.slice(0, 4);
                this.curtoken.start = rawdata.slice(4, 8);
                this.curtoken.max = rawdata.slice(8, 12);
                this.curtoken.items = [];

                this.needbytes = 8;
                this.curhandlerstep = 1;

                break;

            case 1:
                this.curtoken.totalsize = new DataView(new Uint8Array(this.rtndata.slice(0, 4)).buffer).getUint8(0);
                this.curtoken.len = new DataView(new Uint8Array(this.rtndata.slice(4, 8)).buffer).getUint32(0);
                this.rtndata = this.rtndata.slice(8, this.rtndata.length);

                if (this.curtoken.len > 0) {
                    this.needbytes = 8;
                    this.curhandlerstep = 2;
                }
                else {
                    done = true;
                }

                break;
            case 2:
                this.curtoken.data = [];

                this.curtoken.data = this.rtndata.slice(0, this.needbytes);
                this.rtndata = this.rtndata.slice(this.needbytes, this.rtndata.length);

                var ti = new TokenItem();
                ti.token_id = new DataView(new Uint8Array(this.curtoken.data.slice(0, 4)).buffer).getUint32(0);
                ti.token_id_group = new DataView(new Uint8Array(this.curtoken.data.slice(4, 6)).buffer).getUint16(0);
                ti.token_id_val_len = new DataView(new Uint8Array(this.curtoken.data.slice(6, 8)).buffer).getUint16(0);
                if (ti.token_id_val_len != 0) {
                    this.needbytes = ti.token_id_val_len;
                    this.curhandlerstep = 3;
                }
                else {
                    if (this.curtoken.items.length = this.curtoken.len) {
                        done = true;
                    }
                    else {
                        this.needbytes = 8;
                        this.curhandlerstep = 2;
                    }
                }
                this.curtoken.items.push(ti);
                break;
            case 3:
                var ti = this.curtoken.items[this.curtoken.items.length - 1];

                ti.data = this.rtndata.slice(0, this.needbytes);
                this.rtndata = this.rtndata.slice(this.needbytes, this.rtndata.length);

                if (this.curtoken.items.length == this.curtoken.len) {
                    done = true;
                }
                else {
                    this.needbytes = 8;
                    this.curhandlerstep = 2;
                }
                break;
        }

        if (done) {
            logHexDump("TOKENDATA", this.curtoken.data, "Resource Data Received...");
            var ms = new Message();
            ms.data = this.curtoken;
            ms.datatype = "object";
            ms.hasdata = "yes";
            ms.haserrors = "no";
            ms.type = "APPXTOKEN";
            sendMessage(ws, ms);

            logactivity("curtokencount=" + this.curtokencount);
            this.curhandler = 0;
            this.needbytes = 8;
            this.curhandlerstep = 0;
        }
    };

    // RESOURCE Handler
    this.appxresourcehandler = function APPXProcessor_appxresourcehandler() {
        logactivity("***** SOCKET_RESOURCE *****, step=" + this.curhandlerstep);

        var done = false;

        switch (this.curhandlerstep) {
            case 0:
                this.needbytes = 20;
                this.curhandlerstep = 1;
                break;
            case 1:
                this.curresourcecountIn--;
                var rawdata = this.rtndata.slice(0, 20);
                this.rtndata = this.rtndata.slice(20, this.rtndata.length);
                logHexDump("resHeader", rawdata, "Resource header...");
                if (this.curresourceIn == null)
                    this.curresourceIn = new ResourceStructure();
                this.curresourceIn.ap = rawdata.slice(0, 3);
                this.curresourceIn.ver = rawdata.slice(3, 5);
                this.curresourceIn.cacheid = rawdata.slice(5, 13);
                this.curresourceIn.state = new DataView(new Uint8Array(rawdata.slice(13, 14)).buffer).getUint8(0);
                this.curresourceIn.stateHex = new DataView(new Uint8Array(rawdata.slice(13, 14)).buffer).getUint8(0).toString(16).toUpperCase();
                this.curresourceIn.ext = new DataView(new Uint8Array(rawdata.slice(15, 16)).buffer).getUint8(0);
                this.curresourceIn.loctype = new DataView(new Uint8Array(rawdata.slice(14, 15)).buffer).getUint8(0);
                this.curresourceIn.len = new DataView(new Uint8Array(rawdata.slice(16, 20)).buffer).getUint32(0);
                this.curresourceIn.data = [];

                if (rotLog) {
                    dlog("Resource In Object: ", this.curresourceIn);
                }

                if (this.curresourceIn.len > 0) {
                    this.needbytes = this.curresourceIn.len;
                    this.curhandlerstep = 2;
                }
                else {
                    done = true;
                }
                break;
            case 2:
                try {
                    var fileLength = (this.needbytes - this.byteCount);
                    this.curresourceIn.data = [];
                    this.curresourceIn.data = this.rtndata.slice(0, fileLength);
                    this.rtndata = this.rtndata.slice(fileLength, this.rtndata.length);

                    if (this.curresourceIn.loctype !== 1) {
                        var dTemp;
                        if (this.curresourceIn.state == 10) {
                            dTemp = ab2str(this.curresourceIn.data);
                            /*Need length before we pull out spaces, otherwise will not match
                            **resource length and will never continue*/
                            var ckLength = dTemp.length;
                            dTemp = modifyCkeditor(dTemp);
                        } else {
                            dTemp = this.curresourceIn.data;
                        }
                        if (dTemp.length === 0) {
                            dTemp[0] = 0;
                        }
                        /*
                        **Resources can be large images, so we treat a resource like a file download
                        **splitting it up into managable chunks and streaming it into mongo
                        */
                        if (this.byteCount === 0) {
                            this.rStream = new Readable({ read(size) { } });
                            var cacheid = ab2str(this.curresourceIn.ap) + "." +
                                ab2str(this.curresourceIn.ver) + "." +
                                ab2str(this.curresourceIn.cacheid) + "." +
                                (this.curresourceIn.state < 16 ? "0" : "") +
                                this.curresourceIn.stateHex;
                            var currency = this.curresourcelistOut[cacheid];
                            var cacheid2 = cacheid;
                            if (currency.length > 8) {
                                cacheid2 = cacheid.substring(0, cacheid.length - 11) + "XXXXXXXX" + cacheid.substring(cacheid.length - 3);
                            }
                            var fileName = this.hostCollection + "/" + cacheid2 + "." + currency;
                            if (currency) {
                                delete this.curresourcelistOut[cacheid];
                                this.curresourcecountOut--;
                            }
                            var proc = this;

                            var gb = new GridFSBucket(mongoCacheDb, { bucketName: 'resource' });
                            this.uploadStream = gb.openUploadStream(fileName);

                            this.uploadStream.options.metadata = {
                                'currency': currency,
                                'ap': this.curresourceIn.ap,
                                'ver': this.curresourceIn.ver,
                                'cacheid': this.curresourceIn.cacheid,
                                'state': this.curresourceIn.state,
                                'ext': this.curresourceIn.ext,
                                'loctype': this.curresourceIn.loctype,
                                'url': "/getResource/" + fileName,
                                'id': this.uploadStream.id
                            }

                            this.uploadStream.once("finish", function uploadStream_onceFinish() {
                                var filesQuery = mongoCacheDb.collection("resource.files").find({ filename: fileName });
                                filesQuery.toArray(function (error, docs) {
                                    if (error) {
                                        dlog("Resource handler query.toArray error: " + error);
                                    }
                                    if (docs.length > 0) {
                                        var res = new ResourceStructure();
                                        res.ap = docs[0].metadata.ap;
                                        res.ver = docs[0].metadata.ver;
                                        res.cacheid = docs[0].metadata.cacheid;
                                        res.state = docs[0].metadata.state;
                                        res.ext = docs[0].metadata.ext;
                                        var path = docs[0].metadata.url;
                                        res.loctype = 1;
                                        res.data = str4ab(docs[0].metadata.url);
                                        res.len = res.data.length;
                                        var ms = new Message();
                                        ms.data = res;
                                        ms.datatype = "object";
                                        ms.hasdata = "yes";
                                        ms.haserrors = "no";
                                        ms.type = "APPXRESOURCE";
                                        sendMessage(ws, ms);
                                    }
                                });
                            });
                            this.rStream.pipe(this.uploadStream);
                        }
                        this.rStream.push(Buffer.from(dTemp));
                    }
                    if (ckLength) {
                        this.byteCount += ckLength;
                    } else {
                        this.byteCount += dTemp.length;
                    }
                    if (this.byteCount >= this.curresourceIn.len) {
                        done = true;
                    }
                    break;
                } catch (e) {
                    dlog(e);
                    dlog(e.stack);

                }
        }

        if (done) {
            if (rotLog) {
                dlog("Resource Done:  ", this.curresourceIn);
            }
            logHexDump("RESDATA", this.curresourceIn.data, "Resource Data Received...");
            if (this.curresourceIn.loctype == 1 || this.rStream === undefined) {
                var ms = new Message();
                ms.data = this.curresourceIn;
                ms.datatype = "object";
                ms.hasdata = "yes";
                ms.haserrors = "no";
                ms.type = "APPXRESOURCE";
                sendMessage(ws, ms);
            }
            else {
                this.rStream.push(null);
            }

            logactivity("curresourcecount=" + this.curresourcecountIn);
            this.byteCount = 0;
            this.curhandler = 0;
            this.needbytes = 8;
            this.curhandlerstep = 0;
        }

    };

    // SET CLIPBOARD Handler - 87
    this.appxsetclipboardhandler = function APPXProcessor_appxsetclipboardhandler() {

        logactivity("***** SOCKET_SETCLIPBOARD *****, step=" + this.curhandlerstep);

        var done = false;

        switch (this.curhandlerstep) {
            case 0:

                this.cursetclip = {};

                this.needbytes = 4;
                this.curhandlerstep = 1;

                break;

            case 1:

                //rtndata was empty once, so putting in a check
                var rawdata = this.rtndata.slice(0, 4);
                this.rtndata = this.rtndata.slice(4, this.rtndata.length);

                this.cursetclip.datatype = new DataView(new Uint8Array(rawdata.slice(0, 4)).buffer).getUint32(0);

                this.needbytes = 4;
                this.curhandlerstep = 2;
                break;


            case 2:

                //rtndata was empty once, so putting in a check
                var rawdata = this.rtndata.slice(0, 4);
                this.rtndata = this.rtndata.slice(4, this.rtndata.length);

                this.cursetclip.datalength = new DataView(new Uint8Array(rawdata.slice(0, 4)).buffer).getUint32(0);

                this.needbytes = this.cursetclip.datalength;
                this.curhandlerstep = 3;
                break;

            case 3:


                this.cursetclip.data = ab2str(this.rtndata.slice(0, this.needbytes));
                this.rtndata = this.rtndata.slice(this.needbytes, this.rtndata.length);

                done = true;

                break;
        }

        if (done) {
            logHexDump("SETCLIPBOARDDATA", this.cursetclip.data, "GetClipboard Data Message Received...");

            var ms = new Message();
            ms.data = this.cursetclip;
            ms.datatype = "string";
            ms.hasdata = "yes";
            ms.haserrors = "no";
            ms.type = "APPXSETCLIPBOARD";
            sendMessage(ws, ms);

            this.curhandler = 0;
            this.needbytes = 8;
            this.curhandlerstep = 0;
        }
    };

    // GET CLIPBOARD Handler - 88
    this.appxgetclipboardhandler = function APPXProcessor_appxgetclipboardhandler() {
        logactivity("***** SOCKET_GETCLIPBOARD *****, step=" + this.curhandlerstep);

        var done = false;

        switch (this.curhandlerstep) {
            case 0:

                this.needbytes = 9;
                this.curhandlerstep = 1;

                break;

            case 1:
                var rawdata = this.rtndata.slice(0, 9);
                this.rtndata = this.rtndata.slice(9, this.rtndata.length);

                this.clipboardstruct = {};
                this.clipboardstruct.datatype = new DataView(new Uint8Array(rawdata.slice(0, 4)).buffer).getUint32(0);
                this.clipboardstruct.datalength = new DataView(new Uint8Array(rawdata.slice(4, 8)).buffer).getUint32(0);
                this.clipboardstruct.senddata = rawdata.slice(8, 1);

                done = true;
                break;
        }

        if (done) {
            logHexDump("GETCLIPBOARDDATA", "", "GetClipboard Data Message Received...");

            var ms = new Message();
            ms.data = this.clipboardstruct;
            ms.datatype = "string";
            ms.hasdata = "yes";
            ms.haserrors = "no";
            ms.type = "APPXGETCLIPBOARD";
            sendMessage(ws, ms);

            this.curhandler = 0;
            this.needbytes = 8;
            this.curhandlerstep = 0;
        }
    };

    // CONSTANTS EXCHANGE Handler - 89
    this.appxconstantshandler = function APPXProcessor_appxconstantshandler() {
        logactivity("***** SOCKET_CONSTANTS EXCHANGE *****, step=" + this.curhandlerstep);

        var done = false;

        switch (this.curhandlerstep) {
            case 0: // get the first header
                this.constants = {};
                this.needbytes = 4;
                this.curhandlerstep = 1;
                this.constantcount = 0;
                break;

            case 1: // process header
                var rawdata = this.rtndata.slice(0, 4);
                this.rtndata = this.rtndata.slice(4, this.rtndata.length);
                this.constantcount = new DataView(new Uint8Array(rawdata).buffer).getUint32(0);
                if (this.constantcount == 0) {
                    done = true;
                }
                else {
                    this.needbytes = 4;
                    this.curhandlerstep = 2;
                }
                break;
            case 2: // process keyword length
                var rawdata = this.rtndata.slice(0, 4);
                this.rtndata = this.rtndata.slice(4, this.rtndata.length);
                this.needbytes = new DataView(new Uint8Array(rawdata).buffer).getUint32(0);
                this.curhandlerstep = 3;
                break;
            case 3: // process keyword
                var rawdata = this.rtndata.slice(0, this.needbytes);
                this.rtndata = this.rtndata.slice(this.needbytes, this.rtndata.length);
                this.constantkeyword = ab2str(rawdata);
                this.needbytes = 4;
                this.curhandlerstep = 4;
                break;
            case 4: // process value length
                var rawdata = this.rtndata.slice(0, 4);
                this.rtndata = this.rtndata.slice(4, this.rtndata.length);
                this.needbytes = new DataView(new Uint8Array(rawdata).buffer).getUint32(0);
                this.curhandlerstep = 5;
                break;
            case 5: // process value
                var rawdata = this.rtndata.slice(0, this.needbytes);
                this.rtndata = this.rtndata.slice(this.needbytes, this.rtndata.length);
                this.constantvalue = ab2str(rawdata);
                this.constants[this.constantkeyword] = this.constantvalue;
                this.constantcount--;
                if (this.constantcount > 0) {
                    this.needbytes = 4;
                    this.curhandlerstep = 2;
                }
                else {
                    done = true;
                }
                break;
        }

        if (done) {
            var ms = new Message();
            ms.data = this.constants; //[];
            ms.datatype = "object";
            ms.datacount = 0;
            ms.hasdata = "yes";
            ms.haserrors = "no";
            ms.type = "APPXCNSTS";
            sendMessage(ws, ms);

            // setup to read next message header
            this.curhandler = 0;
            this.needbytes = 8;
            this.curhandlerstep = 0;
        }
    };

    // GET MESSAGES Handler - 91
    this.appxgetmessageshandler = function APPXProcessor_appxgetmessageshandler() {
        logactivity("***** SOCKET_GETMESSAGES *****, step=" + this.curhandlerstep);

        var done = false;
        var allDone = false;

        switch (this.curhandlerstep) {
            case 0: // get the first header
                this.messages = [];
                this.needbytes = 8;
                this.curhandlerstep = 1;

                break;

            case 1: // process header
                var rawdata = this.rtndata.slice(0, 8);
                this.rtndata = this.rtndata.slice(8, this.rtndata.length);

                var msg = new Mesg();
                msg.group = new DataView(new Uint8Array(rawdata.slice(0, 4)).buffer).getUint32(0);
                msg.severity = new DataView(new Uint8Array(rawdata.slice(4, 6)).buffer).getUint16(0);
                msg.txtlen = new DataView(new Uint8Array(rawdata.slice(6, 8)).buffer).getUint16(0);
                this.messages.push(msg);

                if (msg.txtlen > 0) {
                    this.needbytes = msg.txtlen;
                    this.curhandlerstep = 2;
                }
                else {
                    done = true;
                }
                break;

            case 2: // process text
                var msg = this.messages[this.messages.length - 1];
                var rawdata = this.rtndata.slice(0, this.needbytes);
                this.rtndata = this.rtndata.slice(this.needbytes, this.rtndata.length);

                msg.txtval = ab2str(rawdata);
                done = true;
        }

        if (done) {
            var msg = this.messages[this.messages.length - 1];
            if (msg.group == 0 && msg.severity == 0 && msg.txtlen == 0) {
                allDone = true;
            }
            else {
                this.needbytes = 8;
                this.curhandlerstep = 1;
            }
        }

        if (allDone) {
            logactivity("processing " + this.items.length + " messages...");

            var ms = new Message();
            ms.data = this.messages;
            ms.datatype = "array";
            ms.datacount = this.messages.length;
            ms.hasdata = "yes";
            ms.haserrors = "no";
            ms.type = "APPXMSGS";
            sendMessage(ws, ms);

            // setup to read next message header
            this.curhandler = 0;
            this.needbytes = 8;
            this.curhandlerstep = 0;
        }

    };

    // PROC STACK Handler - 93
    this.appxprocstackhandler = function APPXProcessor_appxprocstackhandler() {
        logactivity("***** SOCKET_PROC STACK 64-bit="+this._APPX64+" *****, step=" + this.curhandlerstep);

        var done = false;

        switch (this.curhandlerstep) {
            case 0: // set up to receive list of PCBs
                if (this.procstack)
                    this.procstacklast = JSON.parse(JSON.stringify(this.procstack));
                this.procstack = {};
                if(this._APPX64){
                    this.needbytes = 8;
                }
                else{
                    this.needbytes = 4;
                }
                this.curhandlerstep = 1;
                break;

            case 1: // Process a PCB
                var pcb = 0;
                if(this._APPX64){
                    var rawdata = this.rtndata.slice(0, 8);
                    this.rtndata = this.rtndata.slice(8, this.rtndata.length);
                    var dw = new DataView(new Uint8Array(rawdata).buffer);
                    pcb = dw.getBigUint64(0).toString();
                }
                else{
                    var rawdata = this.rtndata.slice(0, 4);
                    this.rtndata = this.rtndata.slice(4, this.rtndata.length);
                    pcb = new DataView(new Uint8Array(rawdata).buffer).getUint32(0);
                }

                if (pcb == 0 || pcb == "0") {
                    done = true;
                }
                else {
                    this.procstack[pcb] = true;
                    if(this._APPX64){
                        this.needbytes = 8;
                    }
                    else{
                        this.needbytes = 4;
                    }
                    this.curhandlerstep = 1;
                }
                break;
        }

        if (done) {
            var ms = new Message();
            ms.data = this.procstack;
            ms.datatype = "object";
            ms.hasdata = "yes";
            ms.haserrors = "no";
            ms.type = "APPXPROCSTACK";

            sendMessage(ws, ms);

            ReleaseProcessResources(self, this.procstack, this.procstacklast);

            // setup to read next message header
            this.curhandler = 0;
            this.needbytes = 8;
            this.curhandlerstep = 0;
        }
    };

    // SETFIELD Handler //85
    this.appxsetfieldhandler = function APPXProcessor_appxsetfieldhandler() {

        logactivity("***** SOCKET_SETFIELD *****, step=" + this.curhandlerstep);

        var done = false;

        switch (this.curhandlerstep) {
            case 0:
                this.cursetfieldcount--;
                var rawdata = this.rtndata.slice(0, 4);
                this.rtndata = this.rtndata.slice(4, this.rtndata.length);


                logHexDump("resHeader", rawdata, "Resource header...");

                this.cursetfield.row = new DataView(new Uint8Array(rawdata.slice(0, 1)).buffer).getUint8(0);
                this.cursetfield.col = new DataView(new Uint8Array(rawdata.slice(1, 2)).buffer).getUint8(0);
                this.cursetfield.len = new DataView(new Uint8Array(rawdata.slice(2, 4)).buffer).getUint16(0);

                if (this.cursetfield.len > 0) {
                    this.needbytes = this.cursetfield.len;
                    this.curhandlerstep = 1;
                }
                else {
                    done = true;
                }

                break;
            case 1:
                this.cursetfield.data = [];

                this.cursetfield.data = this.rtndata.slice(0, this.needbytes);
                this.rtndata = this.rtndata.slice(this.needbytes, this.rtndata.length);

                done = true;
                break;
        }

        if (done) {

            logHexDump("SETFIELDDATA", this.cursetfield.data, "Set Field Data Received...");

            var ms = new Message();
            ms.data = this.cursetfield;
            ms.datatype = "object";
            ms.hasdata = "yes";
            ms.haserrors = "no";
            ms.type = "APPXSETFIELD";

            sendMessage(ws, ms);

            logactivity("cursetfieldcount=" + this.cursetfieldcount);

            this.curhandler = 0;
            this.needbytes = 8;
            this.curhandlerstep = 0;

        }
    };

    // Items Handler
    this.appxitemshandler = function APPXProcessor_appxitemshandler() {
        logactivity("***** SOCKET_ITEMS *****, step=" + this.curhandlerstep);
        var itemDone = false;
        var allDone = false;

        item = function item() {
            this.struct = [];
            this.data = [];
        };

        switch (this.curhandlerstep) {
            case 0: // set up to read an item block from the server
                this.items = [];
                //From release 6.1 we started sending 20 bytes
                if((this.serverExtendedFeatureMask & TMNET_FEATURE2_LARGE_WORK_FIELD) == TMNET_FEATURE2_LARGE_WORK_FIELD){
                    this.needbytes = 20; 
                }
                else{
                    this.needbytes = 12;
                }
                this.curhandlerstep = 1;
                break;
            case 1: // Trim off item block just read and process it and setup to read data if any
                var itm = new item();
                if((this.serverExtendedFeatureMask & TMNET_FEATURE2_LARGE_WORK_FIELD) == TMNET_FEATURE2_LARGE_WORK_FIELD){
                    itm.struct = this.rtndata.slice(0, 20);
                    this.rtndata = this.rtndata.slice(20, this.rtndata.length);
                    this.needbytes = new DataView(new Uint8Array(itm.struct.slice(12, 16)).buffer).getUint32(0); 
                }
                else{
                    itm.struct = this.rtndata.slice(0, 12);
                    this.rtndata = this.rtndata.slice(12, this.rtndata.length);
                    this.needbytes = new DataView(new Uint8Array(itm.struct.slice(10, 12)).buffer).getUint16(0);
                }
                this.items.push(itm);

                if (this.needbytes == 0) {
                    if ((itm.struct[9] & 0x02) == 0x02) {
                        //token field, these bytes contain cachid for token field data
                        this.needbytes = 24;
                        this.curhandlerstep = 3;
                    }
                    else {
                        this.needbytes = 2;
                        this.curhandlerstep = 4;
                    }
                }
                else {
                    this.curhandlerstep = 2;
                }

                break;
            case 2: // we need to read data and that data has arrived, attach it to the last item processed
                var itm = this.items[this.items.length - 1];
                itm.data = this.rtndata.slice(0, this.needbytes);
                this.rtndata = this.rtndata.slice(this.needbytes, this.rtndata.length);
                if ((itm.struct[9] & FLD_SPEC_TOKEN) == FLD_SPEC_TOKEN) {
                    //token field, these bytes contain cachid for token field data
                    this.needbytes = 24;
                    this.curhandlerstep = 3;
                }
                else {
                    this.needbytes = 2;
                    this.curhandlerstep = 4;
                }
                break;
            case 3: // trim off and process token block
                var itm = this.items[this.items.length - 1];
                itm.tokendata = this.rtndata.slice(0, this.needbytes);
                this.rtndata = this.rtndata.slice(this.needbytes, this.rtndata.length);
                this.needbytes = 2;
                this.curhandlerstep = 4;
                break;
            case 4: // Trim off and process the widget data length
                var itm = this.items[this.items.length - 1];
                itm.widget_len = new DataView(new Uint8Array(this.rtndata.slice(0, 2)).buffer).getUint16(0);
                this.rtndata = this.rtndata.slice(2, this.rtndata.length);
                this.needbytes = itm.widget_len;

                if (this.needbytes == 0) {
                    itm.widget_data = null;
                    this.curhandlerstep = 6;
                    this.needbytes = 4
                }
                else {
                    this.curhandlerstep = 5;
                }
                break;
            case 5: // trim off and process the widget data
                var itm = this.items[this.items.length - 1];
                itm.widget_data = ab2str(this.rtndata.slice(0, this.needbytes));
                this.rtndata = this.rtndata.slice(this.needbytes, this.rtndata.length);
                this.curhandlerstep++;
                this.needbytes = 4;
                break;
            case 6: // trim off and process extra data length
                var itm = this.items[this.items.length - 1];
                var bn = this.needbytes;
                this.needbytes = new DataView(new Uint8Array(this.rtndata.slice(0, 4)).buffer).getInt32(0);
                this.rtndata = this.rtndata.slice(bn, this.rtndata.length);
                if (this.needbytes > 0) {
                    this.curhandlerstep++;
                }
                else {
                    if (this.needbytes < 0) {
                        itm.extrareuse = true;
                    }
                    itemDone = true;
                }
                break;
            case 7: // trim off and process extra data
                var itm = this.items[this.items.length - 1];
                itm.extradata = this.rtndata.slice(0, this.needbytes);
                this.rtndata = this.rtndata.slice(this.needbytes, this.rtndata.length);
                itemDone = true;
                break;
        }

        if (itemDone) {
            var itm = this.items[this.items.length - 1];
            if (itm.struct[2] == 0) {
                allDone = true;
            }
            else {
                //From release 6.1 we started sending 20 bytes
                if((this.serverExtendedFeatureMask & TMNET_FEATURE2_LARGE_WORK_FIELD) == TMNET_FEATURE2_LARGE_WORK_FIELD){
                    this.needbytes = 20; 
                }
                else{
                    this.needbytes = 12;
                }
                this.curhandlerstep = 1;
            }
        }

        if (allDone) {
            var items = [];
            var i = 0;

            logactivity("processing " + this.items.length + " items...");
            while (this.items.length > 0) {
                var item = this.items.shift();
                var itm = new Item();

                itm.pos_row = item.struct[0];
                itm.pos_col = item.struct[1];
                itm.size_rows = item.struct[2];
                itm.size_cols = item.struct[3];
                itm.justification = item.struct[4];
                itm.digits_left = item.struct[5];
                itm.digits_right = item.struct[6];
                itm.options = item.struct[7];
                itm.type = item.struct[8];
                itm.special = item.struct[9];
                //from release 6.1 we satrted sending item MaxLen so we can support larger fields
                if((this.serverExtendedFeatureMask & TMNET_FEATURE2_LARGE_WORK_FIELD) == TMNET_FEATURE2_LARGE_WORK_FIELD){
                    itm.maxLen = new DataView(new Uint8Array(item.struct.slice(16, 20)).buffer).getUint32(0); 
                }
                else{
                    itm.maxLen = 0;
                }

                /*sometimes we need the raw data when low order bits are used to
		**delimit data like formatted fields and date pickers that don't 
		**necessarily have an attached Widget. Widgets are processed on 
		**client, so they already have rawdata.*/
                itm.rawdata = item.data

                itm.data = ab2str(item.data);

                if (item.widget_data != null) {
                    itm.widget = item.widget_data;
                }

                //check itm.special for tokendata
                if ((itm.special & FLD_SPEC_TOKEN) == FLD_SPEC_TOKEN) {
                    itm.tokendata = item.tokendata;
                    itm.token_cacheid = ab2str(itm.tokendata.slice(0, 8)).trim();
                    itm.token_cache_sig = ab2str(itm.tokendata.slice(8, 16)).trim();
                    itm.token_group = itm.tokendata.slice(16, 18);
                    itm.token_app = ab2str(itm.tokendata.slice(18, 21)).trim();
                    itm.token_ap_ver = ab2str(itm.tokendata.slice(21, 23)).trim();
                    itm.token_filler = itm.tokendata.slice(23, 24);
                }

                logactivity("item " + i + " row=" + itm.pos_row + " col=" + itm.pos_col + " rows=" + itm.size_rows + " cols=" + itm.size_cols + " data=" + itm.data);
                if (itm.size_rows > 0)
                    items.push(itm);
                i++;
            }

            var ms = new Message();
            ms.data = items;
            ms.datatype = "array";
            ms.datacount = items.length;
            ms.hasdata = "yes";
            ms.haserrors = "no";
            ms.type = "APPXITEMS";
            sendMessage(ws, ms);

            // setup to read next essage header
            this.curhandler = 0;
            this.needbytes = 8;
            this.curhandlerstep = 0;
        }
    };

    // Receive File Handler
    this.appxreceivefilehandler = function APPXProcessor_appxreceivefilehandler() {
        logactivity("***** SOCKET_RECEIVE_FILE *****, step=" + this.curhandlerstep);
        switch (this.curhandlerstep) {
            case 0: // set up to read an item block from the server
                this.needbytes = 4;
                this.curhandlerstep = 1;
                break;
            case 1:
                this.needbytes = new DataView(new Uint8Array(this.rtndata.slice(0, 4)).buffer).getUint32(0);
                this.rtndata = this.rtndata.slice(4, this.rtndata.length);

                this.curhandlerstep = 2;
                break;
            case 2:
                var myfilerecbytes = [];

                myfilerecbytes = this.rtndata.slice(0, this.needbytes);
                this.rtndata = this.rtndata.slice(this.needbytes, this.rtndata.length);

                logactivity("my url=" + ab2str(myfilerecbytes));
                var fileName = ab2str(myfilerecbytes).trim();
	        dlogForce("appxConnector appxreceivefilehandler fileName="+fileName);

                /*If we put a file into mongo for server to grab then we get file from
                **mongo and send file to server. Else we use the old method involving
                **the local connector to grab file*/
                if (fileName.indexOf("$(sendFile)") != -1) {
                    var index = fileName.lastIndexOf("\\") + 1;
                    if (index === 0) {
                        index = fileName.lastIndexOf("/") + 1;
                    }

                    var mongoFileName = encodeURI(fileName.substring(index).replace(/ /g, "_"));
                    var fileData = Buffer.alloc(0);
                    var fileName = toUTF8Array(mongoFileName);
                    var fileDataLength = null;
                    var gb = new GridFSBucket(mongoCacheDb, { bucketName: this.cacheCollection });
                    var downloadStream = gb.openDownloadStreamByName(mongoFileName);
                    downloadStream.on("error", function downloadStream_onError(error) {
                        dlog("Receive File Handler downloadStream error: " + error);
                        self.clientsocket.write(Buffer.from([3, 0]));
                    });

                    downloadStream.on("data", function downloadStream_onData(data) {
                        if (fileDataLength === null) {
                            self.clientsocket.write(Buffer.from([3, 1]));
                            fileDataLength = this.s.file.chunkSize;
                            self.clientsocket.write(Buffer.from(hton32(fileDataLength)));
                        }
                        for (var i = 0; i * 2048 < data.length; i++) {
                            var chunk = data.slice(i * 2048, i * 2048 + 2048);
                            //send chunk length
                            self.clientsocket.write(Buffer.from(hton32(chunk.length)));

                            //send chunk
                            self.clientsocket.write(Buffer.from(chunk));
                        }
                    });
                    downloadStream.on("end", function downloadStream_onEnd() {
                        try {
                            if (fileDataLength === null) {
                                self.clientsocket.write(Buffer.from(([3, 1])));
                                self.clientsocket.write(Buffer.from(hton32(0)));
                            }

                            //send null for EOF
                            self.clientsocket.write(Buffer.from(hton32(0)));

                            //send Filename Length
                            self.clientsocket.write(Buffer.from(hton32(fileName.length)));

                            self.clientsocket.write(Buffer.from(fileName));

                            //send client status
                            self.clientsocket.write(Buffer.from(([3, 1])));
                        } catch (e) {
                            dlog(e);
                            dlog(e.stack);
                        }
                    });
                } else {

                    var ms = new Message();
                    ms.data = fileName
                    ms.datatype = "object";
                    ms.hasdata = "yes";
                    ms.haserrors = "no";
                    ms.type = "APPXRECEIVEFILE";
                    sendMessage(ws, ms);

                }
                this.curhandler = 0;
                this.needbytes = 8;
                this.curhandlerstep = 0;
                break;
        }
    }

    // Widget Handler
    this.appxwidgetshandler = function APPXProcessor_appxwidgetshandler() {
        logactivity("***** SOCKET_WIDGETS *****, step=" + this.curhandlerstep);
        var all_done = false;
        var widgetDone = false;
        switch (this.curhandlerstep) {
            case 0: // set up to read the widget count
                this.widgets = [];
                this.needbytes = 4;
                this.curhandlerstep = 1;
                break;
            case 1: // trim off the widget count
                this.widgetCount = new DataView(new Uint8Array(this.rtndata.slice(0, 4)).buffer).getUint32(0);
                this.rtndata = this.rtndata.slice(this.needbytes, this.rtndata.length);

                if (this.widgetCount == 0) {
                    all_done = true;
                }
                else {
                    this.needbytes = 24;
                    this.curhandlerstep = 2;
                }

                logactivity("widgetCount=" + this.widgetCount + " all_done=" + all_done + " needbytes=" + this.needbytes);
                break;
            case 2:// trim off a widget block
                var mywidget = new WidgetStructure();
                mywidget.widget_structure_raw_data = this.rtndata.slice(0, 24);
                this.rtndata = this.rtndata.slice(24, this.rtndata.length);

                mywidget.type = mywidget.widget_structure_raw_data[0];
                mywidget.filler = mywidget.widget_structure_raw_data[1];
                mywidget.parent = new DataView(new Uint8Array(mywidget.widget_structure_raw_data.slice(2, 4)).buffer).getUint16(0);
                mywidget.pos_row = new DataView(new Uint8Array(mywidget.widget_structure_raw_data.slice(4, 8)).buffer).getUint32(0);
                mywidget.pos_col = new DataView(new Uint8Array(mywidget.widget_structure_raw_data.slice(8, 12)).buffer).getUint32(0);
                mywidget.size_row = new DataView(new Uint8Array(mywidget.widget_structure_raw_data.slice(12, 16)).buffer).getInt32(0);
                mywidget.size_col = new DataView(new Uint8Array(mywidget.widget_structure_raw_data.slice(16, 20)).buffer).getInt32(0);


                mywidget.data_length = new DataView(new Uint8Array(mywidget.widget_structure_raw_data.slice(20, 24)).buffer).getUint32(0);

                this.widgets.push(mywidget);

                if (mywidget.data_length > 0) {
                    this.needbytes = mywidget.data_length;
                    this.curhandlerstep = 3;
                }
                else {
                    this.needbytes = 4;
                    this.curhandlerstep = 4;
                }

                logactivity(" type=" + mywidget.type + " parent=" + mywidget.parent + " row=" + mywidget.pos_row + " col=" + mywidget.pos_col + " rows=" + mywidget.size_row + " cols=" + mywidget.size_col + " dataLen=" + mywidget.data_length);
                break;
            case 3:
                var mywidget = this.widgets[this.widgets.length - 1];
                mywidget.widget_data = ab2str(this.rtndata.slice(0, this.needbytes));
                this.rtndata = this.rtndata.slice(this.needbytes, this.rtndata.length);
                this.needbytes = 4;
                this.curhandlerstep = 4;
                logactivity("widgetCount=" + this.widgetCount + " widgets.length=" + this.widgets.length + " done=" + all_done + " widget_data=" + mywidget.widget_data);
                break;
            case 4: // trim off and process extra data length
                var mywidget = this.widgets[this.widgets.length - 1];
                this.needbytes = new DataView(new Uint8Array(this.rtndata.slice(0, 4)).buffer).getInt32(0);
                this.rtndata = this.rtndata.slice(4, this.rtndata.length);
                if (this.needbytes > 0) {
                    this.curhandlerstep++;
                }
                else {
                    if (this.needbytes < 0) {
                        mywidget.widget_extrareuse = true;
                    }
                    widgetDone = true;
                }
                break;
            case 5:// trim off and process extra data
                var mywidget = this.widgets[this.widgets.length - 1];
                var rtnDataExtra = this.maxByteSize;
                if ((this.byteCount + this.rtndata.length) >= this.needbytes) {
                    if (this.rtndata.length > (this.needbytes - this.byteCount)) {
                        rtnDataExtra = (this.needbytes - this.byteCount);
                    } else {
                        rtnDataExtra = this.needbytes;
                    }
                    mywidget.widget_extradata = ab2str(this.rtndata.slice(0, rtnDataExtra));
                    this.byteCount = this.needbytes;
                } else {
                    this.byteCount += this.maxByteSize;
                    mywidget.widget_extradata = ab2str(this.rtndata.slice(0, this.maxByteSize));
                }
                //logactivity("widgetExtraData=" + mywidget.widget_extradata);
                this.currentData = this.leftoverData;
                this.leftoverData = mywidget.widget_extradata.substring(mywidget.widget_extradata.lastIndexOf("\"]") + 3);
                this.currentData += mywidget.widget_extradata.substring(0, mywidget.widget_extradata.lastIndexOf("\"]") + 2);
                this.rtndata = this.rtndata.slice(rtnDataExtra, this.rtndata.length);
                if (this.currentData.substring(0, 1) === ",") {
                    this.currentData = this.currentData.substring(1);   
                }
                //logactivity("currentData=" + this.currentData);
                mywidget.pcb = StrGetSubstr(mywidget.widget_data, "@SPCB=", "@");
                
                var lookupHash = crypto.createHash('sha1');
                lookupHash.update(mywidget.widget_data);
                mywidget.datalookupid = lookupHash.digest('hex');
                
                //add extradata to mongo
                var mDataRows, jdata, myData, columnCount = 0;

                try {
                    /*
                    **Function to put table row data into mongo database
                    **
                    **@param mRemove: Boolean whether previous table data needs to be removed (New Table)
                    */
                    function processRows(mRemove) {
                        myData = self.mongoconnector.createMongoRows(self.columnData, mywidget.pcb, jdata, columnCount, caseSort);
                        // Put row data into server temporary database
                        if (!mywidget.widget_extrareuse) {
                            self.pendingInserts++;
                            if( mRemove ) {
                                mywidget.deleteInProgress = true;
                                self.mongoconnector.insertappxtabledata(self, mywidget.datalookupid, myData.rows, mRemove, mywidget);
                            }
                            else {
                                self.mongoconnector.insertappxtabledata(self, mywidget.datalookupid, myData.rows, mRemove, mywidget);
                            }
                        }
                        if (myData.table.selectedKeys && (myData.table.selectedKeys.length > 0) && (JSON.stringify(myData.table.selectedKeys) !== JSON.stringify(self.selectedKeys))) {
                            self.selectedKeys = self.selectedKeys.concat(myData.table.selectedKeys);
                            self.selectedRows = self.selectedRows.concat(myData.table.selectedRows);
                        }
                        // Send table definition on to client 
                        mywidget.widget_extradata = myData.table;
                    }            

                    /*Get table sorting data*/
                    var caseSort = true;
                    // caseSort = (mywidget.widget_data.indexOf("@TCSS=T") != -1);
                    // Parse raw table and row data into a better format
                    jdata = self.mongoconnector.parseTableData(self.currentData);
                    // Parse table into row data and table specs
                    if (self.beginTableData) {
                        self.mongoconnector.createTableColumnData(self, mywidget.datalookupid, jdata, function columnData_callback(columnData) {
                            self.columnData = columnData;
                            columnCount = self.columnData.colCount + 1;
                            self.beginTableData = false;
                            processRows(true);                                                         
                        });
                    } else {
                        processRows(false);
                    }
                } catch (e) {
                    dlog(e);
                    dlog(e.stack);
                }
                if (this.byteCount >= this.needbytes) {
                    if (self.selectedRows.length > 0) {
                        mywidget.widget_extradata.selectedKeys = self.selectedKeys;
                        mywidget.widget_extradata.selectedRows = self.selectedRows;
                    }
                    widgetDone = true;
                }
                
                break;
        }

        if (widgetDone) {
            this.currentData = "";
            this.leftoverData = "";
            this.byteCount = 0;
            this.columnData = {};
            this.beginTableData = true;
            this.selectedKeys = [];
            this.selectedRows = [];
            if (this.widgetCount == this.widgets.length) {
                all_done = true;
            }
            else {
                this.needbytes = 24;
                this.curhandlerstep = 2;
            }
        }

        if (all_done == true) {
            var widgets = [];
            while (this.widgets.length > 0) {
                var wx = this.widgets.shift();
                var widget_wn = new DataView(new Uint8Array(wx.widget_structure_raw_data.slice(2, 4)).buffer).getUint16(0);
                widgets.push([widget_wn, wx.widget_data, {
                    "widget_extra_data": wx.widget_extradata,
                    "widget_extra_reuse": wx.widget_extrareuse == null ? false : true,
                    "datalookupid": wx.datalookupid
                }, wx]);
            } //end while widgets

            var ms = new Message();
            ms.data = widgets;
            ms.datatype = "array";
            ms.datacount = widgets.length;
            ms.hasdata = "yes";
            ms.haserrors = "no";
            ms.type = "APPXWIDGETS";
            sendMessage(ws, ms);

            this.curhandler = 0;
            this.needbytes = 8;
            this.curhandlerstep = 0;
        }
    };

    // Screen Handler
    this.appxscreenhandler = function APPXProcessor_appxscreenhandler() {
        logactivity("***** SOCKET_UPDATE_SCREEN *****, step=" + this.curhandlerstep);

        switch (this.curhandlerstep) {
            case 0:
                this.needbytes = new DataView(new Uint8Array(this.rtndata.slice(0, 2)).buffer).getUint16(0);
                this.rtndata = this.rtndata.slice(2, this.rtndata.length);
                this.curhandlerstep = 1;
                break;
            case 1:
                this.rtndata = this.rtndata.slice(this.needbytes, this.rtndata.length);

                var rd = {};
                rd.data = "<div id='appx_main_background' style='float:left;width:70%;'>" + "" + "</div>";
                rd.type = "HTML";

                var ms = new Message();
                ms.data = rd;
                ms.datatype = "object";
                ms.datacount = 1;
                ms.hasdata = "yes";
                ms.haserrors = "no";
                ms.type = "APPXSCREEN";
                sendMessage(ws, ms);

                this.curhandler = 0;
                this.needbytes = 8;
                this.curhandlerstep = 0;
                break;
        }
    };

    // Attributes Handler
    this.appxattributeshandler = function APPXProcessor_appxattributeshandler() {
        logactivity("***** SOCKET_UPDATE_ATTRIBUTES *****, step=" + this.curhandlerstep);

        switch (this.curhandlerstep) {
            case 0:
                this.needbytes = new DataView(new Uint8Array(this.rtndata.slice(0, 2)).buffer).getUint16(0);
                this.rtndata = this.rtndata.slice(2, this.rtndata.length);
                this.curhandlerstep = 1;
                break;
            case 1:
                var x = this.rtndata.slice(0, this.needbytes);
                this.rtndata = this.rtndata.slice(this.needbytes, this.rtndata.length);

                var ms = new Message();
                ms.data = x;
                ms.datatype = "object";
                ms.datacount = x.length;
                ms.hasdata = "yes";
                ms.haserrors = "no";
                ms.type = "APPXATTRIBUTES";
                sendMessage(ws, ms);

                this.curhandler = 0;
                this.needbytes = 8;
                this.curhandlerstep = 0;
                break;
        }
    };

    // Extended Attributes Handler
    this.appxextraattributeshandler = function APPXProcessor_appxextraattributeshandler() {
        logactivity("***** SOCKET_UPDATE_EXTENDED_ATTRIBUTES *****, step=" + this.curhandlerstep);

        switch (this.curhandlerstep) {
            case 0:
                this.needbytes = new DataView(new Uint8Array(this.rtndata.slice(0, 2)).buffer).getUint16(0);
                this.rtndata = this.rtndata.slice(2, this.rtndata.length);
                this.curhandlerstep = 1;
                break;
            case 1:
                var x = this.rtndata.slice(0, this.needbytes);
                this.rtndata = this.rtndata.slice(this.needbytes, this.rtndata.length);

                var ms = new Message();
                ms.data = x;
                ms.datatype = "object";
                ms.datacount = x.length;
                ms.hasdata = "yes";
                ms.haserrors = "no";
                ms.type = "APPXEXTRAATTRIBUTES";
                sendMessage(ws, ms);

                this.curhandler = 0;
                this.needbytes = 8;
                this.curhandlerstep = 0;
                break;
        }
    };

    // Ping Handler
    this.appxpinghandler = function APPXProcessor_appxpinghandler() {
        logactivity("***** SOCKET_PING *****");

        var ms = new Message();
        ms.data = [];
        ms.datatype = "object";
        ms.datacount = 1;
        ms.hasdata = "no";
        ms.haserrors = "no";
        ms.type = "APPXPING";
        sendMessage(ws, ms);

        this.curhandler = 0;
        this.needbytes = 8;
        this.curhandlerstep = 0;
    };

    // Show Handler
    this.appxshowhandler = function APPXProcessor_appxshowhandler() {

        logactivity("***** SOCKET_SHOW *****, step=" + this.curhandlerstep);

        var all_done = false;
        var boxDone = false;
        switch (this.curhandlerstep) {
            case 0:
                this.current_show = new ShowStructure();

                this.current_show.rawdata = this.rtndata.slice(0, 56);
                this.rtndata = this.rtndata.slice(56, this.rtndata.length);

                this.current_show.termid = this.current_show.rawdata.slice(0, 4);
                this.current_show.curraction = this.current_show.rawdata.slice(4, 5);
                this.current_show.filler1 = this.current_show.rawdata.slice(5, 8);
                this.current_show.keymap = this.current_show.rawdata.slice(8, 12);
                this.current_show.cursorrow = this.current_show.rawdata.slice(12, 16);
                this.current_show.cursorcol = this.current_show.rawdata.slice(16, 20);
                this.current_show.timeout = new DataView(new Uint8Array(this.current_show.rawdata.slice(20, 24)).buffer).getUint32(0);
                this.current_show.charatcursor = this.current_show.rawdata.slice(24, 28);
                this.current_show.useroption = this.current_show.rawdata.slice(28, 32);
                this.current_show.rtnstatus = this.current_show.rawdata.slice(32, 36);
                this.current_show.numboxes = this.current_show.rawdata.slice(36, 40);
                this.current_show.numwdgts = this.current_show.rawdata.slice(40, 44);
                this.current_show.altcursorrow = null;
                this.current_show.altcursorcol = null;
                this.current_show.altuseroption = null;

                this.current_show.num_boxes = new DataView(new Uint8Array(this.current_show.numboxes).buffer).getUint32(0);
                this.current_show.boxes = [];

                logactivity("timeout=" + this.current_show.timeout + " action=" + this.current_show.curraction + " num_boxes=" + this.current_show.num_boxes);
                if (this.current_show.num_boxes == 0) {
                    all_done = true;
                }
                else {
                    this.needbytes = 22;
                    this.curhandlerstep = 1;
                }

                break;
            case 1:
                var box = new TMBoxStructure();

                box.begin_row = new DataView(new Uint8Array(this.rtndata.slice(0, 4)).buffer).getUint32(0);
                box.begin_column = new DataView(new Uint8Array(this.rtndata.slice(4, 8)).buffer).getUint32(0);
                box.end_row = new DataView(new Uint8Array(this.rtndata.slice(8, 12)).buffer).getUint32(0);
                box.end_column = new DataView(new Uint8Array(this.rtndata.slice(12, 16)).buffer).getUint32(0);
                box.bit_mask = new DataView(new Uint8Array(this.rtndata.slice(16, 20)).buffer).getUint32(0);
                box.data_length = new DataView(new Uint8Array(this.rtndata.slice(20, 22)).buffer).getUint16(0);

                this.rtndata = this.rtndata.slice(22, this.rtndata.length);

                this.current_show.boxes.push(box);
                logactivity("box.data_len=" + box.data_length + " num_boxes=" + this.current_show.num_boxes + " boxes.length=" + this.current_show.boxes.length);
                if (box.data_length > 0) {
                    this.needbytes = box.data_length;
                    this.curhandlerstep = 2;
                }
                else {
                    this.needbytes = 4;
                    this.curhandlerstep = 3;
                }
                break;
            case 2:
                var box = this.current_show.boxes[this.current_show.boxes.length - 1];
                box.data = ab2str(this.rtndata.slice(0, box.data_length));
                this.rtndata = this.rtndata.slice(box.data_length, this.rtndata.length);
                this.needbytes = 4;
                this.curhandlerstep = 3;
                break;
            case 3: // trim off and process extra data length
                var box = this.current_show.boxes[this.current_show.boxes.length - 1];
                this.needbytes = new DataView(new Uint8Array(this.rtndata.slice(0, 4)).buffer).getInt32(0);
                this.rtndata = this.rtndata.slice(4, this.rtndata.length);
                if (this.needbytes > 0) {
                    this.curhandlerstep++;
                }
                else {
                    if (this.needbytes < 0) {
                        box.extrareuse = true;
                    }
                    boxDone = true;
                }
                break;
            case 4: // trim off and process extra data
                var box = this.current_show.boxes[this.current_show.boxes.length - 1];
                box.extradata = this.rtndata.slice(0, this.needbytes);
                this.rtndata = this.rtndata.slice(this.needbytes, this.rtndata.length);
                boxDone = true;
                break;
        }

        if (boxDone) {
            if (this.current_show.num_boxes == this.current_show.boxes.length) {
                all_done = true;
            }
            else {
                this.needbytes = 22;
                this.curhandlerstep = 1;
            }
        }

        if (all_done) {

            var ms = new Message();
            ms.data = this.current_show;
            ms.datatype = "object";
            ms.datacount = 1;
            ms.hasdata = "yes";
            ms.haserrors = "no";
            ms.type = "APPXSHOW";
            var waitfor = function waitfor() {
                if (self.pendingInserts == 0) {
                    sendMessage(ws, ms);
                }
                else {
                    setTimeout(waitfor, 100);
                }
            }

            waitfor();

            this.curhandler = 0;
            this.needbytes = 8;
            this.curhandlerstep = 0;
        }
    };

} //APPXProcessor. object

// APPX File Object
function FileStructure() {
    var self = this;
    self.data = [];
    self.datalength = null;
    self.filenamelength = null;
    self.filename = null;
    self.currdatachunklength = 0;
    self.currdatachunk = [];
    self.filename = null;
}

// Item Object
function Item() {
    var self = this;
    self.pos_row = null;
    self.pos_col = null;
    self.size_rows = null;
    self.size_cols = null;
    self.justification = null;
    self.digits_left = null;
    self.digits_right = null;
    self.options = null;
    self.type = null;
    self.special = null;
    self.data = null; //String converted using ab4str()
    self.rawdata = null; //raws bytes in cases where data in encoded with low order bytes like formatted fields or date picker with masks
    self.widget = null;
}

function Mesg() {
    var self = this;
    self.group = null;
    self.severity = null;
    self.txtlen = null;
    self.txtval = null;
}

// Java Object Class
function JavaObject() {
    var self = this;
    self.createobjectstructurebytes = null;
    self.prototypelength = null;
    self.prototypedata = null;
    self.objecthandle = null;
    self.argumentcount = null;
    self.argumentstructurebytes = null;
    self.argumentdatatype = null;
    self.argumentdatalength = null;
    self.argumentdata = null;
    self.arguments = [];
}

// APPX Menu Object
function Menu() {
    var self = this;
    self.items = [];
}

// APPX Menu Object
function MenuItem() {
    var self = this;
}

// APPX Message Object
function Message() {
    var self = this;
    self.data = [];
    self.hasdata = null;
    self.haserrors = null;
    self.count;
    self.messagepart = 0;
    self.type = null;
}

function TokenStructure() {
    var self = this;

    this.rawdata = null;

    this.ap = null;
    this.ver = null;
    this.group = null;
    this.cacheid = null;
    this.state = 0;

    this.loctype = 0;
    this.ext = 0;
    this.len = 0;
    this.data = [];

    this.id = 0;
    this.ctx = 0;
    this.type = 0;
    this.filler = null;
    this.items = [];

}

function TokenItem() {
    var self = this;
    self.token_id = null;
    self.token_id_group = null;
    self.token_id_val_len = null;
    self.data = "";
}

function SetFieldStructure() {
    var self = this;
    self.row = null;
    self.col = null;
    self.len = null;
    self.data = "";
}

function ResourceStructure() {
    var self = this;
    this.rawdata = null;
    this.ap = null;
    this.ver = null;
    this.cacheid = null;
    this.state = 0;
    this.loctype = 0;
    this.ext = 0;
    this.len = 0;
    this.data = [];
    this.id = 0;
    this.ctx = 0;
    this.type = 0;
    this.filler = null;
}

function ShowStructure() {
    var self = this;
    self.termid = null;
    self.curraction = null;
    self.filler1 = null;
    self.keymap = null;
    self.cursorrow = null;
    self.cursorcol = null;
    self.timeout = null;
    self.charatcursor = null;
    self.useroption = null;
    self.rtnstatus = null;
    self.numboxes = null;
    self.numwdgts = null;
    self.altcursorrow = null;
    self.altcursorcol = null;
    self.altuseroption = null;
    self.rawdata = null;
    self.boxdata = null;
    self.boxes = [];
    self.num_boxes = 0;
    self.processed_boxes = 0;
}

function TMBoxStructure() {
    var self = this;
    this.begin_row = 0;
    this.end_row = 0;
    this.begin_column = 0;
    this.end_column = 0;
    this.bit_mask = 0;
    this.data_length = 0;
    this.data = [];
    this.widget = null;
    this.items = [];
    this.widgets = [];
    this.rowtext = [];
};

// WidgetStruction Object
function WidgetStructure() {
    var self = this;
    self.type = null;
    self.filler = null;
    self.parent = null;
    self.pos_row = null;
    self.pos_col = null;
    self.size_rows = null;
    self.size_cols = null;
    self.data_length = null;
    self.widget_structure_raw_data = null;
    self.widget_data = null;
    self.num_widgets = 0;
    self.processed_widgets = 0;
    self.table_data = 0;
    self.table_data_length = 0;

}

// Utilities

/*
**Function to replace the CKEDITOR config file with updated parameters that the
**newer versions of CKEDITOR require.
**
**@param editor: CKEDITOR config string.
**
**@return editor: CKEDITOR config string.
*/
function modifyCkeditor(editor) {
    editor = editor.replace(/[+][ ]*\n*/g, "").trim();

    if (editor.indexOf("CKEDITOR.config") !== -1) {
        editor = editor.replace(/CKEDITOR\.config[ ]*=[\n]*[\{]/, "CKEDITOR.editorConfig = function(config){").replace(/^[ \t]+([^:]*)[ ]?:/gm, "config.$1 =").replace(/,[ \n]*$/gm, ";");
    }

    editor = editor.replace(/\r/g, "").replace(/\t/g, "").trim();
    return editor;
}


function ab2int32(buf) {
    return new DataView(new Uint8Array(buf).buffer).getUint32(0);
}

// Convert buffer to string
function ab2str(buf) {
    return Buffer.from(buf).toString('utf8');
}

// Convert buffer to string
function ab3str(buf) {
    return Buffer.from(buf).toString('utf8');
}

// Convert buffer to string
function ab4str(array) {
    return Buffer.from(buf).toString('utf8')
}

// Convert buffer to string
function buf2str(buf) {
    return buf.toString('utf8');
}

// Convert hex to ascii
function hex2a(hex) {
    var str = '';
    for (var i = 0; i < hex.length; i += 2) {
        str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    }
    return str;
}

// Convert string to buffer
function str2ab(str, length) {
    var buf = new Uint16Array(length); // 2 bytes for each char
    for (var i = 0, strLen = str.length; i < strLen; i++) {
        buf[i] = str.charCodeAt(i);
    }
    return buf;
}

// Convert string to buffer
function str3ab(str, length) {
    var buf = new Uint8Array(length); // 2 bytes for each char
    for (var i = 0, strLen = str.length; i < strLen; i++) {
        buf[i] = str.charCodeAt(i);
    }
    return buf;
}

// Convert string to buffer
function str4ab(str) {
    var buf = [];
    for (var i = 0, strLen = str.length; i < strLen; i++) {
        buf.push(str.charCodeAt(i));
    }
    return buf;
}

// Table Data Handler
function appxTableDataHandler() {
    logactivity("***** TABLE_DATA_HANDLER *****");

    var self = this;

    self.clearCollections = function appxTableDataHandler_clearCollections(coll, res) {
        /*clear mongo data for this session*/
        try {
            mongoCacheDb.collection(coll , { strict: true }, function mongoCacheDb_collectionCallback(err, collection) {
                if (err && err.message.indexOf("does not exist") === -1) {
                    dlog("clearCollections db.collection error: " + err);
                }
                if (collection) {
                    /*clear the data for downloaded/uploaded files (collectionName.file and collectionname.chunk)*/
                    var gb = new GridFSBucket(mongoCacheDb, { bucketName: coll});
                    gb.drop(function gb_drop(err) {
                        if (err) {
                            dlog("clearCollections "+coll+" gb.drop error: " + err);
                        }
                    });
                    /*delete the table data*/
                    collection.drop(function collection_drop(err, result) {
                        if (err) {
                            dlog("clearCollections "+coll+" collection.drop error: " + err);
                        }
                    });
                }
            });
        } catch (e) {
            dlog(e);
            dlog(e.stack);
        }
    };

    self.removeappxtabledata = function appxTableDataHandler_removeappxtabledata(lookupid, res) {
        try {
            mongoCacheDb.collection(self.cacheCollection, { strict: true }, function mongoCacheDb_collectionCallback(err, collection) {

                if (!err && collection) {
                    collection.deleteMany({ "datalookupid": lookupid }, { "fsync": true }, function collection_removeCallback(err, result) {
                        if (err) {
                            dlog("removeappxtabledata collection.deleteMany error: " + err);
                        }
                    });
                } else if (err.message.indexOf("does not exist") === -1) {
                    dlog("removeappxtabledata db.collection error: " + err);
                }
            });
        } catch (e) {
            dlog(e);
            dlog(e.stack);
        }
    };

    self.releaseappxtabledata = function appxTableDataHandler_releaseappxtabledata(coll, pcb, res) {
        try {
            mongoCacheDb.collection(coll, { strict: true }, function mongoCacheDb_collectionCallback(err, collection) {
                if (!err) {
                    collection.deleteMany({ "datapcbid": pcb }, { "fsync": true },function collection_removeCallback(err, result) {
                        if (err) {
                            dlog("releaseappxtabledata collection.deleteMany error: " + err);
                        }
                    });
                } else if (err.message.indexOf("does not exist") === -1) {
                    dlog("releaseappxtabledata db.collection error: " + err);
                }
            });
        } catch (e) {
            dlog(e);
            dlog(e.stack);
        }
    };

    self.insertappxtabledata = function (appxprocessor, lookupid, message, removeData, mywidget) {
        try {
            var collection = mongoCacheDb.collection(appxprocessor.cacheCollection, function(err,collection){
                if (message.length > 0) {
                    if (removeData) {
                        collection.deleteMany({ "datalookupid": lookupid }, function(res) {
                            mywidget.deleteIsRunning = false;
                        });
                    }
                    var deferredExec = function(bulk) {
                        if( mywidget.deleteIsRunning === false ) {
                            bulk.execute({},function() {
								appxprocessor.pendingInserts--;
                            });
                        }
                        else {
                        setTimeout( function() {
                            deferredExec(bulk);
                            },100);
                        }
                    };
                    var bulk = collection.initializeUnorderedBulkOp();
                    var mMax = message.length - 1;
                    for (var i = 0, cnt = 0; i <= mMax; i++) {
                        bulk.insert(message[i]);
                        cnt++;
                        if ( cnt === 1000 || i === mMax ) {
                            appxprocessor.pendingInserts++;
                            deferredExec(bulk);
                            if (i === mMax) { 
                                appxprocessor.pendingInserts--; 
                            }
                            bulk = collection.initializeUnorderedBulkOp();
                            cnt = 0;
                        }
                    }
                }
            });
        } catch (e) {
            console.log(e);
            dlog(e);
            dlog(e.stack);
        }
    };

    self.parseTableData = function appxTableDataHandler_parseTableData(tabledata) {
        var newstring = '{"tabledata": [' + tabledata + ']}';
        var parsedData;
        var isValid = false;
        var count = 0;
        
        for (var i = 0; i < 32; i++) {
            var re = new RegExp(String.fromCharCode(i), "g");
            newstring = newstring.replace(re, "\(???\)");
        }
        while (!isValid && count++ < 1000) {
            try {

                parsedData = JSON.parse(newstring);
                isValid = true;
            } catch (e) {
                var errorString = e.toString();
                var errorLocation = parseInt(errorString.substring(errorString.lastIndexOf(" ") + 1));
                newstring = newstring.substring(0, errorLocation - 1) + "\(???\)" + newstring.substring(errorLocation + 1);
            }
        }
        return parsedData;

    };
    
    self.createTableColumnData = function appxTableDataHandler_createTableColumnData(appxprocessor, datalookupid, dataobject, callback) {
        try {
            var data = dataobject.tabledata;
            var numrows = parseInt(data[0][0]);
            var numcols = parseInt(data[0][1]);
            var expand = data[0][2];
            var floatcol = parseInt(data[0][2]) - 1;
            var colsarray = data.slice(1, numcols + 1);
            var sortcols = [];
            var rowdata = data.slice(numcols + 1, data.length);
            var widthcur = 0;
            
            // Build list of which columns have extra hidden sort columns
            sortcols.push(null);
            sortcols.push(null); // id column
            sortcols.push(null); // selection column
            if (colsarray.length > 0) {
                for (var i = 0; i < colsarray.length; i++) {
                    var cleanName = colsarray[i][3].replace(/\'/g, "").replace(/\s/g, "_").replace(/\./g, "_").toLowerCase() + i;
                    var sortType = "A";
                    switch (colsarray[i][4]) {
                        case "java.lang.Integer": 
                            cleanName += "I"; 
                            sortType = "I"; 
                            break;
                        case "java.lang.Float": 
                            cleanName += "F"; 
                            sortType = "F";  
                            break;
                        case "java.util.Date": 
                            cleanName += "D"; 
                            sortType = "D";  
                            break;
                        case "java.lang.Boolean": 
                            cleanName += "B"; 
                            sortType = null;  
                            break;
                        default:
                            cleanName += "A";
                            sortType = "A";
                            break;
                    }
                    colsarray[i]["cleanName"] = cleanName;
                    /* Now check if sortType has been overridden by widget*/
                    if( colsarray[i].length > 6 ){
                        var strIdx = colsarray[i][6].indexOf("@TCST=");
                        if(strIdx >= 0 && colsarray[i][6].length >= strIdx + 6 ){
                            //add the length of the text to the strIdx so we can extract the value
                            strIdx += 6;
                            var macroValue = colsarray[i][6].substr(strIdx, strIdx+10).split("@",1)[0].trim();
                            switch (macroValue) {
                                case "INT": 
                                    sortType = "I"; 
                                    break;
                                case "FLOAT": 
                                    sortType = "F";  
                                    break;
                                case "DATE": 
                                    /* if the original format is in alpha, change this to alpha and let the 
                                    ** client to handle the conversion to date base on "datefmt" argument */
                                    if(sortType == "A")
                                        sortType = "A";
                                    else
                                        sortType = "D";  
                                    break;
                                case "TEXT": 
                                    sortType = "A";  
                                    break;
                                default:
                                    break;
                            }
                        } 
                    }
                    sortcols.push(sortType);
                }
            }
            /////////////////////////////////////////////////////
            // Create the column models and names for the grid //
            /////////////////////////////////////////////////////
            
            var colnames = {};
            var colmodel = [];
            var colopts = [];
            var collist = { "id2": 1, "selected": 1 };
            var colWidget = {};
            var defaultRowWidget = {};
            
            //Create hidden initial sort column
            colmodel.push({
                "name": "initialSort",
                "index": "initialSort",
                "width": 1,
                "hidden": true,
                "hidedlg": true
            });
            
            // Create hidden row id column
            colmodel.push({
                "name": "id2",
                "index": "id2",
                "width": 1,
                "hidden": true,
                "key": true,
                "hidedlg": true
            });
            
            // Create hidden selection column
            colmodel.push({
                "name": "selected",
                "index": "selected",
                "width": 1,
                "hidden": true,
                "hidedlg": true
            });
            
            
            if (floatcol >= 0) {
                for (var i = 0, j = 3; i < colsarray.length; i++ , j++) {
                    var cellWidth = (parseInt(colsarray[i][2]) * appxprocessor.colWidthPx);
                    if (i != floatcol)
                        widthcur += cellWidth;
                }
            }
            
            var inc = 1;
            
            for (var i = 0, j = 3; i < colsarray.length; i++ , j++) {
                
                var cleanName = colsarray[i]["cleanName"];
                
                var floatCol;
                if (i != floatcol) {
                    floatCol = true;
                } else {
                    floatCol = false;
                }
                
                collist[cleanName] = 1;
                
                // Create the column definition
                var colObject = {
                    "name": cleanName,
                    "index": cleanName,
                    "label": colsarray[i][3],
                    "width": (parseInt(colsarray[i][2]) * appxprocessor.colWidthPx),
                    "fixed": floatCol,
                    "align": "left",
                    "sortable": true,
                    "search": true,
                    "title": false,
                    "datatype": "html",
                    "hidden": false,
                    "hidedlg": false
                };

                /* This is where we save the widget information for each column*/
                /* check if we have widget info for this column, if we do add it to colWidget
                 * The 6th oject in the array is widget data
                */ 

                if( colsarray[i].length > 6){
                    var colWidgetObj = {};
                    colWidgetObj["widget_data"] = colsarray[i][6];
                    colWidgetObj["oLabel"] = colsarray[i][3];
                    colWidget[cleanName] = colWidgetObj;
                }

                /* This is where we save the default widget information for each row*/
                /* check if we have default row widget info for this column, if we do add it to defaultEowWidget
                 * The 7th oject in the array is the default row widget data
                */ 

               if( colsarray[i].length > 7 && colsarray[i][7].length > 0){
                    defaultRowWidget[cleanName] = {'widget_data':colsarray[i][7]};
                }
                
                // Let's go ahead and push this into the column model list but
                // we can still override it's values as needed.
                colmodel.push(colObject);
                
                if (colsarray[i][4].indexOf("Boolean") > -1) {
                    colObject["formatter"] = "checkbox";
                    colObject["editoptions"] = { value: "y:n" };
                    colObject["align"] = "center";
                    colObject["formatoptions"] = { disabled: true };
                }
                else if (colsarray[i][4].indexOf("Integer") > -1) {
                    colObject["align"] = "right";
                    colObject["searchtype"] = "integer";
                }
                else if (colsarray[i][4].indexOf("Float") > -1) {
                    colObject["align"] = "right";
                    colObject["searchtype"] = "float";
                }
                
                
                if (sortcols[i + 3]) {
                    var sortname = "sortcol_" + (i + 3).toString() + colsarray[i]["cleanName"].slice(-1);
                    
                    colObject["index"] = sortname;
                    
                    colmodel.push({
                        "name": sortname,
                        "index": sortname + "_sort",
                        "width": 150,
                        "hidden": true,
                        "hidedlg": true
                    });
                }
            }

            var mTableColumnData = {};
            mTableColumnData.collection = appxprocessor.cacheCollection;
            mTableColumnData.datalookupid = datalookupid;
            mTableColumnData.rowCount = numrows;
            mTableColumnData.colCount = numcols;
            mTableColumnData.colArray = colsarray;
            mTableColumnData.expand = expand;
            mTableColumnData.colModel = colmodel;
            mTableColumnData.sortColumns = sortcols;
            mTableColumnData.floatcol = floatcol;
            mTableColumnData.widthcur = widthcur;
            mTableColumnData.currentRow = 0;
            mTableColumnData.collist = JSON.stringify(collist);
            mTableColumnData.colWidget = colWidget;
            mTableColumnData.defaultRowWidget = defaultRowWidget;
            callback(mTableColumnData);

        } catch (ex) {
            dlog("createTableColumnData() failed: " + ex);
            dlog(ex.stack);
            callback({});
        }
           
    }

    self.createMongoRows = function appxTableDataHandler_createMongoRows(columnData, datapcbid, dataobject, colCount, caseSort) {
        try {
            var data = dataobject.tabledata;
            var mydata = data.slice(colCount, data.length);
            var newrow = [];
            var jsonRows = [];
            var selectedRows = [];
            var selectedKeys = [];
            var sortcols = columnData.sortColumns;
            var colsarray = columnData.colArray;
            var overrideRowWidget = {};
            var rowWidgetSupported = false;
            var rowWidgetObj = {};
            var jsonRowWidget;
            //If no rows are returned, push empty row with modified datalookupid
            if (mydata.length == 0) {
                var myrow = {};
                for (var j = 0; j < columnData.colModel.length; j++) {
                    myrow[columnData.colModel[j].name] = newrow[j];
                }
                myrow.datalookupid = "BlankTable" + Date.now();
                myrow.datapcbid = datapcbid;
                myrow["_id"] = columnData.datalookupid + "_" + myrow.datalookupid;
                jsonRows.push(myrow);
            }

            /*check if the engine sends row widget info, if it does, the 3rd field is 
            * an array of widget data for columns, if not, the 3rd field is the first column on the
            * table*/
           /*we add 2 to column count because primarykey and selected is not part of the colCount*/
            if(mydata.length > 0 && mydata[0].length > (colsarray.length + 2)){
                rowWidgetSupported = true;
            }
            for (var i = 0; i < mydata.length; i++) {
                newrow = [];
                /*add data for default sortorder column*/
                mydata[i].unshift(++columnData.currentRow);
                for (var k = 0; k < mydata[i].length; k++) {
                    /*if rowWidget is supported, extract it, this shouldn't be part of the data 
                    * since we added sortorder, the rowwidget is now the 4th pirce of data */
                    if( k == 3 && rowWidgetSupported == true ){
                        
                        //ignore the data that comes in as '[]'
                        if(mydata[i][k].length > 2){
                            /*convert all '\"' to '"' before parsing the string to json*/
                            jsonRowWidget = JSON.parse("{\"rowWidget\":"+mydata[i][k].replace(/\\\"/g, '\"')+"}");
                            rowWidgetObj = {};
                            for(let jj = 0; jj < jsonRowWidget.rowWidget.length; jj++){
                                if(jsonRowWidget.rowWidget[jj] != ""){
                                    /* add 3 to column index because we want to skip initialsort, selected, and id2 columns*/ 
                                    rowWidgetObj[colsarray[jj]["cleanName"]] = {'widget_data':jsonRowWidget.rowWidget[jj]};
                                }
                            }
                            /* Add the override row widget to the object. The property name for each row is 
                            ** the primary key (2nd variable in the array)
                            ** Add "i" as a prefix to id, so id match the html 4 and html 5 standards
                            */
                            overrideRowWidget[ "i" + mydata[i][1]] = rowWidgetObj;
                        }  
                        continue;
                    }
                    var d = [];
                    if (k == 0) {
                        d[0] = mydata[i][k];
                    }
                    else if (k == 1){
                        /*html id must have at lease 1 alpha character in it. Add a leading 'i' to ensure that*/
                        d[0] = "i" + mydata[i][k];
                    } 
                    else {
                        d = mydata[i][k].split("||");
                    }

                    //If contains HTML data push through otherwise replace < > symbols.
                    if (d[0].length > 5 && d[0].substr(0, 5).toLowerCase() == "<html") {
                        newrow.push(d[0]);
                    } else {
                        if ((k > 3) && (colsarray[k - 4][4] == "java.lang.Boolean") && (d[0] == " ")) {
                            newrow.push("n");
                        } else if (k != 0) {
                            newrow.push(d[0].replace(/\</g, "&lt;").replace(/\>/g, "&gt;"));
                        } else {
                            newrow.push(d[0]);
                        }
                    }
                    /* If we support rowWidget, then from position 3 and on the sort columns are off by 1 position
                       We don't want to change sortcols because the rowwidget is not part of the data, so create
                       a new index for sortcol */
                    let sortcolsIndex = k;
                    if(k>3 && rowWidgetSupported == true ){
                        sortcolsIndex--;
                    }

                    if (sortcols[sortcolsIndex]) {
                        switch (sortcols[sortcolsIndex]) {
                            case "I":
                            case "D":
                                if (d.length > 1){
                                    var parsed = parseInt(d[1]);
                                    if (isNaN(parsed)) {
                                        newrow.push(d[1]);
                                    }
                                    else{
                                        newrow.push(parsed);
                                    }
                                }   
                                else{
                                    if (d[0].length > 0){
                                        var parsed = parseInt(d[0]);
                                        if (isNaN(parsed)) {
                                            newrow.push(0);
                                        }
                                        else{
                                            newrow.push(parsed);
                                        }
                                    }
                                    else
                                        newrow.push(0);
                                }
                                break;
                            case "F":
                                if (d.length > 1){
                                    var parsed = parseFloat(d[1]);
                                    if (isNaN(parsed)) {
                                        newrow.push(d[1]);
                                    }
                                    else{
                                        newrow.push(parsed);
                                    }
                                }
                                else{
                                    if (d[0].length > 0){
                                        var parsed = parseFloat(d[0]);
                                        if (isNaN(parsed)) {
                                            newrow.push(0.0);
                                        }
                                        else{
                                            newrow.push(parsed);
                                        }
                                    }
                                    else
                                        newrow.push(0.0);
                                }
                                break;
                            case "A":
                                if (d[0].length > 5 && d[0].substr(0, 5).toLowerCase() == "<html") {
                                    if (caseSort) {
                                        newrow.push(StripHtml(d[0]).toString());
                                    } else {
                                        newrow.push(StripHtml(d[0]).toString().toLowerCase());
                                    }
                                }
                                else {
                                    if (caseSort) {
                                        newrow.push(d[0]);
                                    } else {
                                        newrow.push(d[0].toLowerCase());
                                    }
                                }
                                break;
                        }
                    }
                }

                var myrow = {};
                for (var j = 0; j < columnData.colModel.length; j++) {
                    myrow[columnData.colModel[j].name] = newrow[j];
                }

                if (myrow.selected == "true") {
                    selectedRows.push(i + 1);
                    selectedKeys.push(myrow.id2);
                }

                myrow.datalookupid = columnData.datalookupid;
                myrow.datapcbid = datapcbid;
                myrow["_id"] = columnData.datalookupid + "_" + myrow.initialSort;
                jsonRows.push(myrow);
            }
            var mRtn = {};
            mRtn.rows = jsonRows;
            mRtn.table = {};
            mRtn.table.collection = columnData.collection;
            mRtn.table.datalookupid = columnData.datalookupid;
            mRtn.table.rowCount = columnData.rowCount;
            mRtn.table.colCount = columnData.colCount;
            mRtn.table.expand = columnData.expand;
            mRtn.table.colModel = columnData.colModel;
            mRtn.table.sortColumns = sortcols;
            mRtn.table.floatcol = columnData.floatcol;
            mRtn.table.widthcur = columnData.widthcur;
            mRtn.table.selectedRows = selectedRows;
            mRtn.table.selectedKeys = selectedKeys;
            mRtn.table.collist = columnData.collist;
            mRtn.table.curRow = columnData.currentRow;
            mRtn.table.colWidget = columnData.colWidget;
            mRtn.table.defaultRowWidget = columnData.defaultRowWidget;
            mRtn.table.rowWidget = overrideRowWidget;
            return mRtn;
        }
        catch (e) {
            dlog(e);
            dlog(e.stack);
        }

    };
};

function StrGetSubstr(str, prefix, suffix) {
    var idx1 = str.indexOf(prefix);
    var str1 = str.substr(idx1 + prefix.length);
    var idx2 = str1.indexOf(suffix);
    var str2 = str1.substr(0, idx2);
    return str2;
}

function ReleaseProcessResources(appxprocessor, procstack, procstacklast) {
    for (var property in procstacklast) {
        if (procstacklast.hasOwnProperty(property)) {
            if ((Object.keys(procstack).length > 0) && !procstack[property]) {
                appxprocessor.mongoconnector.releaseappxtabledata(appxprocessor.cacheCollection, property);
            }
        }
    }
}

function sendMessage(ws, msgData) {
    try {
        ws.send2(JSON.stringify(msgData));
    } catch (e) {
        dlog("Send message error: " + e);
        dlog(e.stack)
    }
}

/*Copied from appx-client-util.js file... Couldn't get require to work... Possible revisit*/
function toUTF8Array(str) {
    var utf8 = [];
    for (var i = 0; i < str.length; i++) {
        var charcode = str.charCodeAt(i);
        if (charcode < 0x80) utf8.push(charcode);
        else if (charcode < 0x800) {
            utf8.push(0xc0 | (charcode >> 6),
                0x80 | (charcode & 0x3f));
        }
        else if (charcode < 0xd800 || charcode >= 0xe000) {
            utf8.push(0xe0 | (charcode >> 12),
                0x80 | ((charcode >> 6) & 0x3f),
                0x80 | (charcode & 0x3f));
        }
        // surrogate pair
        else {
            i++;
            // UTF-16 encodes 0x10000-0x10FFFF by
            // subtracting 0x10000 and splitting the
            // 20 bits of 0x0-0xFFFFF into two halves
            charcode = 0x10000 + (((charcode & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff))
            utf8.push(0xf0 | (charcode >> 18),
                0x80 | ((charcode >> 12) & 0x3f),
                0x80 | ((charcode >> 6) & 0x3f),
                0x80 | (charcode & 0x3f));
        }
    }
    return utf8;
}

function hton32(i) {
    return [
        0xff & (i >> 24),
        0xff & (i >> 16),
        0xff & (i >> 8),
        0xff & (i >> 0)
    ];
}
}