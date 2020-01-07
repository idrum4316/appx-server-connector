
/*********************************************************************
 **
 **   server/appx-client-session.js - Client Session processing
 **
 **   This module contains code to process client sessions.
 **
 *********************************************************************/

// what_str =  "@(#)Appx $Header: /src/cvs/appxHtml5/server/appx-client-session.js,v 1.81 2018/08/15 19:30:14 jnelson Exp $";

"use strict";
//this function can be bound to a login's screen's button click event to handle logging into the appx server
function start_session() {

    /*Only start session if all required fields have been populated*/
    if (sessionVariableInit()) {
        appxSetStatusStateText(APPX_STATE_BUSY);
        $("#appx-status-msg").text("Connecting...\n\n");
        if ($('meta[name=appx-allow-specific]').attr("content") === "true") {
            var queryStringVariables = parseQueryString();
            if (queryStringVariables.hasOwnProperty("specific")) {
                $($('meta[name=appx-use-specific]')[0]).attr("content", queryStringVariables.specific);
            }
            if ($('meta[name=appx-use-specific]').attr("content") === "true") {
                startSpecificProcess(true);
                return;
            }
        }

        sendappxlogin(appxLoginFormHost, appxLoginFormPort, appxLoginFormUser, appxLoginFormPswd, appxLoginFormRows, appxLoginFormCols);
    }
}

/*
**Function to take user to session management screen upon login
*/
function session_management() {
    if (sessionVariableInit()) {
        appxSetStatusStateText(APPX_STATE_BUSY);
        $("#appx-status-msg").text("Connecting to session management...\n\n");
        var si = {};
        si.runApplication = "0LA";
        si.runDatabase = "   ";
        si.runProcessType = "INPUT";
        si.runProcess = "SESSION_MANAGEMENT";
        si.filler = "";
        if ($("#appx_server").val()) appxLoginFormHost = $("#appx_server").val();
        if ($("#appx_port").val()) appxLoginFormPort = $("#appx_port").val();
        if ($("#appx_username").val()) appxLoginFormUser = $("#appx_username").val();
        if ($("#appx_password").val()) appxLoginFormPswd = $("#appx_password").val();
        if ($("#appx_rows").val()) si.screenRows = $("#appx_rows").val();
        if ($("#appx_cols").val()) si.screenColumns = $("#appx_cols").val();

        sendappxnewsessionlogin(appxLoginFormHost, appxLoginFormPort, appxLoginFormUser, appxLoginFormPswd, si);
    }
}

/*
**Function to take user to specific process upon login
**
**@param loginRequired: Boolean whether user has to login or can use automatic login 
*/
function startSpecificProcess(loginRequired) {
    if (!loginRequired || sessionVariableInit()) {
        appxSetStatusStateText(APPX_STATE_BUSY);
        appxClearStatusMsgText();
        $("#appx-status-msg").text("Connecting to session management...\n\n");
        var si = {};
        si.filler = "";
        var siInit = true;
        if (loginRequired) {
            if ($("#appx_server").val()) appxLoginFormHost = $("#appx_server").val();
            if ($("#appx_port").val()) appxLoginFormPort = $("#appx_port").val();
            if ($("#appx_username").val()) appxLoginFormUser = $("#appx_username").val();
            if ($("#appx_password").val()) appxLoginFormPswd = $("#appx_password").val();
        } else {
            appxLoginFormUser = $('meta[name=appx-auto-user]').attr("content");
            appxLoginFormPswd = $('meta[name=appx-auto-pswd]').attr("content");
            appxLoginFormHost = $('meta[name=appx-auto-host]').attr("content");
            appxLoginFormPort = $('meta[name=appx-auto-port]').attr("content");
        }

        if ($("#appx_rows").val()) si.screenRows = $("#appx_rows").val();
        if ($("#appx_cols").val()) si.screenColumns = $("#appx_cols").val();
        if ($("meta[name=appx-allow-specific]").attr("content") === "true" &&
            $("meta[name=appx-use-specific]").attr("content") === "true") {
            if ($("meta[name=appx-application]").attr("content") &&
                $("meta[name=appx-database]").attr("content") &&
                $("meta[name=appx-procType]").attr("content") &&
                $("meta[name=appx-process]").attr("content")) {
                si.runApplication = $("meta[name=appx-application]").attr("content");
                si.runDatabase = $("meta[name=appx-database]").attr("content");
                si.runProcessType = $("meta[name=appx-procType]").attr("content")
                si.runProcess = $("meta[name=appx-process]").attr("content")
            } else {
                siInit = false;
            }
            var siTemp = parseQueryString();
            if (siTemp.hasOwnProperty("application")) {
                siInit = true;
                si.runApplication = siTemp.application;
                si.runDatabase = siTemp.database;
                si.runProcessType = siTemp.procType;
                si.runProcess = siTemp.process;
            }

            if (!(si.runApplication || si.runDatabase || si.runProcessType || si.runProcess)) {
                siInit = false;
            }
            if (!siInit) {
                displaySessionError();
                return;
            }
        }
        sendappxnewsessionlogin(appxLoginFormHost, appxLoginFormPort, appxLoginFormUser, appxLoginFormPswd, si);
    }
}

