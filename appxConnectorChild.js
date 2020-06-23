"use strict";


var serverConnectorVersionStr = "6.0.0.18052301";
var serverConnectorVersionNum = 60000.18052301;

//  *********************************************************
//  Configuration Section - Begin
//  *********************************************************

var rotLog = false;

// These are overwritten with values from our parent process
var cryptoEnabled = true;
var mongoDatabase = "AppxDatabaseCache";
var mongoHost = "localhost";
var mongoPort = 27017;
var appxdebug = false;
var appxlog = false;

//  *********************************************************
//  Configuration Section - End
//  *********************************************************

var myconfig = null;
var mongoStatus = "Running";

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
const {
    Readable
} = require('stream');
var net = require('net');
var hexy = require('hexy');
var crypto = require('crypto');
var node_cryptojs = require('node-cryptojs-aes');
var iconv = require('iconv-lite');

/************************************************************
    Library Imports - End
*************************************************************/

console.log("appxConnector Client process started, pid: " + process.pid);

// Global variables and Objects
var arrayPush = Array.prototype.push;
var mongoCacheDb = null;
var logfile = null;

// Find out which result Buffer.toJSON() returns.  This changed between Node 11.0 and 11.1
var appxToJsonTest = new Buffer("test");
var appxIsToJsonAnArray = appxToJsonTest.toJSON(appxToJsonTest) instanceof Array;

var ws;

const wss = new WebSocketServer({
    noServer: true
});

// If there is an extra argument on the command line that is a request to change our working directory
if (process.argv.length > 2) {
    process.chdir(process.argv[2]);
} else if (process.env.APPX_CONNECTOR_DIR) {
    process.chdir(process.env.APPX_CONNECTOR_DIR);
}

// Receive the open http socket from our parent process
process.on('exit', (code) => {
    console.log("appxConnector Client process exited,  pid: " + process.pid);
});

process.on('message', (req, socket, head) => {

    wss.handleUpgrade(req, socket, [], (client) => {

        ws = client;

        if (setConfigOptions(req.config)) {
            setProcTitle("waiting for login ");
            initLogging();
            connectToMongo();
            createWebSocket();
        } else {
            console.log("Required config option(s) not passed in from parent process");
            process.exit(1);
        }

    });
});

function setProcTitle(str) {
    process.title = "node appx " + str;
}

function initLogging() {
    // create a log file
    if (myconfig.appxlog) {

        const d = new Date();
        logfile = d.getMonth() + 1 + '' + d.getDate() + '' + d.getFullYear() + '' + d.getHours() + '' + d.getMinutes() + '' + d.getSeconds() + '' + '.log';

        fs.appendFile(logfile, 'creating the logfile', function fs_appendFileCallback(err) {

            if (err) {
                console.log("Log File Error:  " + err);
            }

            console.log('Created log file:  ' + logfile);

        });
    }
}

function setConfigOptions(config) {
    myconfig = config;

    return (myconfig.hasOwnProperty('cryptoEnabled') &&
        myconfig.hasOwnProperty('mongoDatabase') &&
        myconfig.hasOwnProperty('mongoHost') &&
        myconfig.hasOwnProperty('mongoPort') &&
        myconfig.hasOwnProperty('appxdebug') &&
        myconfig.hasOwnProperty('appxlog'));
}

function connectToMongo() {
    const mongoUrl = 'mongodb://' + myconfig.mongoHost + ':' + myconfig.mongoPort + '/' + myconfig.mongoDatabase + '?socketTimeoutMS=30000';
	const mongoOptions = {
		useUnifiedTopology: true
	};

    MongoClient.connect(mongoUrl, mongoOptions, function mongoClient_connectCallback(err, client) {
        mongoCacheDb = client.db("AppxDatabaseCache");

        if (err) {
            mongoStatus = "Error";
        }

    });
}

function addSignalHandlers(appxprocessor) {

    process.on('SIGINT', function () {
        console.log("SIGINT=" + appxprocessor.loggedin + " bool=" + (appxprocessor.loggedin === false));

        if (appxprocessor.loggedin === false)
            process.exit();
    });

    process.on('SIGTERM', function () {
        console.log("SIGTERM=" + appxprocessor.loggedin + " bool=" + (appxprocessor.loggedin === false));

        if (appxprocessor.loggedin === false)
            process.exit();
    });

}

