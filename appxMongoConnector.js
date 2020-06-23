"use strict";

var mongoConnectorVersionStr = "6.0.0.20040817";
var mongoConnectorVersionNum = 60000.20040817;

const cluster = require('cluster');
const os = require('os');

//  *********************************************************
//  Configuration Section - Begin
//  *********************************************************

const connectorPort    = process.env.APPX_MONGO_CONNECTOR_PORT; // Port the appxConnector listens on for client connections
const workers          = os.cpus().length;                      // Number of worker processes spawned to listen for incoming connections

const sslEnabled       = true;                                 // Are we using SSL for our connections?
const sslPrivateKey    = "/etc/pki/tls/private/appx.com.key";       // SSL Privte Key file is using SSL
const sslCertificate   = "/etc/pki/tls/certs/appx.com.crt";     // SSL Certificate file if using SSL
const sslCertAuthority = "/etc/pki/tls/certs/ca-bundle.crt";    // SSL Certificate Authority file if using SSL

const mongoDatabase    = "AppxDatabaseCache";                   // The name of the database in Mongo we use to cache all of our data
const mongoPrefs       = "AppxUserPrefs";                       // The name of the database in Mongo we use to store user prefs
const mongoHost        = "localhost";                           // The hostname of the server mongo is running on
const mongoPort        = 27017;                                 // The port number on that server that mongo is listening on
const mongoLocale      = "en";
const appxdebug        = false;

//  *********************************************************
//  Configuration Section - End
//  *********************************************************

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
        dlog("appxMongoConnector Worker process started, pid: " + process.pid);
        process.title = "node appxMongoConnector.js worker #" + cluster.worker.id;
        workerCode();
    }
}

function masterCode() {
    //  *********************************************************
    //  Master process code
    //  *********************************************************

    if (workers > 0) {
        dlog("appxMongoConnector Master process running, pid: " + process.pid);

        for (let i = 0; i < workers; i++) {
            cluster.fork();
        }
    }
}