//Sends login data to the server
function sendappxlogin(server, port, u, p, r, c) {
    appx_session.appxResourceUrl += server + "/" + port + "/";
    appx_session.host = server;
    appx_session.port = port;
    appx_session.user = u;
    appx_session.password = p;
    appx_session.screenrows = parseInt(r) + 3;
    appx_session.screencols = parseInt(c);
    appx_session.setProp("screenRows", r);
    appx_session.setProp("screenColumns", c);
    var ms = {
        cmd: 'appxlogin',
        args: [server, port, u, p],
        handler: 'appxloginhandler',
        data: null
    };
    appx_session.ws.send(JSON.stringify(ms));
    appx_session.loginTimer();
}

function sendappxlocalconnector(state) {
    var ms = {
        cmd: 'localconnector',
        args: [state],
        handler: 'appxlocalconnectorhandler',
        data: null
    };
    appx_session.ws.send(JSON.stringify(ms));
}

//Sends reconnect data to the server
function sendappxreconnect(server, port, u, p, pid) {
    var ms = {
        cmd: 'appxreconnect',
        args: [server, port, u, p, pid],
        handler: 'appxreconnecthandler',
        data: null
    };
    appx_session.ws.send(JSON.stringify(ms));
}

//Sends newsession data to the server,
// startup_info is a byte array of (app_id(3), database(3), process_type(10), process_name(30), filler(210) 
function sendappxnewsession(server, port, u, p, r, c, startup_info) {
    if (!startup_info.remoteHost)
        startup_info.remoteHost = server;
    if (!startup_info.remotePort)
        startup_info.remotePort = port;
    if (!startup_info.remoteUser)
        startup_info.remoteUser = u;
    if (!startup_info.remotePassword)
        startup_info.remotePassword = p;
    if (!startup_info.screenRows)
        startup_info.screenRows = r;
    if (!startup_info.screenColumns)
        startup_info.screenColumns = c;

    localStorage["newsession"] = JSON.stringify(startup_info);
    appx_session.connected = false;
    window.open(window.location.href, "new_session" + Date.now(), "toolbar=yes, scrollbars=yes, resizable=yes, location=yes, menubar=yes, status=yes, titlebar=yes");
}

//Sends login data to the server
function sendappxnewsessionlogin(server, port, u, p, si) {
    if (si.reconnectId) {
        sendappxreconnect(server, port, u, p, "" + si.reconnectId);
        return;
    }

    appx_session.host = server;
    appx_session.port = port;
    appx_session.user = u;
    appx_session.password = p;

    if (si.screenRows) {
        appx_session.screenrows = parseInt(si.screenRows) + 3;
    }
    if (si.screenColumns) {
        appx_session.screencols = parseInt(si.screenColumns);
    }
    var ms = {
        cmd: 'appxnewsession',
        args: [server, port, u, p, si.runApplication, si.runDatabase, si.runProcessType, si.runProcess, si.filler, si.reconnectId],
        handler: 'appxloginhandler',
        data: null
    };
    appx_session.ws.send(JSON.stringify(ms));
    appx_session.loginTimer();
}