function createWebSocket() {
    var CryptoJS = node_cryptojs.CryptoJS;
    var JsonFormatter = node_cryptojs.JsonFormatter;
    var uploadLocation;

    var gridStoreData = [];

    ws.send2 = function ws_send2(s) {
        var m = s;

        if (myconfig.cryptoEnabled)
            m = CryptoJS.AES.encrypt(s, "APPX", {
                format: JsonFormatter
            }).toString();

        try {
            this.send(m, function ws_send2_sendCallback(error) {

                if (error) {
                    console.log(error.stack);
                }

            });
        } catch (ex) {
            console.log("send2() failed, exception=" + ex);
        }
    };

    // Add connection meta data to this message for easier debugging
    logactivity("user connected...");

    var clientnumber = 0;

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

    // Create a socket client to APPX
    var client_appx_socket = new net.Socket();

    appxprocessor.clientsocket = client_appx_socket;

    // Map a function to cleanup on websocket close event
    ws.on('close', function ws_onCloseCallback(evt) {
        console.log("Client side socket closing: " + myid);
        logactivity('ws client disconnected... #:' + myid);
        client_appx_socket.destroy();
        appxprocessor.end();
    });

    // Map a function to log on websocket error event
    ws.on('error', function ws_onErrorCallback(err) {
        logactivity('ws client error occurred' + err);
        console.log("error: " + err);
    });

    // Add a 'close' event handler for the client socket
    client_appx_socket.on('close', function client_appx_socket_onCloseCallback(evt) {
        console.log("Engine side socket closing: " + myid);
        logactivity('ALERT:  Connection closed');
    });

    // Map a function to handle data from the APPX server
    client_appx_socket.on('data', function client_appx_socket_onDataCallback(data) {
        // push data from the server onto the clients buffer(an array)
        if (appxIsToJsonAnArray) {
            appxprocessor.rtndata = appxprocessor.rtndata.concat(data.toJSON(), new Array());
        } else {
            arrayPush.apply(appxprocessor.rtndata, Buffer.from(data));
        }

        // if we have received enough bytes to satify the next parser request
        // run the parser before receiving any more data.
        if (appxprocessor.needbytes <= appxprocessor.rtndata.length || appxprocessor.rtndata.length >= appxprocessor.maxByteSize || (appxprocessor.rtndata.length + appxprocessor.byteCount) >= appxprocessor.needbytes) {
            var prcd;
            try {
                prcd = appxprocessor.appxprocessmsg();
            } catch (ex) {
                logactivity("appxprocessmsg() failed, ex=" + ex);
                console.log(ex.stack);
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
        console.log("client-socket error: " + err);
        ws.close();
        appxprocessor.end();
    });

    // Map a function to handle web client message events
    ws.on('message', function ws_onMessageCallback(messageCrypt) {
        var message = messageCrypt;

        if (myconfig.cryptoEnabled) {
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
        } catch (appxerror) {
            logactivity("Message:  " + message);
            logactivity(appxerror);
            g = false;
            console.log("Message: " + message);
            console.log(appxerror.stack);
        }

        try {
            if (g) {
                if (rotLog) {
                    console.log("Client message: " + ms.cmd);
                }

                switch (ms.cmd) {

                    case "openfile":
                        // may not use this
                        break;

                    case "appxlogin":
                        //Connect to Appx Connection Manager
                        client_appx_socket.connect(parseInt(ms.args[1]), ms.args[0], function client_appx_socket_connectCallback() {
                            logactivity("CONNECTED TO " + ms.args[0] + ":" + ms.args[1]);
                        });

                        //created and send login to APPX
                        appxprocessor.uid = ab2str(ms.args[2]);
                        setProcTitle(appxprocessor.uid + " > " + ms.args[0] + "/" + ms.args[1]);
                        var tlogin = Buffer.alloc(331);
                        tlogin.write(ms.args[2]);
                        tlogin.write(ms.args[3], 21);
                        client_appx_socket.write(tlogin);

                        appxprocessor.cacheCollection = appxprocessor.hostCollection = require('process').pid.toString(); 
                        break;

                    case "appxreconnect":
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
                        break;

                    case "appxnewsession":
                        //Connect to Appx Connection Manager
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

                        var fileName = encodeURI(appxprocessor.hostCollection + "/" + cacheid2 + "." + currency);
                        var resQuery = mongoCacheDb.collection("resource.files").find({
                            filename: fileName
                        });

                        resQuery.toArray(function resQuery_toArray(error, docs) {

                            if (error) {
                                console.log("appxresource query.toArray error: " + error);
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

                            } else {
                                var msg = new Buffer(24);

                                msg.write(arg0Array[0].slice(0, 3), 0); // ap
                                msg.write(arg0Array[1].slice(0, 2), 3); // ver
                                msg.write(arg0Array[2].slice(0, 8), 5); // cacheid
                                msg.writeUInt8(parseInt("0x" + arg0Array[3].slice(0, 2)), 13); // state
                                msg.writeUInt16BE(parseInt("0x" + arg2Array[1].slice(0, 4)), 14); // id
                                msg.writeUInt32BE(parseInt("0x" + arg2Array[0].slice(0, 8)), 16); // ctx
                                msg.writeUInt8(parseInt("0x" + arg2Array[2].slice(0, 2)), 20); // type
                                msg.fill(0, 21); // filler

                                var header = new Buffer(8);

                                header.writeUInt32BE(12, 0);
                                header.writeUInt8(83, 4);
                                header.fill(0, 5);

                                appxprocessor.curresourcelistOut[argsArray[0]] = argsArray[1];
                                appxprocessor.curresourcecountOut++;

                                client_appx_socket.write(header);
                                client_appx_socket.write(msg);
                            }
                        });

                        break;

                    case "appxdate":

                        var msg = new Buffer(18);
                        msg.writeUInt8(ms.args[0], 0); // row
                        msg.writeUInt8(ms.args[1], 1); // col
                        msg.write(ms.args[2], 2); // date alpha16 string

                        var header = new Buffer(8);
                        header.writeUInt32BE(18, 0);
                        header.writeUInt8(84, 4);
                        header.fill(0, 5);

                        appxprocessor.cursetfield = new SetFieldStructure();
                        appxprocessor.cursetfieldcount++;

                        client_appx_socket.write(header);
                        client_appx_socket.write(msg);
                        break;

                        //TOD) - FIXME - REENGINEER show messages
                    case "appxsendshow":

                        var msg = new Buffer(18);
                        msg.writeUInt8(ms.args[0], 0); // row
                        msg.writeUInt8(ms.args[1], 1); // col
                        msg.write(ms.args[2], 2); // date alpha16 string

                        var header = new Buffer(8);
                        header.writeUInt32BE(18, 0);
                        header.writeUInt8(84, 4);
                        header.fill(0, 5);

                        appxprocessor.cursetfield = new SetFieldStructure();
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
                            } else {
                                console.log(err);
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
                                    ms.mongoStatus = mongoStatus;
                                    ms.type = (fi.toLowerCase().indexOf(".js") != -1 ? "SCRIPT" : "STYLE");
                                } else {
                                    console.log(err);
                                    ms.hasdata = "no";
                                    ms.haserror = "yes";
                                    ms.error = err;
                                }
                                ms.processID = require('process').pid.toString();
                                ms.serverConnectorVersionStr = serverConnectorVersionStr;
                                ms.serverConnectorVersionNum = serverConnectorVersionNum;
                                sendMessage(ws, ms);
                            });
                        };
                        /*If we have minified versions available then load the 
                         **minified files*/
                        var min = "";

                        if (ms.args[0] === true) {
                            min = ".min";
                        }

                        sendfile('appx-client-automaticLogin' + min + '.js'); // Send client anonymousLogin handler library code
                        sendfile('appx-client-util' + min + '.js'); // Send client utility library code
                        sendfile('appx-client-item' + min + '.js'); // Send client item handler library code
                        sendfile('appx-client-keys' + min + '.js'); // Send client key handler library code
                        sendfile('appx-client-localos' + min + '.js'); // Send client localos handler library code
                        sendfile('appx-client-main' + min + '.js'); // Send main Javascript Library code to handle messages like Widgets, etc
                        sendfile('appx-client-menu' + min + '.js'); // Send client menu handler library code
                        sendfile('appx-client-resource' + min + '.js'); // Send client resource handler library code
                        sendfile('appx-client-screen' + min + '.js'); // Send client screen handler library code
                        sendfile('appx-client-session' + min + '.js'); // Send client session handler library code
                        sendfile('appx-client-token' + min + '.js'); // Send client token handler library code
                        sendfile('appx-client-setfield' + min + '.js'); // Send client token handler library code
                        sendfile('appx-client-widget' + min + '.js'); // Send client widget handler library code
                        sendfile('appx-client-options' + min + '.js'); // Send client options handler library code

                        break;

                    case "ping":
                        break;

                    case "appxMongoToEngine":
                        var fileData = Buffer.alloc(0);
                        var fileName = encodeURI(ms.fileName);
                        var gb = new GridFSBucket(mongoCacheDb, {
                            bucketName: appxprocessor.cacheCollection
                        });
                        var downloadStream = gb.openDownloadStreamByName(fileName);
                        var fileDataLength = null;
                        var id = null;

                        downloadStream.on("error", function downloadStream_onError(error) {
                            console.log("appxMongoToEngine downloadStream error: " + error);
                            console.log(appxprocessor.cacheCollection);
                            client_appx_socket.write(Buffer.from([3, 0]));
                        });

                        downloadStream.on("data", function downloadStream_onData(data) {

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
                                client_appx_socket.write(Buffer.from(hton32(fileName.length)));
                                client_appx_socket.write(Buffer.from(fileName));
                                //send client status
                                client_appx_socket.write(Buffer.from(([3, 1])));

                            } catch (e) {
                                console.log(e);
                                console.log(e.stack);
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
        } catch (appxerror2) {
            logactivity(appxerror2);
            console.log(appxerror2.stack);
        }
    });

    logactivity("Server Running...");

}

// Logging function, added tracelevel for verbose logging
// May need to make sure file is writable before logging if too much logging is happening
function logactivity(data) {
    try {
        var delimiter = "\r\n";

        if (myconfig.appxdebug) {
            console.log(data);
        }

        if (myconfig.appxlog) {
            fs.appendFile(logfile, delimiter + data, function fs_appendFileCallback(err) {
                if (err) {
                    console.log("Log File Error:  " + err);
                }
            });
        }

    } catch (e) {
        console.log(e);
        console.log(e.stack);
    }
}

function consoleLogHexDump(tag, data, desc) {
    var format = {
        format: "twos",
        prefix: "[" + tag + "] "
    }

    console.log("");
    console.log("[" + tag + "] " + desc);
    console.log("[" + tag + "] " + data.length + " bytes logged");
    console.log(hexy.hexy(data, format));
}

function logHexDump(tag, data, desc) {
    if (!myconfig.appxdebug)
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
    self.fileIdMongo;

    this.mongoconnector = {};

    // Ends a web client's server loop
    this.end = function APPXProcessor_end() {
        this.mongoconnector.clearCollections(this.cacheCollection);
    };

    // APPX message handlers to send JSON packets to client rather than RAW socket data
    // Server Message Handler Functions
    // Processes server messages
    this.appxprocessmsg = function APPXProcessor_appxprocessmsg() {
        while ((this.rtndata.length > 0 && (this.rtndata.length >= this.needbytes || this.rtndata.length > this.maxByteSize || this.rtndata.length + this.byteCount >= this.needbytes)) || (this.needbytes == 0 && this.curhandler > 0)) {

            if (rotLog) {
                console.log("Server message: " + this.curhandler);
            }

            switch (this.curhandler) {
                case -1:
                    this.appxloginhandler();
                    break; // Login needs to be done
                case 0:
                    this.appxheaderhandler();
                    break; // Message Block
                case 6:
                    this.appxreconnecthandler();
                    break; // Message Block
                case 10:
                    this.appxinithandler();
                    break; // INIT
                case 12:
                    this.appxshowhandler();
                    break; // SHOW
                case 14:
                    this.appxfinishhandler();
                    break; // FINISHED
                case 17:
                    this.appxattachhandler();
                    break; // ATTACH
                case 19:
                    this.appxkeymaphandler();
                    break; // KEYMAP
                case 21:
                    this.appxscreenhandler();
                    break; // UPDATE SCREEN
                case 22:
                    this.appxattributeshandler();
                    break; // UPDATE ATTRIBUTE
                case 25:
                    this.appxpinghandler();
                    break; // PING
                case 26:
                    this.appxloadurlhandler();
                    break; // LOAD URL
                case 27:
                    this.appxextraattributeshandler();
                    break; // UPDATE EXTENDEDATTRIBUTE
                case 64:
                    this.appxobjectcreatehandler();
                    break; // CREATE OBJECT
                case 65:
                    this.appxobjectinvokehandler();
                    break; // INVOKE METHOD
                case 66:
                    this.appxobjectdestroyhandler();
                    break; // DESTROY OBJECT
                case 68:
                    this.appxfeatureshandler();
                    break; // FEATURE EXCHANGE
                case 69:
                    this.appxpidhandler();
                    break; // SERVER PROCESS ID
                case 71:
                    this.appxsendfilehandler();
                    break; // SEND FILE
                case 72:
                    this.appxitemshandler();
                    break; // ITEMS
                case 73:
                    this.appxreceivefilehandler();
                    break; // RECV FILE
                case 75:
                    this.appxwidgetshandler();
                    break; // WIDGETS
                case 79:
                    this.appxtokenhandler();
                    break; // TOKEN
                case 81:
                    this.appxmenuhandler();
                    break; // MENUS
                case 83:
                    this.appxresourcehandler();
                    break; // RESOURCE
                case 85:
                    this.appxsetfieldhandler();
                    break; // SETFIELD
                case 87:
                    this.appxsetclipboardhandler();
                    break; // SET CLIPBOARD
                case 88:
                    this.appxgetclipboardhandler();
                    break; // GET CLIPBOARD
                case 89:
                    this.appxconstantshandler();
                    break; // CONSTANTS EXCHANGE
                case 91:
                    this.appxgetmessageshandler();
                    break; // GET MESSAGES
                case 93:
                    this.appxprocstackhandler();
                    break; // PROC STACK
                case 94:
                    this.appxextendedfeatureshandler();
                    break; // EXTENDED FEATURE EXCHANGE
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
                    ret = dv.getUint8(0);
                    break;
                case T_BOOLEAN:
                    ret = dv.getUint8(0);
                    break;
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
                    ret = dv.getFloat64(0);
                    break;
                case T_LONG:
                    ret = dv.getFloat64(0);
                    break;
                default:
                    ret = ab2str(ret).trim();
                    break;
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
        this.needbytes = len;
        this.curhandlerstep++;
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
            console.log(ex);
            console.log(ex.stack);
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

                if (this.hdr.argCount == 0)
                    this.stepTo(9);
                else
                    this.read(0);

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

                if (--this.hdr.argCount > 0)
                    this.stepTo(5);
                else
                    this.read(0); //stepTo(9)

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
                    sendMessage(ws, ms);

                    this.curhandler = 0;
                    this.curhandlerstep = 0;
                    this.needbytes = 8;
                } else {
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
        ms.data = data;
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

        var ms = new Message();
        ms.data = data;
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
                    self.mykeymapdata = this.rtndata.slice(0, this.needbytes);
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

                setProcTitle(self.cacheCollection + " @ " + self.hostCollection);

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
                        this.rStream = new Readable({
                            read(size) {}
                        });

                        /*If we want to open file in the browser or use the browser to
                         **save a file to the client, after we have received
                         **the full file, we close the gridfsbucket, send message to client
                         **to load URL, and mimic clients response to server so APPX
                         **will continue to run*/
                        this.currfile.filename = this.currfile.filename.replace(")", Date.now() + ")");
                        var fileName = encodeURI(decodeURI(this.currfile.filename.replace("$(", "").replace(")", "")));
                        var self = this;
                        var gb = new GridFSBucket(mongoCacheDb, {
                            bucketName: this.cacheCollection
                        });
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
                } else {
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
                this.needbytes = 6;
                this.curhandlerstep++;
                break;

            case 1:
                this.menu.headerstructure = this.rtndata.slice(0, 6);
                this.menu.type = this.menu.headerstructure.slice(0, 1);
                this.menu.itemcount = new DataView(new Uint8Array(this.menu.headerstructure.slice(2, 4)).buffer).getUint16(0);
                this.menu.headerdatalength = new DataView(new Uint8Array(this.menu.headerstructure.slice(4, 6)).buffer).getUint16(0);

                if (this.menu.headerdatalength > 0) {
                    this.curhandlerstep++;
                    this.needbytes = this.menu.headerdatalength;
                } else { // if menu datalength is 0 skip a step
                    this.curhandlerstep += 2;
                    this.needbytes = 0;
                }
                break;

            case 2: //fetch header
                this.menu.headerdata = ab2str(this.rtndata.slice(0, this.needbytes));
                this.needbytes = 0;
                this.curhandlerstep++;
                break;

            case 3: //are there any menu items?
                if (this.menu.itemcount > 0) {
                    this.needbytes = 4; //menu struct = 4 bytes
                    this.curhandlerstep++;
                } else {
                    done = true;
                    menuItemDone = true;
                }
                break;

            case 4: //get next menu item (MMnu)
                this.curmenuitem = new MenuItem();
                this.curmenuitem.structure = this.rtndata.slice(0, 4);
                this.needbytes = new DataView(new Uint8Array(this.curmenuitem.structure.slice(2, 4)).buffer).getUint16(0);
                this.curhandlerstep++;
                break;

            case 5: //process menu item
                this.curmenuitem.data = ab2str(this.rtndata.slice(0, this.needbytes));
                this.needbytes = 4;
                this.curhandlerstep++;
                break;

            case 6: // trim off and process extra data length
                this.needbytes = new DataView(new Uint8Array(this.rtndata.slice(0, 4)).buffer).getInt32(0);

                if (this.needbytes > 0) {
                    this.curhandlerstep++;
                } else {
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

        if (this.curhandlerstep > 1) {
            this.rtndata = this.rtndata.slice(nb);
        }

        if (menuItemDone) {
            this.menu.items.push(this.curmenuitem);

            if (this.menu.items.length < this.menu.itemcount) {
                this.curhandlerstep = 4;
                this.needbytes = 4;
            } else {
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
                } else {
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
                } else {
                    if (this.curtoken.items.length == this.curtoken.len) {
                        done = true;
                    } else {
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
                } else {
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
                    console.log("Resource In Object: ");
                    console.dir(this.curresourceIn);
                }

                if (this.curresourceIn.len > 0) {
                    this.needbytes = this.curresourceIn.len;
                    this.curhandlerstep = 2;
                } else {
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
                            this.rStream = new Readable({
                                read(size) {}
                            });
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

                            var gb = new GridFSBucket(mongoCacheDb, {
                                bucketName: 'resource'
                            });
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
                                var filesQuery = mongoCacheDb.collection("resource.files").find({
                                    filename: fileName
                                });
                                filesQuery.toArray(function (error, docs) {
                                    if (error) {
                                        console.log("Resource handler query.toArray error: " + error);
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
                    console.log(e);
                    console.log(e.stack);

                }
        }

        if (done) {
            if (rotLog) {
                console.log("Resource Done:");
                console.dir(this.curresourceIn);
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
            } else {
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
                } else {
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
                } else {
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
                } else {
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
            } else {
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
        logactivity("***** SOCKET_PROC STACK *****, step=" + this.curhandlerstep);

        var done = false;

        switch (this.curhandlerstep) {
            case 0: // set up to receive list of PCBs
                if (this.procstack)
                    this.procstacklast = JSON.parse(JSON.stringify(this.procstack));
                this.procstack = {};
                this.needbytes = 4;
                this.curhandlerstep = 1;
                break;

            case 1: // Process a PCB
                var rawdata = this.rtndata.slice(0, 4);
                this.rtndata = this.rtndata.slice(4, this.rtndata.length);
                var pcb = new DataView(new Uint8Array(rawdata).buffer).getUint32(0);
                if (pcb == 0) {
                    done = true;
                } else {
                    this.procstack[pcb] = true;
                    this.needbytes = 4;
                    this.curhandlerstep = 1;
                }
                break;
        }

        if (done) {
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
                } else {
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
                this.needbytes = 12;
                this.curhandlerstep = 1;
                break;
            case 1: // Trim off item block just read and process it and setup to read data if any
                var itm = new item();
                itm.struct = this.rtndata.slice(0, 12);
                this.rtndata = this.rtndata.slice(12, this.rtndata.length);
                this.needbytes = new DataView(new Uint8Array(itm.struct.slice(10, 12)).buffer).getUint16(0);
                this.items.push(itm);

                if (this.needbytes == 0) {
                    if ((itm.struct[9] & 0x02) == 0x02) {
                        //token field, these bytes contain cachid for token field data
                        this.needbytes = 24;
                        this.curhandlerstep = 3;
                    } else {
                        this.needbytes = 2;
                        this.curhandlerstep = 4;
                    }
                } else {
                    this.curhandlerstep = 2;
                }

                break;
            case 2: // we need to read data and that data has arrived, attach it to the last item processed
                var itm = this.items[this.items.length - 1];
                itm.data = this.rtndata.slice(0, this.needbytes);
                this.rtndata = this.rtndata.slice(this.needbytes, this.rtndata.length);
                if ((itm.struct[9] & 0x02) == 0x02) {
                    //token field, these bytes contain cachid for token field data
                    this.needbytes = 24;
                    this.curhandlerstep = 3;
                } else {
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
                } else {
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
                } else {
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
            } else {
                this.needbytes = 12;
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
                if ((itm.special & 0x02) == 0x02) {
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
                    var gb = new GridFSBucket(mongoCacheDb, {
                        bucketName: this.cacheCollection
                    });
                    var downloadStream = gb.openDownloadStreamByName(mongoFileName);
                    downloadStream.on("error", function downloadStream_onError(error) {
                        console.log("Receive File Handler downloadStream error: " + error);
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
                            console.log(e);
                            console.log(e.stack);
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
                } else {
                    this.needbytes = 24;
                    this.curhandlerstep = 2;
                }

                logactivity("widgetCount=" + this.widgetCount + " all_done=" + all_done + " needbytes=" + this.needbytes);
                break;
            case 2: // trim off a widget block
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
                } else {
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
                } else {
                    if (this.needbytes < 0) {
                        mywidget.widget_extrareuse = true;
                    }
                    widgetDone = true;
                }
                break;
            case 5: // trim off and process extra data
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

                this.currentData = this.leftoverData;
                this.leftoverData = mywidget.widget_extradata.substring(mywidget.widget_extradata.lastIndexOf("\"]") + 3);
                this.currentData += mywidget.widget_extradata.substring(0, mywidget.widget_extradata.lastIndexOf("\"]") + 2);
                this.rtndata = this.rtndata.slice(rtnDataExtra, this.rtndata.length);
                if (this.currentData.substring(0, 1) === ",") {
                    this.currentData = this.currentData.substring(1);
                }
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
                            /*Need delay for large data sets. 1M+ records*/
                            setTimeout(function () {
                                self.mongoconnector.insertappxtabledata(self, mywidget.datalookupid, myData.rows, mRemove);
                            }, 50);
                        }
                        if (myData.table.selectedKeys && (myData.table.selectedKeys.length > 0) && (JSON.stringify(myData.table.selectedKeys) !== JSON.stringify(self.selectedKeys))) {
                            self.selectedKeys = self.selectedKeys.concat(myData.table.selectedKeys);
                            self.selectedRows = self.selectedRows.concat(myData.table.selectedRows);
                        }
                        // Send table definition on to client
                        mywidget.widget_extradata = myData.table;
                    }
                    /*Get table sorting data*/
                    var caseSort;
                    caseSort = (mywidget.widget_data.indexOf("@TCSS=T") != -1);
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
                    console.log(e);
                    console.log(e.stack);
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
            } else {
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
                } else {
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
                } else {
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
                } else {
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
            } else {
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
                } else {
                    setTimeout(waitfor, 100);
                }
            }

            waitfor();

            this.curhandler = 0;
            this.needbytes = 8;
            this.curhandlerstep = 0;
        }
    };

    addSignalHandlers( this ); // Catch signals so we can keep running if our appxConnector parent is restarted.

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
}

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
        editor = editor.replace(/CKEDITOR\.config[ ]*=[\n]*[{]/, "CKEDITOR.editorConfig = function(config){").replace(/^[ \t]+([^:]*)[ ]?:/gm, "config.$1 =").replace(/,[ \n]*$/gm, ";");
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
function ab4str(buf) {
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
    var dropCount = 0;

    self.clearCollections = function appxTableDataHandler_clearCollections(coll, res) {
        try {
            mongoCacheDb.collection(coll + ".files.chunks", {
                strict: true
            }, function mongoCacheDb_collectionCallback(err, collection) {
                if (err && err.message.indexOf("does not exist") === -1) {
                    console.log("clearCollections db.collection error--files: " + err);
                }
                if (collection) {
                    var gb = new GridFSBucket(mongoCacheDb, {
                        bucketName: coll + ".files"
                    });
                    gb.drop(function gb_drop(err) {
                        if (err)
                            console.log("clearCollections gb.drop error: " + err);

                        dropCount++;

                        if (dropCount == 2)
                            process.exit();
                    });
                } else {
                    dropCount++;

                    if (dropCount == 2)
                        process.exit();
                }
            });
            mongoCacheDb.collection(coll, {
                strict: true
            }, function mongoCacheDb_collectionCallback(err, collection) {
                if (err && err.message.indexOf("does not exist") === -1) {
                    console.log("clearCollections db.collection error--collection: " + err);
                }
                if (collection) {
                    collection.drop(function collection_drop(err, result) {
                        if (err)
                            console.log("clearCollections collection.drop error: " + err);

                        dropCount++;

                        if (dropCount == 2)
                            process.exit();
                    });
                } else {
                    dropCount++;

                    if (dropCount == 2)
                        process.exit();
                }
            });
        } catch (e) {
            console.log(e);
            console.log(e.stack);
        }
    };

    self.removeappxtabledata = function appxTableDataHandler_removeappxtabledata(lookupid, res) {
        try {
            mongoCacheDb.collection(self.cacheCollection, {
                strict: true
            }, function mongoCacheDb_collectionCallback(err, collection) {

                if (!err && collection) {
                    collection.remove({
                        "datalookupid": lookupid
                    }, function collection_removeCallback(err, result) {
                        if (err) {
                            console.log("removeappxtabledata collection.remove error: " + err);
                        }
                    });
                } else if (err.message.indexOf("does not exist") === -1) {
                    console.log("removeappxtabledata db.collection error: " + err);
                }
            });
        } catch (e) {
            console.log(e);
            console.log(e.stack);
        }
    };

    self.releaseappxtabledata = function appxTableDataHandler_releaseappxtabledata(coll, pcb, res) {
        try {
            mongoCacheDb.collection(coll, {
                strict: true
            }, function mongoCacheDb_collectionCallback(err, collection) {
                if (!err) {
                    collection.remove({
                        "datapcbid": pcb
                    }, function collection_removeCallback(err, result) {
                        if (err) {
                            console.log("releaseappxtabledata collection.remove error: " + err);
                        }
                    });
                } else if (err.message.indexOf("does not exist") === -1) {
                    console.log("releaseappxtabledata db.collection error: " + err);
                }
            });
        } catch (e) {
            console.log(e);
            console.log(e.stack);
        }
    };

    self.insertappxtabledata = function appxTableDataHandler_insertappxtabledata(appxprocessor, lookupid, message, removeData) {
        try {
            mongoCacheDb.collection(appxprocessor.cacheCollection, function mongoCatchDb_collectionCallback(err, collection) {
                if (err) {
                    console.log("insertappxtabledata db.collection error: " + err);
                }
                if (!err && message.length > 0) {
                    function insertData() {
                        /*
                         **Function to take insert bulk object into the MongDB
                         **
                         **@param mBulk: mongo bulk records object
                         **@param mFinal: boolean to tell if its final bulk item
                         */
                        function insertBulk(mBulk, mFinal) {
                            mBulk.execute({}, function bulk_executeCallback(err, res) {
                                if (err) {
                                    console.log("insertappxtabledata.insertBulk mBulk.execute error: " + err);
                                }
                                if (mFinal) {
                                    appxprocessor.pendingInserts--;
                                }
                            });
                        }

                        var released = false;
                        var bulk = collection.initializeUnorderedBulkOp();
                        for (var i = 0; i < message.length; i++) {
                            bulk.insert(message[i]);

                            if ((i !== 0 && i % 998 === 0) || i === message.length - 1) {
                                if (i !== message.length - 1) {
                                    insertBulk(bulk, false);
                                } else {
                                    insertBulk(bulk, true);
                                }
                                bulk = collection.initializeUnorderedBulkOp();
                            }

                        }
                    }
                    if (removeData) {
                        collection.remove({
                            "datalookupid": lookupid
                        }, function collection_removeCallback(err, res) {
                            if (err) {
                                console.log("insertappxtabledata collection.remove error: " + err);
                            }
                            insertData()
                        });
                    } else {
                        insertData();
                    }
                }
            });
        } catch (e) {
            console.log(e);
            console.log(e.stack);
        }
    };

    self.parseTableData = function appxTableDataHandler_parseTableData(tabledata) {
        var newstring = '{"tabledata": [' + tabledata + ']}';
        var parsedData;
        var isValid = false;
        var count = 0;

        for (var i = 0; i < 32; i++) {
            var re = new RegExp(String.fromCharCode(i), "g");
            newstring = newstring.replace(re, "(???)");
        }
        while (!isValid && count++ < 1000) {
            try {

                parsedData = JSON.parse(newstring);
                isValid = true;
            } catch (e) {
                var errorString = e.toString();
                var errorLocation = parseInt(errorString.substring(errorString.lastIndexOf(" ") + 1));
                newstring = newstring.substring(0, errorLocation - 1) + "(???)" + newstring.substring(errorLocation + 1);
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
                    var cleanName = colsarray[i][3].replace(/'/g, "").replace(/\s/g, "_").replace(/\./g, "_").toLowerCase() + i;
                    switch (colsarray[i][4]) {
                        case "java.lang.Integer":
                            cleanName += "I";
                            sortcols.push("I");
                            break;
                        case "java.lang.Float":
                            cleanName += "F";
                            sortcols.push("F");
                            break;
                        case "java.util.Date":
                            cleanName += "D";
                            sortcols.push("D");
                            break;
                        case "java.lang.Boolean":
                            cleanName += "B";
                            sortcols.push(null);
                            break;
                        default:
                            cleanName += "A";
                            sortcols.push("A");
                            break;
                    }
                    colsarray[i]["cleanName"] = cleanName;
                }
            }

            /////////////////////////////////////////////////////
            // Create the column models and names for the grid //
            /////////////////////////////////////////////////////

            var colnames = {};
            var colmodel = [];
            var colopts = [];
            var collist = {
                "id2": 1,
                "selected": 1
            };

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
                for (var i = 0, j = 3; i < colsarray.length; i++, j++) {
                    var cellWidth = (parseInt(colsarray[i][2]) * appxprocessor.colWidthPx);
                    if (i != floatcol)
                        widthcur += cellWidth;
                }
            }

            var inc = 1;

            for (var i = 0, j = 3; i < colsarray.length; i++, j++) {

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
                    "datatype": "html"

                };

                // Let's go ahead and push this into the column model list but
                // we can still override it's values as needed.
                colmodel.push(colObject);

                if (colsarray[i][4].indexOf("Boolean") > -1) {
                    colObject["formatter"] = "checkbox";
                    colObject["editoptions"] = {
                        value: "y:n"
                    };
                    colObject["align"] = "center";
                    colObject["formatoptions"] = {
                        disabled: true
                    };
                } else if (colsarray[i][4].indexOf("Integer") > -1) {
                    colObject["align"] = "right";
                    colObject["searchtype"] = "integer";
                } else if (colsarray[i][4].indexOf("Float") > -1) {
                    colObject["align"] = "right";
                    colObject["searchtype"] = "float";
                }


                if (sortcols[i + 3]) {
                    var sortname = "sortcol_" + (i + 3).toString() + colsarray[i]["cleanName"].slice(-1);

                    colObject["index"] = sortname;

                    colmodel.push({
                        "name": sortname,
                        "index": sortname + "_sort",
                        "width": 0,
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
            callback(mTableColumnData);

        } catch (ex) {
            console.log("createTableColumnData() failed: " + ex);
            console.log(ex.stack);
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

            for (var i = 0; i < mydata.length; i++) {
                newrow = [];
                mydata[i].unshift(++columnData.currentRow);
                for (var k = 0; k < mydata[i].length; k++) {
                    var d = [];
                    if (k == 0) {
                        d[0] = mydata[i][k];
                    } else {
                        d = mydata[i][k].split("||");
                    }

                    //If contains HTML data push through otherwise replace < > symbols.
                    if (d[0].length > 5 && d[0].substr(0, 5).toLowerCase() == "<html") {
                        newrow.push(d[0]);
                    } else {
                        if ((k > 2) && (colsarray[k - 3][4] == "java.lang.Boolean") && (d[0] == " ")) {
                            newrow.push("n");
                        } else if (k != 0) {
                            newrow.push(d[0].replace(/</g, "&lt;").replace(/>/g, "&gt;"));
                        } else {
                            newrow.push(d[0]);
                        }
                    }

                    if (sortcols[k]) {
                        switch (sortcols[k]) {
                            case "I":
                            case "D":
                                if (d.length > 1)
                                    newrow.push(parseInt(d[1]));
                                else
                                    newrow.push(0);
                                break;
                            case "F":
                                if (d.length > 1)
                                    newrow.push(parseFloat(d[1]));
                                else
                                    newrow.push(0.0);
                                break;
                            case "A":
                                if (d[0].length > 5 && d[0].substr(0, 5).toLowerCase() == "<html") {
                                    if (caseSort) {
                                        newrow.push(StripHtml(d[0]).toString());
                                    } else {
                                        newrow.push(StripHtml(d[0]).toString().toLowerCase());
                                    }
                                } else {
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
            return mRtn;
        } catch (e) {
            console.log(e);
            console.log(e.stack);
        }

    };
}

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
        console.log("Send message error: " + e);
        console.log(e.stack)
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
        } else if (charcode < 0xd800 || charcode >= 0xe000) {
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
