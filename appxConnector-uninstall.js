/**************************************************************
*** Uninstalls APPX Connector service process for Windows, ****
************ Linux, and Mac operating systems *****************
**************************************************************/

/*
###############################################################################
###############################################################################
@usage: node appxConnector-uninstall [appxport] [mongoport]
@example 1: node appxConnector-uninstall appx 3014
@example 2: node appxConnector-uninstall mongo 3015
@example 3: node appxConnector-uninstall 3016 3017
@example 3: node appxConnector-uninstall
###############################################################################
@Code defaults: if only 1 port is provided we will default port for
appxConnector. If no first argument is provided we will default to uninstall both
connectors. 
@IMPORTANT: Ports must be numbers
###############################################################################
###############################################################################
*/

var serverConnectorUnInstallVersionStr = "6.0.0.20122901";
var serverConnectorUnInstallVersionNum = 60000.20122901;

var Service
var platform
//Detects OS and sets the Service variable accordingly.
switch (process.platform) {
    case 'win32':
        Service = require('node-windows').Service;
        platform = "windows";
        break;
    case 'linux':
        Service = require('node-linux').Service; break;
    case 'darwin':
        Service = require('node-mac').Service; break;
}
var args = process.argv.slice(2);
var services = [
    {
        name: 'appxConnector',
        cwd: require('path').resolve(__dirname),
        script: 'appxConnector.js',
        //Set variable so appxConnector.js knows where to push files to.
        env: [{
            name: "APPX_CONNECTOR_DIR",
            value: require('path').resolve(__dirname)
        }, {
                name: "NODE_ENV",
                value: "production"
            }, {
                name: "APPX_CONNECTOR_PORT",
                value: 3014
            }
        ]

    },
    {
        name: 'appxMongoConnector',
        cwd: require('path').resolve(__dirname),
        script: 'appxMongoConnector.js',
        //Set variable so appxConnector.js knows where to push files to.
        env: [{
            name: "APPX_MONGO_CONNECTOR_DIR",
            value: require('path').resolve(__dirname)
        }, {
                name: "NODE_ENV",
                value: "production"
            }, {
                name: "APPX_MONGO_CONNECTOR_PORT",
                value: 3015
            }
        ]

    }
];

/*
**Function to process arguments provided by the user. If no arguments or
**incorrect arguments are provided then we default install.
*/
function processArgs() {
    if (args.length > 0) {
        if (!isNaN(args[0])) {
            if (args.length > 2) {
                customError("argument");
            }
            for (var i = 0; i < services.length; i++) {
                if (args[i]) {
                    services[i].env[2].value = args[i];
                }
                services[i].name = services[i].name.concat(args[i]);
                uninstallServices(services[i]);
            }
        } else {
            processServiceArg();
        }
    } else {
        console.log("No arguments received, using default settings for uninstall")
        for (var i = 0; i < services.length; i++) {
            services[i].name = services[i].name.concat(services[i].env[2].value);
            uninstallServices(services[i]);
        }
    }
}

/*
**Function to process service argument provided by the user. If incorrect
**argument is provided then we default install.
*/
function processServiceArg() {
    if (args.length > 3) {
        customError("argument");
    } else {
        switch (args[0]) {
            case "appx":
                if (args.length === 2) {
                    if (isNaN(args[1])) {
                        customError("port");
                    }
                    services[0].env[2].value = args[1];
                    services[0].name = services[0].name.concat(args[1]);
                    uninstallServices(services[0]);
                } else {
                    customError("argument");
                }
                break;
            case "mongo":
                if (args.length === 2) {
                    if (isNaN(args[1])) {
                        customError("port");
                    }
                    services[1].env[2].value = args[1];
                    services[1].name = services[1].name.concat(args[1]);
                    uninstallServices(services[1]);
                } else {
                    customError("argument");
                }
                break;
            default:
                customError("argument");
        }
    }
}

/*
**Function to throw error and abort program if to arguments are invalid or numbers are not provided for port arguments.
*/
function customError(mError) {
    var error;
    switch (mError) {
        case "port":
            error = "Error: Not a valid number, port arguments must be a valid number";
            break;
        case "argument":
            error = "Error: Invalid arguments. Check the examples and try again.";
            break;
    }
    throw (error);
}

function uninstallServices(mServices) {
    //Create new service object
    var svc = new Service(mServices);

    //Listen for Uninstall event.
    svc.on('uninstall', function () {
        console.log('Uninstall complete.');
        if (platform === "windows") {
            console.log(mServices.name + ' service exists: ' + svc.exists);
        } else {
            console.log(mServices.name + ' service exists: ' + svc.exists());
        }
    });

    //Runs uninstall
    svc.uninstall();
}

processArgs();