//Sends init data to the server
function sendappxinit() {
    var ms = {
        cmd: 'appxmessage',
        args: [0, 0, 0, 2, 3, 0, 0, 0],
        handler: 'appxinithandler',
        data: null
    };
    appx_session.ws.send(JSON.stringify(ms));
    ms = {
        cmd: 'appxmessage',
        args: appxclientversion,
        handler: 'appxinithandler',
        data: null
    };
    appx_session.ws.send(JSON.stringify(ms));
}

//Sends feature data to the server
function sendappxfeatures() {
    //		FEATURE_RUNNING_GUI_CLIENT      = 0x00000001;
    //		FEATURE_PASS_PROC_ID_ON_INIT    = 0x00000002;
    //		FEATURE_LOAD_KEYMAP_FROM_SERVER = 0x00000004;
    //		FEATURE_RUN_VIA_RT_LOAD         = 0x00000008;
    //		FEATURE_DATA_PALETTE_SUPPORT    = 0x00000010;
    //		FEATURE_DOWNLOAD_FILE           = 0x00000020;
    //		FEATURE_UPLOAD_FILE             = 0x00000040;
    //		FEATURE_ADD_FIELD               = 0x00000080;
    //		FEATURE_GET_LANG_BLK            = 0x00000100;
    //		FEATURE_BUTTONS                 = 0x00000200;
    //		FEATURE_CLI_PRINT               = 0x00000400;
    //		FEATURE_REL41P1_SELECT          = 0x00000800;
    //		FEATURE_REL41P2_TOKENS          = 0x00001000;
    //		FEATURE_FILTER_BOXES            = 0x00002000;
    //		FEATURE_DATE_CHOOSER            = 0x00004000;
    //		FEATURE_AUTO_MENUS              = 0x00008000;
    //		FEATURE_BOX_ITM_WDGT            = 0x00010000;
    //		FEATURE_GUI_EDIT_CMD            = 0x00020000;
    //		FEATURE_LONG_DATA               = 0x00040000;
    //		FEATURE_TOKEN_SCANS             = 0x00080000;
    //		FEATURE_JOE2_GUI_CLIENT         = 0x00100000;
    //		FEATURE_NO_END_PARAG            = 0x00200000;
    //		FEATURE_CLIENT_CLIPBOARD        = 0x00400000;
    //		FEATURE_CONSTANTS_EXCH          = 0x00800000;
    //		FEATURE_SERVER_TOOLBARS         = 0x01000000;
    //		FEATURE_CLIENT_PATH_EXPANSION   = 0x02000000;
    //		FEATURE_ALPHA_CHANNEL_COLORS    = 0x04000000;
    //		FEATURE_LONG_TOKENS             = 0x08000000;
    //		FEATURE_SERVER_PULLDOWNS        = 0x10000000;
    //		FEATURE_LOGIN_FAILURE_MESSAGE   = 0x20000000;
    //		FEATURE_TABLE_WIDGETS           = 0x40000000;
    //		EXTENDED_FEATURES               = 0x80000000;  //table sort

    //moved to client.  client has control over feature mask settings
    //    var mask0 = 0x00;
    //    var mask1 = 0x05;
    //    //var mask1 = 0x05; //items and widgets
    //    var mask2 = 0x26;
    //    //var mask2 = 0xa6;  //turn on bit 0x00008000 for menus
    //    //var mask2 = 0xa6; //turn on menus
    //    var mask3 = 0xfb;

    //    appx_session.feature_mask = [parseInt(mask0), parseInt(mask1), parseInt(mask2), parseInt(mask3)];
    var ms = {
        cmd: 'appxmessage',
        args: appx_session.feature_mask, //minimum
        handler: 'appxfeatureshandler',
        data: null
    };
    appx_session.ws.send(JSON.stringify(ms));
}

