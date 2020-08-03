/**************************************************************
 ***** Creates APPX Connector service process for Windows, *****
 ************** Linux, and Mac operating systems ***************
 **************************************************************/

/*
###############################################################################
###############################################################################
@usage: node appxConnector-install [appx | mongo] [appxport] [mongoport]
@example 1: node appxConnector-install appx 3014
@example 2: node appxConnector-install mongo 3015
@example 4: node appxConnector-install 3016 3017
@example 4: node appxConnector-install
###############################################################################
@Code defaults: if only 1 port is provided we will default port for 
appxConnector. If no first argument is provided we will default to install both
connectors.
@IMPORTANT: Ports must be numbers
###############################################################################
###############################################################################
*/

var serverConnectorInstallVersionStr = "6.0.0.20072712";
var serverConnectorInstallVersionNum = 60000.20072712;

var args = process.argv.slice(2);
var exec = require('child_process').execSync;
var Service;
var fs = null;

var vObj = {};
/*Minimum versions required*/
var vTestObj = {
    node: "6.0.0",
    mongoServer: "2.6",
    mongoNode: "3.0"
}
var allReqInstalled = true;
var modules = [
    'atob',
    'crypto',
    'fs',
    'hexy',
    'http',
    'https',
    'iconv-lite',
    'mime',
    'mongodb',
    'net',
    'node-cryptojs-aes',
    'semver-compare',
    'streamifier',
    'string-strip-html',
    'string_decoder',
    'url',
    'ws'
];
var services = [
    {
        name: 'appxConnector',
        description: 'Connector that allows appx client to talk to server.',
        user: 'root',
        group: 'root',
        script: 'appxConnector.js',
        cwd: require('path').resolve(__dirname),
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
        description: 'Connector that allows browser to make requests to mongo database.',
        wants: 'mongod.service',
        after: 'network.target mongod.service',
        user: 'root',
        group: 'root',
        script: 'appxMongoConnector.js',
        cwd: require('path').resolve(__dirname),
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
            }
            installService(0, true);
        } else {
            processServiceArg();
        }
    } else {
        console.log("No arguments received, using default settings for install")
        for (var i = 0; i < services.length; i++) {
            services[i].name = services[i].name.concat(services[i].env[2].value);
        }
        installService(0, true);
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
                    installService(0, false);
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
                    installService(1, false);
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
**
**@param mError: Type of error that occured.
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

/*
**Function that detects OS and sets the Service variable accordingly.
**
**@param mInitial: If initial run for pushing value into module check array
**@param callback: return to callback function
**
*/
function checkPlatform(mInitial, callback) {
    switch (process.platform) {
        case 'win32':
            if (mInitial) {
                modules.push("node-windows");
            } else {
                Service = require('node-windows').Service;
            }
            break;
        case 'darwin':
            if (mInitial) {
                modules.push("node-mac");
            } else {
                Service = require('node-mac').Service;
            }
            break;
        case 'linux':
        default:
            if (mInitial) {
                modules.push("node-linux");
            } else {
                Service = require('node-linux').Service;
            }
    }
    callback();
}

/*
**Function to start the testing and handling whether required modules are installed on
**the system.
*/
function moduleTest() {
    console.log("");
    console.log("Checking for required modules...");

    modules.forEach(function (name) {
        if (!testForModule(name))
            allReqInstalled = false;
    });

    console.log("");

    if (!allReqInstalled) {
        console.log("Missing modules.  Please install required modules and run again.");
        process.exit();
    } else {
        checkPlatform(false, function checkPlatform_Callback() {
            checkMongo(function checkMongo_callback() {
                versionTest(function versionTest_callback() {
                    processArgs();
                });

            });
        });
    }
}

/*
**Function to test for appropriate versions of nodejs, mongodb, & mongodb nodejs api.
**
**@param callback: return to callback function
*/
function versionTest(callback) {
    console.log("");
    var err = false;
    var semver = require('semver-compare')
    vObj.node = process.version.replace(/[^0-9.]/gi, "");
    var tempArray = exec('npm list --depth=0').toString().replace(/[^a-zA-Z0-9@.\n]/gi, "").split("\n");
    for (var i = 0; i < tempArray.length; i++) {
        if (tempArray[i].indexOf("mongodb") > -1) {
            vObj.mongoNode = tempArray[i].replace(/[^0-9.]/gi, "");
            break;
        }
    }
    for (var ver in vObj) {
        if (semver(vObj[ver], vTestObj[ver]) < 1) {
            console.log("Minimum version of " + ver + " required is: " + vTestObj[ver] + ", your version is: " + vObj[ver] + " please update version.")
            err = true;
        }
    }
    if (err) {
        process.exit();
    }
    console.log("");
    callback();
}

/*
**Function to install the services
**
**@param mService: service to be started
**@param mBoth: boolean to check if both services are being installed or just one
*/
function installService(mService, mBoth) {
    //Create new service object
    var svc = new Service(services[mService]);

    //Installs service
    svc.on('alreadyinstalled', function () {
        console.log("Already installed, restarting " + services[mService].name + " service...");
        svc.stop();
        svc.start();
    });

    svc.on('install', function () {
        console.log("Installing " + services[mService].name + " service...");
        setTimeout(function () {
            svc.start();
        }, 5000);

        console.log("Done... Waiting on service to start...");
    });

    svc.on('start', function () {
        console.log("Service " + services[mService].name + " started");
        
        // Run 'systemctl enable' so the service will autostart 
        //var exec = require('child_process').exec;
        //var cmd = 'systemctl enable '+services[mService].name.toLowerCase();
        //console.log('Running %s...', cmd);
        //exec(cmd,function(err){ console.log('Error: %s...', err); });
        
        if (++mService < services.length && mBoth) {
            installService(mService);
        } else {
            process.exit()
        }

    });

    svc.install();
}

/*
**Function to check the system to see if the module is installed.
**
**@param mName: name of module to check for
**
**@return boolean: If module was installed.
*/
function testForModule(mName) {
    var nameStr = mName + "                              ";
    process.stdout.write("Module: " + nameStr.substring(0, 25) + " - ");
    try {
        if (require.resolve(mName)) {
            console.log("Installed.");
            return true;
        }
        else {
            console.log("Missing, please run 'npm install " + mName + "' to install.");
            return false;
        }
    } catch (ex) {
        console.log("Missing, please run 'npm install " + mName + "' to install.");
        return false;
    }
}

/*
**Function to check and see if mongo is running before starting the installer. If
**mongo is not running we give user message and stop the install.
*/
function checkMongo(callback) {
    var mongoDatabase = "AppxDatabaseCache";
    var mongoHost = "localhost";
    var mongoPort = 27017;
    var MongoClient = require('mongodb').MongoClient;
    var MongoServer = require('mongodb').Server;
    var mongoUrl = 'mongodb://' + mongoHost + ':' + mongoPort + '/' + mongoDatabase;
	var mongoOptions = {
		 useUnifiedTopology: true
	};
    var mongoCacheDb = null;

    MongoClient.connect(mongoUrl, mongoOptions, function (err, client) {
        if (err) {
            console.log("Unable to connect to MongoDatabase Server. Make sure MongoDB server has been installed, configured, and started on your server before continuing. This is a separate setup from installing the \"Node.js MongoDB driver API\" using 'npm install mongodb'. You need to visit the website and follow the instructions for installing the server. (https://www.mongodb.org/downloads)");
            process.exit();
        } else {
            var admin = client.db("AppxDatabaseCache").admin();
            admin.serverStatus(function serverStatus(err, info) {
                if (err) {
                    process.exit();
                } else {
                    vObj.mongoServer = info.version
                    callback();
                }
            });
        }
    });
}

function replaceFile( dstFile, srcFile ) {
    fs.stat(srcFile, function (err, stats) {
        if (err === null) {
	    fs.stat(dstFile, function (err, stats) {
		if (err === null) {
		    fs.createReadStream(srcFile).pipe(fs.createWriteStream(dstFile));
		}
		else {
		    console.log("replaceFile() failed, dstFile: "+err);
		}
	    });
	}
	else {
	    console.log("replaceFile() failed, srcFile: "+err);
	}
    });
}

/*Start running script by calling the checkPlatform function*/
checkPlatform(true, function checkPlatform_Callback() {
	fs = require('fs');
	
	// For windows, the 'node-windows' package is no longer maintained so we need to update that package
	//	with a newer version of the 'winsw.exe' binary and the script file 'daemon.js'
	if (process.platform == 'win32') {
		fs.copyFile('winsw-2.3.0-bin.exe', './node_modules/node-windows/bin/winsw/winsw.exe', (err) => {
			if (err) throw err;
			console.log('winsw.exe was updated for node-windows');
		});	
		fs.copyFile('daemon.js', './node_modules/node-windows/lib/daemon.js', (err) => {
			if (err) throw err;
			console.log('daemon.js was updated for node-windows');
		});
	}
    
    var file = "appx-client-automaticLogin.js";
    fs.stat(file, function (err, stats) {
        if (err !== null) {
            fs.createReadStream("appx-client-automaticLoginTemplate.js").pipe(fs.createWriteStream(file));
        }
    });

    // For linux, we need to copy a custom service file template into place and since the 'node-linux' package
    //  is no longer maintained so we need to update that package with a newer version of the script files 'daemon.js', 'systemd.js' and 'systemv.js'
    if (process.platform == "linux") {
    	replaceFile( "node_modules/node-linux/lib/templates/systemd/service", "systemd/service" );
    	replaceFile( "node_modules/node-linux/lib/templates/systemd/service-wrapper", "systemd/service-wrapper" );
		fs.copyFileSync('./systemd/daemon.js', './node_modules/node-linux/lib/daemon.js');
		fs.copyFileSync('./systemd/systemd.js', './node_modules/node-linux/lib/systemd.js');
		fs.copyFileSync('./systemd/systemv.js', './node_modules/node-linux/lib/systemv.js');
    }
    
    moduleTest();
});