function workerCode() {

    /************************************************************
    Library Imports - Begin
    *************************************************************/

    var GridFSBucket = require('mongodb').GridFSBucket;
    var MongoClient = require('mongodb').MongoClient;
    var fs = require('fs');
    var { Readable } = require('stream');

    /************************************************************
        Library Imports - End
    *************************************************************/

    // Global variables and Objects

    var mongoUrl = 'mongodb://' + mongoHost + ':' + mongoPort + '/?maxpoolSize=20';
	var mongoOptions = {
		 useNewUrlParser: true,
		 useUnifiedTopology: true
	};
    var mongoCacheDb = null;
    var mongoUserPrefsDb = null;
    var mongoStatus = "Running";

    MongoClient.connect(mongoUrl, mongoOptions, function mongoClient_connectCallback(err, client) {
        if (err) {
            dlog("Error during connection: " + err);
            mongoStatus = "Error";
        } else {
            mongoCacheDb = client.db(mongoDatabase);
            mongoUserPrefsDb = client.db(mongoPrefs);
//            setInterval(databaseCleanup, 300000);/*Run database cleanup every 5 minutes*/
            createWebSocket();
        }
    });

    var buildMongoSelection = function buildMongoSelection(gridRequest) {
        var selection = [];
        var result = {};
        if (gridRequest["_search"] == "true") {
            var filters = JSON.parse(gridRequest.filters);
            var groupOp = "$" + filters.groupOp.toLowerCase();
            var rules = filters.rules;

            for (var i = 0; i < rules.length; i++) {
                var rule = rules[i];
                var field = rule.field;
                var op = rule.op;
                var data = rule.data;
                var mongo = {};
                var datatype = field.slice(-1);

                /*Change search fields back to correct fields, not sorting fields*/
                var colModelPosition = parseInt(field.substring(field.length - 2, field.length - 1)) - 3;
                var gridRequestPropertyIndex = "colModel[" + colModelPosition + "][index]";
                var gridRequestPropertyName = "colModel[" + colModelPosition + "][name]";

                if (field === gridRequest[gridRequestPropertyIndex]) {
                    field = gridRequest[gridRequestPropertyName];
                }

                if (datatype === "D") {
                    for (var key in gridRequest) {
                        if (gridRequest[key] === field && key.indexOf("index") !== -1) {
                            var tempKey = key.replace(/index/, "name");
                            if (gridRequest[tempKey] !== field) {
                                field = gridRequest[tempKey];
                            }
                        }
                    }
                }


                switch (datatype) {
                    case "I":
                        data = parseInt(data);
                        break;
                    case "F":
                        data = parseFloat(data);
                        break;
                    case "B":
		        var tmpdata = data.toLowerCase();
		        if( tmpdata == "y" || tmpdata == "1" || tmpdata == "t" || tmpdata == "true" || tmpdata == "yes" ) {
                            data = "Y";
			} else {
			    data = "N";
			}
                        break;
                }

                mongo[field] = {};

                /* Test for uppercase letters in search string. If search string
                 ** contains uppercase then we do case sensitive search. Otherwise
                 ** searches are case insensitive.*/
                if (/[A-Z]/.test(data) || !isNaN(data)) {
                    switch (op) {
                        case 'eq':
                            mongo[field]["$eq"] = data;
                            break;
                        case 'ne':
                            mongo[field]["$ne"] = data;
                            break;
                        case 'lt':
                            mongo[field]["$lt"] = data;
                            break;
                        case 'gt':
                            mongo[field]["$gt"] = data;
                            break;
                        case 'le':
                            mongo[field]["$lte"] = data;
                            break;
                        case 'ge':
                            mongo[field]["$gte"] = data;
                            break;
                        case 'nu':
                            mongo[field]["$eq"] = " ";
                            break;
                        case 'nn':
                            mongo[field]["$ne"] = " ";
                            break;
                        case 'bw':
                            mongo[field]["$regex"] = "^" + data;
                            break;
                        case 'ew':
                            mongo[field]["$regex"] = data + "$";
                            break;
                        case 'cn':
                            mongo[field]["$regex"] = data;
                            break;
                        case 'bn':
                            mongo[field]["$regex"] = "^(?!" + data + ").*";
                            break;
                        case 'en':
                            mongo[field]["$regex"] = ".*(?<!" + data + ")$";
                            break;
                        case 'nc':
                            mongo[field]["$regex"] = "^((?!" + data + ").)*$";
                            break;
                    }
                } else {
                    switch (op) {
                        case 'eq':
                            mongo[field]["$regex"] = "^(" + data + ")$";
                            break;
                        case 'ne':
                            mongo[field]["$regex"] = "^(?!" + data + ")$";
                            break;
                        case 'lt':
                            mongo[field]["$lt"] = data;
                            break;
                        case 'gt':
                            mongo[field]["$gt"] = data;
                            break;
                        case 'le':
                            mongo[field]["$lte"] = data;
                            break;
                        case 'ge':
                            mongo[field]["$gte"] = data;
                            break;
                        case 'nu':
                            mongo[field]["$eq"] = " ";
                            break;
                        case 'nn':
                            mongo[field]["$ne"] = " ";
                            break;
                        case 'bw':
                            mongo[field]["$regex"] = "^" + data;
                            break;
                        case 'ew':
                            mongo[field]["$regex"] = data + "$";
                            break;
                        case 'cn':
                            mongo[field]["$regex"] = data;
                            break;
                        case 'bn':
                            mongo[field]["$regex"] = "^(?!" + data + ").*";
                            break;
                        case 'en':
                            mongo[field]["$regex"] = ".*(?<!" + data + ")$";
                            break;
                        case 'nc':
                            mongo[field]["$regex"] = "^((?!" + data + ").)*$";
                            break;
                    }
                }

                if (mongo[field].hasOwnProperty("$regex")) {
                    mongo[field]["$options"] = "i";
                }

                selection.push(mongo);
            }

            result[groupOp] = selection;
        }

        return result;
    }

    var buildMongoSort = function buildMongoSort(gridRequest) {
        var sorter = {};
        var ord = 1;

        if (gridRequest.sidx && gridRequest.sidx.length > 0) {
            if (gridRequest.sord && gridRequest.sord == 'asc')
                sorter[gridRequest.sidx] = 1;
            else {
                sorter[gridRequest.sidx] = -1;
                ord = -1;
            }
        }

        /*If table was previously sorted we use that as a secondary sort*/
        if (Object.hasOwnProperty.call(gridRequest, "lastSortName[]") && gridRequest["lastSortName[]"].length >= 1) {
            for (var i = gridRequest["lastSortName[]"].length - 1; i >= 0; i--) {
                if (gridRequest["lastSortName[]"][i] !== gridRequest.sidx) {
                    if (gridRequest["lastSortOrder[]"] === undefined || gridRequest["lastSortOrder[]"][i] === "asc") {
                        sorter[gridRequest["lastSortName[]"][i]] = 1;
                    } else {
                        sorter[gridRequest["lastSortName[]"][i]] = -1;
                    }
                }
            }
        } else {
            sorter["initialSort"] = ord;
        }

        return sorter;
    }

    var fetchtabledata = function fetchtabledata(message, res) {
        // This code is full of nested callbacks.  We have to open the database, then 
        // in that callback we have to open the collection, then inside that callback we have to
        // process the count function, then in that callback we get the requested records, and inside 
        // that callback we send the records to the client.  Whew, that's a lot of callbacks.

        // We are in the OPEN callback
        try{
            mongoCacheDb.collection(message.collection, function mongoCacheDb_collectionCallback(err, collection) 
            {
                // We are in the GET COLLECTION callback
                var selection = buildMongoSelection(message);
                var sorter = buildMongoSort(message);
                var collist = {};
                var collistId2 = { id2: 1 };
                var caseSort = message.caseSort == "true";
                var collationOptions =  {};

                if( caseSort == false ) {
                    collationOptions["locale"] = mongoLocale;
                }

                if (collection !== undefined) {
                    if (message.collist) {
                        collist = JSON.parse(message.collist);
                    }

                    collection.createIndex(sorter, { collation: collationOptions });

                    collection.find( { $and: [ {"datalookupid": message.datalookupid}, selection]}, collistId2)
                        .collation(collationOptions)
                        .sort(sorter)
                        .toArray(function mongoCountCallback(err, items) 
                        {
                            if( err != undefined )
                                dlog("Error in mongoCountCallback: ", err);
                            var totalcount = (items === undefined || items == null) ? 0 : items.length;
                            var selectedRow = -1;
                            if( message.findId2 && totalcount > 0 ) {
                                for( var k = 0; k < totalcount; k++ ) {
                                    if( message.findId2 === items[k].id2 ) {
                                        selectedRow = k + 1;
                                        break;
                                    }
                                }
                            }
                            // We are in the COUNT results callback
                            collection.find({ $and: [{ "datalookupid": message.datalookupid}, selection]}, collist)
                                .collation(collationOptions)
                                .sort(sorter)
                                .skip((parseInt(message.page) - 1) * parseInt(message.rows))
                                .limit(parseInt(message.rows))
                                .toArray(function mongoFindCallback(err, items) 
                                    {
                                        // We are in the GET RECORDS callback
                                        var rowtmp = [];
                                        var result = {};
                                        
                                        if( err != undefined )
                                            dlog("Error in mongoFindCallback: ", err);

                                        result.records = parseInt(totalcount);
                                        result.page = parseInt(message.page);
                                        result.total = Math.ceil(parseInt(totalcount) / parseInt(message.rows));
                                        if( message.findId2 ) {
                                            result.findId2RowNo = selectedRow;
                                        }
                                        if (items) {
                                            for (var i = 0; i < items.length; i++) {
                                                rowtmp.push(items[i]);
                                            }
                                        }

                                        result["rows"] = rowtmp;
                                        res.end(JSON.stringify(result).replace(/[<][/]?p[>]/gi,""));
                                    });
                            });
                } else {
                    dlog("Error getting table data: " + err);
                }
            });
        } catch (e) {
            dlog("ERROR: connecting to db");
            dlog(e);
            dlog(e.stack);
        }
    };

    var fetchtabledataOld = function fetchtabledataOld(message, res) {
        // This code is full of nested callbacks.  We have to open the database, then 
        // in that callback we have to open the collection, then inside that callback we have to
        // process the count function, then in that callback we get the requested records, and inside 
        // that callback we send the records to the client.  Whew, that's a lot of callbacks.

        // We are in the OPEN callback
        try {
            mongoCacheDb.collection(message.collection, function mongoCacheDb_collectionCallback(err, collection) {
                // We are in the GET COLLECTION callback
                var selection = buildMongoSelection(message);
                var sorter = buildMongoSort(message);
                var collist = {};

                if (collection !== undefined) {
                    if (message.collist) {
                        collist = JSON.parse(message.collist);
                    }

                    collection.createIndex(sorter);

                    collection.find({
                        $and: [{
                            "datalookupid": message.datalookupid
                        }, selection]
                    }).count(function mongoCountCallback(err, totalcount) {
                        // We are in the COUNT results callback 
                        collection.find({
                            $and: [{
                                "datalookupid": message.datalookupid
                            }, selection]
                        }, collist).sort(sorter).skip((parseInt(message.page) - 1) * parseInt(message.rows)).limit(parseInt(message.rows)).toArray(function mongoFindCallback(err, items) {
                            // We are in the GET RECORDS callback
                            var rowtmp = [];
                            var result = {};

                            result.records = parseInt(totalcount);
                            result.page = parseInt(message.page);
                            result.total = Math.ceil(parseInt(totalcount) / parseInt(message.rows));

                            if (items) {
                                for (var i = 0; i < items.length; i++) {
                                    rowtmp.push(items[i]);
                                }
                            }

                            result["rows"] = rowtmp;
                            res.end(JSON.stringify(result));
			    dlog(Date.now() + " - Sent grid date reply <<<<<<<");
                        });
                    });
                } else {
                    dlog("Error getting table data: " + err);
                }
            });
        } catch (e) {
            dlog("ERROR: connecting to db");
            dlog(e);
            dlog(e.stack);
        }
    };

    var getuserprefs = function getuserprefs(message, res) {
        var myQuery = { _id: message.prefKey };
        mongoUserPrefsDb.collection(message.prefType).findOne( myQuery, function( err, result ){
            if( err ) {
                dlog("getUserPrefs() find failed, err="+err, message);
                var reply = { result: "failed" }
                res.end(JSON.stringify(reply));
            }
            else {
                if( result ) { 
                var reply = { result: "ok", prefData: result.prefData }
                res.end(JSON.stringify(reply));
                }
                else {
                var reply = { result: "ok", prefData: "{}" }
                res.end(JSON.stringify(reply));
                }
            }
            });
    }

    var setuserprefs = function setuserprefs(message, res) {
	var myQuery = { _id: message.prefKey };
	mongoUserPrefsDb.collection(message.prefType).deleteOne( myQuery, function( err, result ){
		if( err ) {
		    dlog("setUserPrefs() delete failed, err="+err, message);
		}
		if( message.prefData !== '{}' ) {
		    var myQuery = { _id: message.prefKey, prefData: message.prefData };
		    mongoUserPrefsDb.collection(message.prefType).insertOne( myQuery, function( err, obj ) {
			    if( err ) {
				dlog("setUserPrefs() insert failed, err="+err, message);
				var reply = { result: "ok" }
				res.end(JSON.stringify(reply));
			    }
			});
		}
		else {
		    var reply = { result: "ok" }
		    res.end(JSON.stringify(reply));
		}
	    });
    }

    var fetchtabledata_findrow = function fetchtabledata_findrow(message, res) {
            mongoCacheDb.collection(message.collection, function mongoCacheDb_collectionCallback(err, collection) {
                // We are in the GET COLLECTION callback
                var selection = buildMongoSelection(message);
                var sorter = buildMongoSort(message);
                var collist = { id2: 1 };

                if (collection !== undefined) {
                        // We are in the COUNT results callback 
                        collection.find({
                            $and: [{
                                "datalookupid": message.datalookupid
                            }, selection]
                        }, collist).sort(sorter).toArray(function mongoFindRowCallback(err, items) {
                            // We are in the GET RECORDS callback
                            var result = {};
			    var j;
			    var rowNo = -1;

			    for( j = 0; j < items.length; j++ ) {
				if( items[j].id2 === message.findId2 ) {
				    rowNo = j;
				    break;
				}
			    }

                            result.records = items.length;
                            result.rowNo = rowNo;

                            res.end(JSON.stringify(result));
                        });
                } else {
                    dlog("Error getting table data: " + err);
                }
            });
    }

    /**
     * Export table data to  CSV file for download
     *
     * @param message: The postData from the client telling us what to export
     * @param res: http response from browser
     */
    var fetchtabledata_csv = function fetchtabledata_csv(message, res) {

	    // Helper to add a leading zero if needed
        function zeroFill( i ) {
            return  i < 10  ? '0' + i : '' + i;
        }

        // Helper to create a raw date/time string from a date object
        function getDateStr( dateObj ) {
            let result = dateObj.getFullYear().toString() +
            zeroFill( dateObj.getMonth()   ) +
            zeroFill( dateObj.getDay()     ) + "-" +
            zeroFill( dateObj.getHours()   ) +
            zeroFill( dateObj.getMinutes() ) +
            zeroFill( dateObj.getSeconds() );
            return result;
        }

        // Helper to convert a value to CSV compatible format
        function itemToCsv( itemName, itemValue ) {
            let isStr = itemName == null || itemName == undefined || itemName.match(/A$/) ? true : false;
            if( isStr === false ) 
            return itemValue.trim();
            if( itemValue.indexOf('"') > -1 || itemValue.indexOf(',') > -1 || itemValue.indexOf('\n') > -1 || itemValue.indexOf('\r') > -1 ) {
            return '"'+itemValue.replace(/["]/g,'""')+'"';
            }
            return itemValue.trim();
        }

        try{
            mongoCacheDb.collection(message.collection, function mongoCacheDb_collectionCallback(err, collection) {

                // If we didn't get a collection error out
                if (collection === undefined) {
                    let result = { "status": false, "url": "" };
                    res.end(JSON.stringify(result));
                }

                // We are in the GET COLLECTION callback
                var selection = buildMongoSelection(message);
                var sorter = buildMongoSort(message);
                var collist = {};
                var csvHeader = "";
                //add collation 
                var caseSort = message.caseSort == "true";
                var collationOptions =  {};

                if( caseSort == false ) {
                    collationOptions["locale"] = mongoLocale;
                }
                //make sort column indexed so mongo doesnt overflow
                collection.createIndex(sorter, { collation: collationOptions });

                // Let's put together a subset of field names and labels to requet from the database		
                let csvList = [];
                message.colModel.forEach(function(item){
                    if( (item.hidden === undefined || item.hidden === false) && item.name !== "rn" ) {
                        // Build out list of columns to request from our mongo table
                        collist[item.name] = 1;
                        // Build a list to use names/labels to use in building out CSV records
                        csvList.push( { 
                        name:  item.name, 
                        label: item.label && item.label.length > 0 ? item.label : item.name 
                        });
                    }
                });

                // Let's set up our GridFSBucket to hold out CSV file
                let fileName = "tableExport-" + getDateStr( new Date() ) + ".csv";
                let gb = new GridFSBucket(mongoCacheDb, { bucketName: message.collection });
                let rStream = new Readable({ read(size) {  } });
                let uploadStream = gb.openUploadStream(fileName);
                uploadStream.options.metadata = {
                    'url': "/getFile/" + message.collection + "/" + fileName,
                    'id': uploadStream.id
                };

                // Add a finish handler to send the result after the CSV file is completely written
                uploadStream.once("finish", function uploadStream_onceFinish_csv() {
                    let result = { "status": true, "url": "/getFile/"+message.collection+"/"+fileName };
                    res.end(JSON.stringify(result));
                });

                // Add a stream pipe to make it easier to write CSV data into our gridfs file
                rStream.pipe(uploadStream);

                // Create and write the CSV header record
                csvList.forEach(function (item) {
                    if( csvHeader.length > 0 )
                        csvHeader += ",";
                    csvHeader += itemToCsv( null, item.label );
                });
                rStream.push(csvHeader + '\n');
                collection.find({ $and: [{"datalookupid": message.datalookupid}, selection] }, { projection: collist } )
                          .collation(collationOptions)
                          .sort(sorter)
                          .toArray(function mongoFindCallback(err, rows) 
                {
                    if(err != undefined)
                        dlog("Error: csv to array error",err);
                    // We have data, parse through each item
                    if (rows) {
                        for (var i = 0; i < rows.length; i++) {
                        
                            // Build a CSV data record
                            let csvRec = "";
                            let comma = "";
                            csvList.forEach(function (item) {
                                csvRec += comma + itemToCsv(item.name,rows[i][item.name]);
                                comma = ",";
                            });
                            rStream.push(csvRec + "\n");
                        }
                    }
                    rStream.push(null);

                }); // toArray()
            }); // collection()

        } catch (e) {
            dlog("ERROR: connecting to db");
            dlog(e);
            dlog(e.stack);
        }
    };

    /**
     * Get list of record keys for range selection
     *
     * @param message: The postData from the client telling us what keys to get
     * @param res: http response from browser
     */
    var fetchrangeofkeys = function fetchrangeofkeys(message, res) {

        try {
            mongoCacheDb.collection(message.collection, function mongoCacheDb_collectionCallback(err, collection) {
		// If we didn't get a collection error out
		if (collection === undefined) {
		    let result = { "status": false, "keys": [] };
		    res.end(JSON.stringify(result));
		}

                // We are in the GET COLLECTION callback
                var selection = buildMongoSelection(message);
                var sorter = buildMongoSort(message);
                var collist = { "_id": false, "id2": true };
		var keylist = [];
		var keyBeg = message.keyBeg;
		var keyEnd = message.keyEnd;

		collection.find({ $and: [{"datalookupid": message.datalookupid}, selection] }, { projection: collist } )
		          .sort(sorter)
		          .toArray(function mongoFindCallback(err, rows) {
				  // We have data, parse through each item until we hit the end of the range
				  if (rows) {
				      for (var i = 0; i < rows.length; i++) {

					  if( keyBeg == undefined || keyEnd == undefined ) {
					      keylist.push(rows[i]["id2"]);
					  }

					  if( keyBeg != undefined && keyBeg == rows[i]["id2"] ) {
					      keyBeg = undefined;
					      if( keyEnd == undefined ) {
						  break;
					      }
					      else {
						  keylist.push(rows[i]["id2"]);
					      }
					  }
					  
					  if( keyEnd != undefined && keyEnd == rows[i]["id2"] ) {
					      keyEnd = undefined;
					      if( keyBeg == undefined ) {
						  break;
					      }
					      else {
						  keylist.push(rows[i]["id2"]);
					      }
					  }
				      }
				  }

				  let result = { "status": true, "keys": keylist };
				  res.end(JSON.stringify(result));

			  }); // toArray()
		}); // collection()

        } catch (e) {
            dlog("ERROR: connecting to db");
            dlog(e);
            dlog(e.stack);
        }
    };

    function createWebSocket() {
        if (sslEnabled)
            var https = require('https');
        else
            var https = require('http');

        function processDataRequest(req, res) {
            var postData = "";
            var query;
            var url = require('url');
            var url_parts = url.parse(req.url, true);

            /*Options is sent for CORS, when there is headers attached to request. Use this to reply so request
             **doesn't time out*/
            if (req.method === "OPTIONS") {
                res.writeHead("200", {
                    "Access-Control-Allow-Origin": req.headers.origin,
                    "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-type, Accept, X-Custom-Header, X-Requested-With"
                });
                res.end();
            }
            else if (req.method === "POST") {
                if (url_parts.pathname.indexOf("/upload/") != -1) {
                    /*If we are sending file to be uploaded to mongo*/
                    var fgb = url_parts.pathname.substring(url_parts.pathname.indexOf("/upload/") + 8);
		            fgb = fgb.substring(0, fgb.indexOf("/"));
                    var skipLen = fgb.length + 9;
                    var gb = new GridFSBucket(mongoCacheDb, {
                        bucketName: fgb
                    });
                    var fileName = url_parts.pathname.substring(url_parts.pathname.indexOf("/upload/") + skipLen);
                    var uploadStream = gb.openUploadStream(fileName);

                    uploadStream.on("error", function uploadStream_onError(error) {
                        dlogForce("appxMongoConnector /upload/ ERROR filename="+uploadStream.filename+", length="+uploadStream.length+", error="+error,uploadStream.state);
                        res.writeHead("500", {
                            'Access-Control-Allow-Origin': '*',
                            'Bucket': fgb
                        });

                        res.write("Error uploading file to mongo database");
                        dlog(error);
                        uploadStream = null;
                    });
                    uploadStream.once("finish", function uploadStream_onceFinish() {
                        dlogForce("appxMongoConnector /upload/ FINISH filename="+uploadStream.filename+", length="+uploadStream.length);
                        res.writeHead("201", {
                            'Access-Control-Allow-Origin': '*',
                            'Bucket': fgb
                        });

                        res.end();
                    });
                    req.pipe(uploadStream);
                } else if (url_parts.pathname.indexOf("/userPrefs/") != -1) {
                    /*Upload user preferences to mongo. Currently only saved table preferences*/
                    var fgb = url_parts.pathname.substring(url_parts.pathname.indexOf("/userPrefs/") + 11);
		            fgb = fgb.substring(0, fgb.lastIndexOf("/"));
                    var gb = new GridFSBucket(mongoUserPrefsDb, {
                        bucketName: fgb
                    });

                    gb.drop(function drop_error(error) {
                        upload();
                    });

                    function upload() {
                        var uploadStream = gb.openUploadStream(fgb);

                        uploadStream.on("error", function uploadStream_onError(error) {
                            res.writeHead("500", {
                                'Access-Control-Allow-Origin': '*',
                                'Bucket': fgb
                            });

                            res.write("Error uploading file to mongo database");
                            dlog("Error uploading file to mongo database");
                            dlog(error);
                            uploadStream = null;
                        });
                        uploadStream.once("finish", function uploadStream_onceFinish() {
                            res.writeHead("201", {
                                'Access-Control-Allow-Origin': '*',
                                'Bucket': fgb
                            });

                            res.end();
                        });

                        req.pipe(uploadStream);
                    }
                } else {
                    req.on("data", function req_onDataCallback(chunk) {
                        postData += chunk.toString();
                    });

                    req.on("end", function req_onEndCallback() {
                        if( req.headers["content-type"] === "application/json" ) {
                            query = JSON.parse(postData);
                        }
                        else {
                            var qString = require("querystring");
                            query = qString.parse(postData);
                        }
                                    getData();
                    });
                }
            } else if (req.method === "HEAD") {



            } else {
                query = url_parts.query;
                getData();
            }

            function getData() {
                var mime = require('mime');

                /*Create a readable stream to pass the chunks into, for piping to mongo*/
                var rStream = new Readable({
                    read() {}
                });

                /*
                 **Function send HTTP error back to browser for display.
                 **
                 **@param mRes: Response to http request
                 */
                function fileNotFound() {
                    /*If file is not found, then we return a file not found
                     **error*/
                    res.writeHead(404, {
                        'Content-Type': 'text/plain'
                    });

                    res.write('404 Not Found\n');
                    res.end();
                }

                if (url_parts.pathname.indexOf('/getGridData') != -1) {
                    res.writeHead(200, {
                        'Access-Control-Allow-Origin': '*',
                        'Content-Type': 'application/json'
                    });
		            dlog(Date.now() + " - Got request for grid data... ");
                    fetchtabledata(query, res);

                }
                if (url_parts.pathname.indexOf('/getGridFindRow') != -1) {
                    res.writeHead(200, {
                        'Access-Control-Allow-Origin': '*',
                        'Content-Type': 'application/json'
                    });
		            dlog(Date.now() + " - Got request for grid findrow... ");
                    fetchtabledata_findrow(query, res);

                }
		else if (url_parts.pathname.indexOf('/getGridCsv') != -1) {
		    res.writeHead(200, {
			    'Access-Control-Allow-Origin': '*',
				'Content-Type': 'application/json'
				});
		    
		    fetchtabledata_csv(query, res);
		}
		else if (url_parts.pathname.indexOf('/getRangeKeys') != -1) {
		    res.writeHead(200, {
			    'Access-Control-Allow-Origin': '*',
				'Content-Type': 'application/json'
				});
		    
		    fetchrangeofkeys(query, res);
		}
		else if (url_parts.pathname.indexOf('/setUserPrefs') != -1) {
		    res.writeHead(200, {
			    'Access-Control-Allow-Origin': '*',
				'Content-Type': 'application/json'
				});
		    
		    setuserprefs(query, res);
		}
		else if (url_parts.pathname.indexOf('/getUserPrefs') != -1) {
		    res.writeHead(200, {
			    'Access-Control-Allow-Origin': '*',
				'Content-Type': 'application/json'
				});
		    
		    getuserprefs(query, res);
		}
		else if (url_parts.pathname.indexOf("/getResource/") != -1) {
                    gb = new GridFSBucket(mongoCacheDb, {
                        bucketName: "resource"
                    });

                    var fileName = encodeURI(url_parts.pathname.substring(url_parts.pathname.indexOf("/getResource/") + 13));
                    var downloadStream = gb.openDownloadStreamByName(fileName);
                    var mimeType = mime.getType(fileName);

                    res.writeHead(200, {
                        'Access-Control-Allow-Origin': '*',
                        'Content-Type': mimeType,
                        'Cache-Control': 'max-age=31536000'
                    });

                    rStream.pipe(res);

                    downloadStream.on("error", function downloadStream_onError() {
                        fileNotFound(res);
                    });

                    downloadStream.on("data", function downloadStream_onData(data) {
                        rStream.push(Buffer.from(data));
                    });

                    downloadStream.on("end", function downloadStream_onEnd() {
                        rStream.push(null);
                    });

        } else if (url_parts.pathname.indexOf("/getFile/") != -1) {

                    /*If we pushed file into mongo to be displayed in the browser or use
                     **the browser to save file to client*/
                    var fgb = url_parts.pathname.substring(url_parts.pathname.indexOf("/getFile/") + 9);
		            fgb = fgb.substring(0, fgb.indexOf("/"));
                    var skipLen = fgb.length + 10;
		    dlog("fgb collection="+fgb);
                    var gb = new GridFSBucket(mongoCacheDb, {
                        bucketName: fgb
                    });
                    var contentType = 'application/octet-stream';
                    var fileName = url_parts.pathname.substring(url_parts.pathname.indexOf("/getFile/") + skipLen);
		    dlog("filename="+fileName);
                    if (url_parts.pathname.indexOf("pushAndOpen") > -1) {
                        contentType = mime.getType(fileName);
                    }
                    var mimeType = mime.getType(fileName);

                    res.writeHead(200, {
                        'Access-Control-Allow-Origin': '*',
			    'Content-Type': mimeType, // contentType
                        'Cache-Control': 'max-age=31536000'
                    });

                    rStream.pipe(res);

                    var downloadStream = gb.openDownloadStreamByName(fileName);

                    downloadStream.on("error", function downloadStram_onError() {
                        fileNotFound(res);
                    });

                    downloadStream.on("data", function downloadStream_onData(data) {
                        rStream.push(Buffer.from(data));
                    });

                    downloadStream.on("end", function downloadStream_onEnd() {

                        if (this.s.file !== null && this.s.file._id !== null) {
                            var id = this.s.file._id;
                            gb.delete(id);
                        }

                        rStream.push(null)
                    });

        } else if (url_parts.pathname.indexOf("/userPrefs/") != -1) {
                    /*Grab user preferences stored in mongo and send down to client*/
                    var fgb = url_parts.pathname.substring(url_parts.pathname.indexOf("/userPrefs/") + 11);
		            fgb = fgb.substring(0, fgb.lastIndexOf("/"));

                    var gb = new GridFSBucket(mongoUserPrefsDb, {
                        bucketName: fgb
                    });

                    res.writeHead(200, {
                        'Access-Control-Allow-Origin': '*',
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-cache, no-store, must-revalidate'
                    });

                    rStream.pipe(res);

                    var filesQuery = mongoUserPrefsDb.collection(fgb + ".files").find({
                        filename: fgb
                    });
                    filesQuery.toArray(function (error, docs) {
                        if (error) {
                            dlog("Resource handler query.toArray error: " + error);
                            pushEmpty();
                        }

                        if (docs.length > 0) {

                            var downloadStream = gb.openDownloadStreamByName(fgb);
                            downloadStream.on("error", function downloadStream_onError() {
                                pushEmpty();
                            });

                            downloadStream.on("data", function downloadStream_onData(data) {
                                rStream.push(Buffer.from(data));
                            });

                            downloadStream.on("end", function downloadStream_onEnd() {
                                rStream.push(null);
                            });

                        } else {
                            pushEmpty();
                        }

                    });

                    function pushEmpty() {
                        rStream.push(Buffer.from("{}"));
                        rStream.push(null);
                    }
        }
            }
        }

        // Configure the websocket
        if (sslEnabled) {

            var options = {
                key: fs.readFileSync(sslPrivateKey),
                cert: fs.readFileSync(sslCertificate),
                ca: fs.readFileSync(sslCertAuthority)
            };

            https.createServer(options, function https_createServerCallback(req, res) {
                processDataRequest(req, res);
            }).listen(connectorPort);

        } else {

            https.createServer(function https_createServerCallback(req, res) {
                processDataRequest(req, res);

            }).listen(connectorPort);
        }
    }

    /*
    **Function to check mongodb for collections that have no open processes
    **and remove the collections from database
    */
    function databaseCleanup() {
        mongoCacheDb.listCollections().toArray(function (err, items) {
            const exec = require('child_process').exec;
            let collName = [];
            let cmd = '';
            var processes;
            for (var i = 0; i < items.length; i++) {
                var name = items[i].name;
                if (!isNaN(name)) {
                    collName.push(name);
                }
            }
            switch (process.platform) {
                case 'win32':
                    cmd = "tasklist";
                    break;
                case 'darwin':
                case 'linux':
                    cmd = "ps ax";
                    break;
                default:
                    cmd = "ps ax";
                    break;
            }
            exec(cmd, (err, stdout, stderr) => {
                for (var i = 0; i < collName.length; i++) {
                    if (stdout.indexOf(collName[i]) === -1) {
                        mongoCacheDb.dropCollection(collName[i], {}, function (err) {
                            if (err) {
                                dlog(err);
                            }
                        });
                    }
                }
            });
        });
    }
}