//Sends feature data to the server
function sendappxextendedfeatures() {
    var ms = {
        cmd: 'appxmessage',
        args: appx_session.extended_feature_mask, //minimum
        handler: 'appxextendedfeatureshandler',
        data: null
    };
    appx_session.ws.send(JSON.stringify(ms));
}

//Sends constants data to the server
function sendappxconstants() {
    /*when adding version and version num had to append with "client." so that it 
     *remains consistent with java client. When added in java client they seemed to
     *forget that engine added "client." to each variable name.*/
    var constants = [["pref.readServerStack", "true"], ["screen.height", screen.height.toString()], ["screen.width", screen.width.toString()], ["browser.name", navigator.appName], ["browser.version", navigator.appVersion], ["browser.userAgent", navigator.userAgent], ["browser.language", navigator.language], ["client.version", appx_session.getProp("serverConnectorVersionStr")], ["client.version.num", appx_session.getProp("serverConnectorVersionNum").toString()], ["localConnector", appx_session.localConnectorRunning.toString()], ["line.separator", appx_session.lineSeparator]];

    for (var property in appx_session.options) {
        if (property.charAt(0) != "[" && appx_session.options.hasOwnProperty(property)) {
            if (("" + appx_session.getProp(property)).length > 0 && appx_session.getProp(property) != null)
                constants.push(["pref." + property, "" + appx_session.getProp(property)]);
            else
                constants.push(["pref." + property, " "]);
        }
    }

    var arg = [];
    arg = arg.concat(hton32(constants.length));

    for (var idx = 0; idx < constants.length; idx++) {
        arg = arg.concat(hton32(constants[idx][0].length));
        arg = arg.concat(Str2byteArray(constants[idx][0]));
        arg = arg.concat(hton32(constants[idx][1].length));
        arg = arg.concat(Str2byteArray(constants[idx][1]));
    }

    var ms = {
        cmd: 'appxmessage',
        args: arg,
        handler: 'appxconstantshandler',
        data: null
    };
    appx_session.ws.send(JSON.stringify(ms));
}

// Sends attach data to the server
// Need to apply actual client window size
function sendappxattach() {
    var ms = {
        cmd: 'appxmessage',
        args: [0, 0, 0, appx_session.screenrows, 0, 0, 0, appx_session.screencols],
        handler: 'appxattachhandler',
        data: null
    };
    appx_session.ws.send(JSON.stringify(ms));
    // Min Screen Size
    var ms = {
        cmd: 'appxmessage',
        args: [0, 0, 0, appx_session.screenrows, 0, 0, 0, appx_session.screencols],
        handler: 'appx_attach_handler',
        data: null
    };
    appx_session.ws.send(JSON.stringify(ms));
    // Max Screen Size
    var ms = {
        cmd: 'appxmessage',
        args: [0, 0, 0, appx_session.screenrows, 0, 0, 0, appx_session.screencols],
        handler: 'appxattachhandler',
        data: null
    };
    appx_session.ws.send(JSON.stringify(ms));
}

//Sends keymap data to the server
function sendappxkeymap() {
    var ms = {
        cmd: 'appxmessage',
        args: [0, 0, 0, 1],
        handler: 'appxdataentryhandler',
        data: null
    };
    appx_session.ws.send(JSON.stringify(ms));
}

//PING Message Handler
function appxpinghandler() {
    sendappxping();
}

//Sends ping data to the server
function sendappxping() {
    var ms = {
        cmd: 'appxmessage',
        args: [0, 0],
        handler: 'appxpinghandler',
        data: null
    };
    appx_session.ws.send(JSON.stringify(ms));
}

//Client Handler Functions for Server Messages

//Login Message Handler
function appxloginhandler(rtndata) {
    var loginresponse = rtndata;
    if (loginresponse.transresult == "SUCCESS") {
        loggedin = true;
        $("#appx_login_modul").hide();
        if (appxUseSoftkeys) $("#softkeys_showhide").show();
        $("#defaulttools_showhide").show();
        $("#appx-status-msg").text("Logged In Sucessfully...\n\n");
    }
    else {
        loggedin = false;
        alert(appx_session.language.alerts.loginError + loginresponse.data);
        window.location.reload();
        appxSetStatusStateText(APPX_STATE_READY);
    }
}

function appxfinishhandler(rtndata) {
    if (localStorage["appx_prev_pids"]) {
        var prev_pids = JSON.parse(localStorage["appx_prev_pids"]);
        var pidTimeout = (Date.now() - 2880000);
        for (var i = 0; i < prev_pids.length; i++) {
            if (prev_pids[i].PID === appx_session.pid || prev_pids[i].created < pidTimeout) {
                prev_pids.splice(i, 1);
            }
        }
        localStorage["appx_prev_pids"] = JSON.stringify(prev_pids);
    }
    appx_session.connected = false;
    if (appxCloseOnExit == "true")
        close();
    else if (appxCloseOnExit == "back")
        history.back();
    else if ($("meta[name=appx-browser-redirect]").attr("content") !== "Enter Redirect Website Here" &&
        $('meta[name=appx-use-noLogin]').attr("content") === "true") {
        window.location.href = $("meta[name=appx-browser-redirect]").attr("content");
    } else {
        location.reload(true);
    }

    /*If window has new_session name then it was opened as part of a new session
    **request and we need to close it upon ending that session*/
    if (window.name.indexOf("new_session") != -1) {
        window.close();
    }
}

//Reconnect Message Handler
function appxreconnecthandler(rtndata) {
    var reconnectresponse = rtndata;
    if (reconnectresponse) {
        var ms = {
            cmd: 'appxmessage',
            args: [0, 0, 0, 0],
            handler: 'appxresourcehandler',
            data: null
        };
        appx_session.ws.send(JSON.stringify(ms));
    }
    else {
        var recon = false;
    }
}

//Init Message Handler
function appxinithandler(rtndata) {
    sendappxinit();
}

//Features Message Handler
function appxfeatureshandler() {
    sendappxfeatures();
}

//Features Message Handler
function appxextendedfeatureshandler() {
    sendappxextendedfeatures();
}


/*
**Function to pull query parameters out of url string and
**set preferences in preferences object with values.
**
**@param callback: Callback function
*/
function setPrefsFromQueryParams(callback) {
    var params = window.location.search.substring(1);
    var paramArray = params.split("&");
    var paramObj = {};
    for (var i = 0; i < paramArray.length; i++) {
        var temp = paramArray[i].split("=");
        paramObj[temp[0]] = temp[1];
    }
    for (var keys in paramObj) {
        if (appx_session.options.hasOwnProperty(keys)) {
            appx_session.options[keys].prop[10] = paramObj[keys];
        }
    }
    callback();
}

//Constants Message Handler
function appxconstantshandler(data) {
    setPrefsFromQueryParams(function () {
        sendappxconstants();
        var constants = data.data;
        for (var con in constants) {
            switch (con) {
                case "ENCODING_RAW":
                    appx_session.rawEncoding = constants[con];
                    break;
                default:
                    console.log(con + " not currently known, please check constansts being sent from engine")
                    break;
            }
        }
    });
}

//Attach Message Handler
function appxattachhandler() {
    appx_session.connected = true;
    sendappxattach();
}

//KeyMap Message Handler
function appxkeymaphandler() {
    sendappxkeymap();
}

//PID Message Handler
function appxpidhandler(x) {
    appx_session.pid = ab2str(x.data);
    appxSetStatusPIDText(appx_session.pid);
    appx_session.setProp("lastPid", appx_session.pid);
    appx_session.setProp("lastHost", appx_session.server);
    appx_session.setProp("lastPort", appx_session.port);
    if (appx_session.localConnectorRunning === true) {
        initialize_localos_directories(appx_session.getProp("cachePath") + "/");
    }
    $("title").html(appx_session.getProp("windowTitle"));
    var host_pid = {
        "server": appx_session.server,
        "PID": appx_session.pid,
        "created": Date.now()
    }
    var prev_pids;
    if (localStorage["appx_prev_pids"]) {
        prev_pids = JSON.parse(localStorage["appx_prev_pids"]);
    } else {
        prev_pids = [];
    }
    prev_pids.push(host_pid);
    localStorage["appx_prev_pids"] = JSON.stringify(prev_pids);

    /*We now have all the information to create our URLs for mongodb*/
    appx_session.uploadURL = appxProtocol + "://" + appxConnectorHost + ":" + appxConnectorMongoPort + appxConnectorPathHttp + "/upload/" + appx_session.user + "_" + appx_session.pid.trim() + "/";
    appx_session.userPrefsURL = appxProtocol + "://" + appxConnectorHost + ":" + appxConnectorMongoPort + appxConnectorPathHttp + "/userPrefs/" + appx_session.user + "/";

    /*Grab the user table preferences from mongo and load it into global variable*/
    var blob = null;
    var xhr = new XMLHttpRequest;
    xhr.open("GET", appx_session.userPrefsURL + "preferences");
    xhr.onload = function xhr_onload() {
        try {
            appx_session.tablePreferences = JSON.parse(xhr.response);
        } catch (e) {
            console.log(e);
            appx_session.tablePreferences = {};
        }
    }
    xhr.send();
}

/*
**Function to display specific error message based on which field was left blank
*/
function displaySessionError() {
    var errorMsg = " is a required field.";
    if (!appxLoginFormHost) {
        errorMsg = "Server" + errorMsg;
    } else if (!appxLoginFormPort) {
        errorMsg = "Port" + errorMsg;
    } else if (!appxLoginFormUser) {
        errorMsg = "Username" + errorMsg;
    } else if (!appxLoginFormPswd) {
        errorMsg = "Password" + errorMsg;
    } else if (!appxLoginFormRows) {
        errorMsg = "Rows" + errorMsg;
    } else if (!appxLoginFormCols) {
        errorMsg = "Cols" + errorMsg;
    } else {
        errorMsg = "Logging user in to specific process has failed";
    }

    $("#appx-status-msg").text(errorMsg);
    $("#appx-status-msg").css("background-color", "red");
}

/*
**Function that checks to make sure no fields were left blank on form and
**initializes variables if all fields have data and calls error function
**if a field is left blank
**
**@return valid: boolean value of all required fields check
*/
function sessionVariableInit() {
    var valid = false;
    $("#appx-status-msg").removeAttr("style");

    if ($("#appx_server").val()) {
        appxLoginFormHost = $("#appx_server").val();
    }
    if ($("#appx_port").val()) {
        appxLoginFormPort = $("#appx_port").val();
    }
    if ($("#appx_username").val()) {
        appxLoginFormUser = $("#appx_username").val();
    }
    if ($("#appx_password").val()) {
        appxLoginFormPswd = $("#appx_password").val();
    }
    if ($("#appx_rows").val()) {
        appxLoginFormRows = $("#appx_rows").val();
    }
    if ($("#appx_cols").val()) {
        appxLoginFormCols = $("#appx_cols").val();
    }

    if (appxLoginFormHost && appxLoginFormPort &&
        appxLoginFormUser && appxLoginFormPswd &&
        appxLoginFormRows && appxLoginFormCols) {

        appx_session.server = appxLoginFormHost;
        appx_session.port = appxLoginFormPort;
        appx_session.user = appxLoginFormUser;
        appx_session.password = appxLoginFormPswd;
        valid = true;
    } else {
        displaySessionError();
    }

    return valid;
}
$(function () {
    checkLogin();
});
