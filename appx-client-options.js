
/*********************************************************************
 **
 **   server/appx-client-options.js - Client Option processing
 **
 **   This module contains code to process client options.
 **
 *********************************************************************/

// what_str =  "@(#)Appx $Header$";

// FIXME:  need a way to save to disk and reload if user deletes Browser cache
// thinking maybe allow to download and save a backup, and a way to upload and
// set options from a backup

var appxServerClientVersionStr = "6.0.0.20072712";
var appxServerClientVersionNum = 60000.20072712;

var appxSortedOptions = {};
var appxSortedOptionsArray = [];
var appxSortedOptionsArrayFinal;

var PROP_SECTION = 0;
var PROP_NAME = 1;
var PROP_HIDDEN = 2;
var PROP_EDIT_AT_RT = 3;
var PROP_AUTO_SAVE = 4;
var PROP_FORCE_SAVE = 5;
var PROP_EXPAND_STRING = 6;
var PROP_CREATE_PATH = 7;
var PROP_DATATYPE = 8;
var PROP_DATALIST = 9;
var PROP_VALUE = 10;
var PROP_DEFAULT = 11;
var PROP_OLD_NAME = 12;
var PROP_OLD_VALUE = 13;
var PROP_DESC = 14;
var PROP_READONLY = 15;

appx_session.parseOption = function (strIn) {
    try {
        if (typeof strIn != "string")
            return strIn;

        if (appx_session.globals["os"].indexOf("Win") < 0)
            var str = strIn;
        else
            var str = strIn.replace("/\//g", "\\");

        var patt = /\$\([a-zA-Z0-9]+\)/;
        if (str) {

            while (str.match(patt)) {
                str = str.replace(patt, appx_session.getProp(str.match(patt)[0].replace("$", "").replace("(", "").replace(")", "")));
            }
        }
        else {
            return str;
        }
    }
    catch (e) {
        console.log("appx_session.parseOption: " + e);
        console.log(e.stack);
    }
    return str;
};

appx_session.getRawProp = function (prop) {
    try {
        if (appx_session.options && prop) {
            if (appx_session.options[prop]) {
                return appx_session.options[prop].prop[PROP_VALUE];
            }
        }
        else {
            return null;
        }
    }
    catch (e) {
        console.log("appx_session.getRawProp: " + e);
        console.log(e.stack);
    }
};

appx_session.getProp = function (prop) {
    switch (prop) {
        case "host": prop = "lastHost"; break;
        case "port": prop = "lastPort"; break;
    }

    try {
        if (appx_session.options && prop) {
            if (appx_session.options[prop]) {
                return appx_session.options[prop].prop[PROP_VALUE] == null ? appx_session.parseOption(appx_session.options[prop].prop[PROP_DEFAULT]) : appx_session.parseOption(appx_session.options[prop].prop[PROP_VALUE]);
            }
            else {
                if (prop == "now") {
                    return Date.now();
                }
                if (prop == "rndByte") {
                    return Math.floor((Math.random() * 255) + 1).toString();
                }
                return prop;
            }
        }
        else {
            return "Options not set.";
        }
    }
    catch (e) {
        console.log("appx_session.getProp: " + e);
        console.log(e.stack);
    }
};

appx_session.setPropEx = function (prop, rawval, save) {
    if (appx_session.options) {
        if (appx_session.options[prop]) {
            var val = null;
            if (appx_session.options[prop].prop[PROP_DATATYPE] === "boolean") {
                if (rawval == null || rawval == "")
                    val = null;
                else if (rawval.toLowerCase() == "true")
                    val = true;
                else
                    val = false;
            }
            else {
                val = rawval;
            }
            if (val == appx_session.options[prop].prop[PROP_DEFAULT])
                appx_session.options[prop].prop[PROP_VALUE] = null;
            else
                appx_session.options[prop].prop[PROP_VALUE] = val;
            if (save) {
                localStorage["appx_options"] = JSON.stringify(appx_session.options);
            }
            if (prop === "windowTitle") {
                $("title").html(appx_session.getProp("windowTitle"));
            }
            return appx_session.options[prop].prop[PROP_VALUE];
        }
        else {
            return "Can't set prop:" + prop;
        }
    }
    else {
        return "Options not set.";
    }
};

appx_session.setProp = function (prop, rawval) {
    appx_session.setPropEx(prop, rawval, true);
};

appx_session.getDefaultInputFontName = function () { };


appx_session.loadOptions = function () {
    var iconSizeList, iconStyleList, encodingList, displayList, fontList, SSLModeList, tileModeList, GUILookList;
    appx_session.severityText = "Some kinda text needed here";
    appx_session.DEFAULT_LOG_LEVEL = 0;
    appx_session.DEFAULT_NOTIFY_LEVEL = 1;
    appx_session.SCALING_QUALITY_HIGH = 10;
    if (appx_session.globals["os"].indexOf("Win") < 0)
        appx_session.fileseparatorchar = "/";
    else
        appx_session.fileseparatorchar = "\\";
    appx_session.options = {};
    var options = [
        //           Section, Tag, Hidden?, Edit@RT, AutoSave, ForceSave, ExpandString, CreatePath, Datatype, DataList, Value, Default, OldTag, OldValue, Description, Show/Send to engine
        {
            "prop": ["HTML5", "[HTML5]", true, false, false, false, false, false, "string", null, null, null, null, null, "", false]
        }, {
            "prop": ["HTML5", "host", true, true, false, false, false, false, "string", null, null, appx_session.host, null, null, "Current Host, set after user logs in.", false]
        }, {
            "prop": ["HTML5", "port", true, true, false, false, false, false, "string", null, null, appx_session.port, null, null, "Current Port, set after user logs in.", false]
        }, {
            "prop": ["HTML5", "lastPid", true, true, false, false, false, false, "string", null, null, appx_session.pid, null, null, "Last Process ID, set after user logs in.", false]
        }, {
            "prop": ["Experimental", "[Experimental]", true, false, false, false, false, false, "string", null, null, null, null, null, "", false]
        }, {
            "prop": ["Experimental", "inputByteLengthCheck", true, true, false, false, false, false, "boolean", null, null, true, null, null, "Test raw byte lengths for data entry fields", false]
        }, {
            "prop": ["Experimental", "cacheHtmlImages", true, true, false, false, false, false, "boolean", null, null, true, null, null, "Implement HTML image cache", false]
        }, {
            "prop": ["Experimental", "cacheImagesToMemory", true, false, false, false, false, false, "boolean", null, null, true, null, null, "Cache resource images to memory?", false]
        }, {
            "prop": ["Experimental", "newTypeaheadCode", true, true, false, false, false, false, "boolean", null, null, true, null, null, "Enable new typeahead test code", false]
        }, {
            "prop": ["Experimental", "forceAntiAliasing", true, false, false, false, false, false, "boolean", null, null, false, null, null, "Force AntiAliasing", false]
        }, {
            "prop": ["Experimental", "forceWidgetMovable", true, false, false, false, false, false, "boolean", null, null, false, null, null, "Force all widgets to be movable", false]
        }, {
            "prop": ["Experimental", "convertMultiLine", true, false, false, false, false, false, "boolean", null, null, false, null, null, "convert Multi-line labels to HTML?", false]
        }, {
            "prop": ["Experimental", "showTypeaheadLog", true, true, false, false, false, false, "boolean", null, null, false, null, null, "Log typeahead messages?", false]
        }, {
            "prop": ["Experimental", "showExperimental", true, true, false, false, false, false, "boolean", null, null, false, null, null, "Show hidden experimental options?", false]
        }, {
            "prop": ["Experimental", "cacheImagesInMemory", true, false, false, false, false, false, "boolean", null, null, true, null, null, "Cache all resource images in memory?", false]
        }, {
            "prop": ["Experimental", "autoFillMainWindow", true, true, false, false, false, false, "boolean", null, null, false, null, null, "If using a scrollpane, fill extra space with main window BG color", false]
        }, {
            "prop": ["Experimental", "autoGuiWindowMargins", true, true, false, false, false, false, "boolean", null, null, true, null, null, "turn on auto-gui window margins", false]
        }, {
            "prop": ["Experimental", "hideMenuBorder", true, false, false, false, false, false, "boolean", null, null, false, null, null, "hide the border line between the menubar and the toolbar", false]
        }, {
            "prop": ["Experimental", "addToolbarBorder", true, false, false, false, false, false, "boolean", null, null, false, null, null, "Add a border to the toolbar window", false]
        }, {
            "prop": ["Experimental", "toolbarBorderRaised", true, false, false, false, false, false, "boolean", null, null, false, null, null, "draw the toolbar border as a raised border", false]
        }, {
            "prop": ["Experimental", "timeoutMultiplier", true, true, false, false, false, false, "float", null, null, 1, null, null, "Timout multiplier applied to server timeout value", false]
        }, {
            "prop": ["Experimental", "clearCache", true, true, false, false, false, false, "boolean", null, null, false, null, null, "clear .appx cache directory", false]
        }, {
            "prop": ["Experimental", "newPulldownMenus", true, true, false, false, false, false, "boolean", null, null, true, null, null, "New pulldown menu code allows same name in more than one place.", false]
        }, {
            "prop": ["Experimental", "loadHyperlinksInPlace", true, true, false, false, false, false, "boolean", null, null, false, null, null, "Launch hyperlinks into the html viewer widget.", false]
        }, {
            "prop": ["Experimental", "newWidgetParser", true, true, false, false, false, false, "boolean", null, null, true, null, null, "Activate new code for parsing widgets", false]
        }, {
            "prop": ["Experimental", "autoGuiParser", true, true, false, false, false, false, "boolean", null, null, true, null, null, "Activate client autoGui parser", false]
        }, {
            "prop": ["Experimental", "newImageEditorTools", true, true, false, false, false, false, "boolean", null, null, true, null, null, "New Image Editor Tools", false]
        }, {
            "prop": ["Experimental", "autoFontScaling", true, true, false, false, false, false, "boolean", null, null, false, null, null, "Can font size auto adjust as window resizes", false]
        }, {
            "prop": ["Options", "[Options]", false, false, false, false, false, false, "string", null, null, null, null, null, "", false]
        }, {
            //           Section, Tag, Hidden?, Edit@RT, AutoSave, ForceSave, ExpandString, CreatePath, Datatype, DataList, Value, Default, OldTag, OldValue, Description
            "prop": ["Options", "gridVirtualScroll", false, true, true, false, false, false, "boolean", null, null, true, null, null, "Grids use virtual scrolling versus paging", false]
        }, {
            "prop": ["Options", "gridFilterToolbar", false, true, true, false, false, false, "boolean", null, null, false, null, null, "(Not Implemented) - Show grid filter toolbar", true]
        }, {
            "prop": ["Options", "gridShowRowNumbers", true, true, true, false, false, false, "boolean", null, null, true, null, null, "Show row numbers on left side of grid", false] //##DELETEUSERPREFS##
        }, {
            "prop": ["Options", "gridShowFooterBar", true, true, true, false, false, false, "boolean", null, null, true, null, null, "Show footer bar on grid", false] //##DELETEUSERPREFS##
        }, {
            "prop": ["Options", "guiInterface", true, true, true, false, false, false, "boolean", null, null, true, null, null, "Turn the GUI Interface On or Off", false] //##DELETEUSERPREFS##
        }, {
            "prop": ["Options", "showOptionNumbers", false, true, true, true, false, false, "boolean", null, null, false, null, null, "Show numeric option numbers of buttons", false]
        }, {
            "prop": ["Options", "autoTabOut", false, true, true, false, false, false, "boolean", null, null, true, null, null, "Tab to next field after current field is filled", false]
        }, {
            "prop": ["Options", "autoSelect", false, true, true, false, false, false, "boolean", null, null, true, null, null, "Select text as a field gains focus", false]
        }, {
            "prop": ["Options", "dockingScrollbar", true, true, true, false, false, false, "boolean", null, null, true, null, null, "Hide scrollbar unless the mouse is near the scrollbar location", false] //##DELETEUSERPREFS##
        }, {
            "prop": ["Options", "showScrollbar", false, true, true, false, false, false, "boolean", null, null, true, null, null, "Should the scrollbar be visible at all?", false]
        }, {
            "prop": ["Options", "toolbarIconSize", false, true, true, false, false, false, "string", iconSizeList, null, "Medium", null, null, "(Not Implemented) - Toolbar Icon Size", true]
        }, {
            "prop": ["Options", "toolbarStyle", false, true, true, false, false, false, "string", iconStyleList, null, "Both", null, null, "(Not Implemented) - Toolbar Button Style", true]
        }, {
            "prop": ["Options", "textReverseEnterKey", false, true, true, false, false, false, "boolean", null, null, false, null, null, "(Not Implemented) - Pressing ENTER in a Text Field performs a Newline only, Ctrl-Enter triggers button", true]
        }, {
            "prop": ["Options", "hidePrefsMenuItem", false, false, true, false, false, false, "boolean", null, null, false, null, null, "(Not Implemented) - Hide the menu option to edit the preferences.ini file", true]
        }, {
            "prop": ["Options", "appxDoubleClick", true, true, true, false, false, false, "boolean", null, null, false, null, null, "Enable Appx DoubleClick = EnterKey logic", false] //Don't show in options ##DELETEUSERPREFS##
        }, {
            "prop": ["Options", "arrowScrollRegion", false, true, true, false, false, false, "boolean", null, null, false, null, null, "(Not Implemented) - arrow keys will scroll and scrolling area if at top or bottom of region", true]
        }, {
            "prop": ["Options", "centerAppx", false, false, false, false, false, false, "boolean", null, null, true, null, null, "Center APPX horizontally in browser", false]
        }, {
            "prop": ["Options", "windowOpacity", false, false, false, false, false, false, "integer", null, null, 100, null, null, "(Not Implemented) - Window opacity (0=transparent, 100=fully opaque)", true]
        }, {
            "prop": ["Options", "displayNumber", false, false, false, false, false, false, "string", displayList, null, "1", null, null, "(Not Implemented) - Which workstation display to use for a multi-head PC", true]
        }, {
            "prop": ["Options", "drawBlockCursor", false, true, true, false, false, false, "boolean", null, null, true, null, null, "(Not Implemented) - Draw the block cursor", true]
        }, {
            "prop": ["Options", "drawScrollActive", false, true, true, false, false, false, "boolean", null, null, true, null, null, "(Not Implemented) - Draw the scrolling region record selected", true]
        }, {
            "prop": ["Options", "valueChangedTimer", false, true, true, false, false, false, "integer", null, null, 500, null, null, "Milliseconds to wait after typing for value changed events to fire", false]
        }, {
            "prop": ["Options", "doubleBufferScreen", true, false, true, false, false, false, "boolean", null, null, true, null, null, "Wait for images to load before showing screens", false] //##DELETEUSERPREFS##
        }, {
            "prop": ["Options", "useTableForScan", false, true, true, false, false, false, "boolean", null, null, false, null, null, "Use the scan screen with table widget", false]
        }, {
            "prop": ["UIDefaults", "[UIDefaults]", false, false, false, false, false, false, "string", null, null, null, null, null, "", false]
        }, {
            "prop": ["UIDefaults", "showMessageDialogs", false, true, false, false, false, false, "boolean", null, null, false, null, null, "(Not Implemented) - Show MESSAGE text in a popup dialog", true]
        }, {
            "prop": ["UIDefaults", "showWarningDialogs", false, true, false, false, false, false, "boolean", null, null, false, null, null, "(Not Implemented) - Show WARNING text in a popup dialog", true]
        }, {
            "prop": ["UIDefaults", "showErrorDialogs", false, true, false, false, false, false, "boolean", null, null, false, null, null, "(Not Implemented) - Show ERROR text in a popup dialog", true]
        }, {
            "prop": ["UIDefaults", "scanTooltip", false, true, false, false, false, false, "string", null, null, "Click to scan for a value from a lookup file", null, null, "(Not Implemented) - Scan button tooltip", true]
        }, {
            "prop": ["LocalPaths", "[LocalPaths]", false, false, false, false, false, false, "string", null, null, null, null, null, "", false]
        }, {
            "prop": ["LocalPaths", "userHome", false, false, false, false, true, true, "string", null, null, "", null, null, "Local user home directory", false]
        }, {
            "prop": ["LocalPaths", "userClientRoot", false, false, false, false, true, true, "string", null, null, "$(userHome)" + appx_session.fileseparatorchar + ".appx", null, null, "Appx Client root directory for all local files or a user", false]
        }, {
            "prop": ["LocalPaths", "cacheRoot", false, false, false, false, true, true, "string", null, null, "$(userClientRoot)" + appx_session.fileseparatorchar + "cache", null, null, "Cache path root directory for all client cache files", false]
        }, {
            "prop": ["LocalPaths", "cachePath", false, false, false, false, true, true, "string", null, null, "$(cacheRoot)" + appx_session.fileseparatorchar + "$(host)" + appx_session.fileseparatorchar + "$(port)", null, null, "Cache path directory for the current session", false]
        }, {
            "prop": ["LocalPaths", "dataCachePath", false, false, false, false, true, true, "string", null, null, "$(cachePath)" + appx_session.fileseparatorchar + "Data", null, null, "Data cache path directory for the current session", false]
        }, {
            "prop": ["LocalPaths", "printCachePath", false, false, false, false, true, true, "string", null, null, "$(cachePath)" + appx_session.fileseparatorchar + "Print", null, null, "Print cache path directory for the current session", false]
        }, {
            "prop": ["Startup", "[Startup]", false, false, false, false, false, false, "string", null, null, null, null, null, "", false]
        }, {
            "prop": ["Startup", "initialFontSize", false, false, false, false, false, false, "integer", null, null, 14, null, null, "Base font size to use on startup", false]
        }, {
            "prop": ["Startup", "commandShell", true, false, false, false, true, false, "string", null, null, null, "shell", null, "OS Command Shell for launching files", false] // ##DELETEUSERPREFS##
        }, {
            "prop": ["Startup", "mapOptionKey", false, true, false, false, false, false, "integer", null, 192, 192, "optkey", null, "Key to use for the Option key (` == 192). To change click in text box and press key you wish to use.", false]
        }, {
            "prop": ["Startup", "mapTabKey", false, true, false, false, false, false, "integer", null, 9, 9, "tabkey", null, "Key to use for the Tab key (TAB == 9). To change click in text box and press key you wish to use.", false]
        }, {
            "prop": ["Startup", "mapEndKey", false, true, false, false, false, false, "integer", null, 27, 27, "endkey", null, "Key to use for the End key (ESC == 27). To change click in text box and press key you wish to use.", false]
        }, {
            "prop": ["Startup", "remoteHost", false, false, false, false, false, false, "string", null, null, null, "host", null, "(Not Implemented) - Remote login hostname", true]
        }, {
            "prop": ["Startup", "remotePort", false, false, false, false, false, false, "integer", null, null, 0, "port", null, "(Not Implemented) - Remote connection Appx server port", true]
        }, {
            "prop": ["Startup", "remoteUser", false, false, false, false, false, false, "string", null, null, null, "user", null, "(Not Implemented) - Remote login user id", true]
        }, {
            "prop": ["Startup", "screenRows", false, false, true, false, false, false, "integer", null, null, 35, "rows", null, "Screen grid cell rows", true]
        }, {
            "prop": ["Startup", "screenColumns", false, false, true, false, false, false, "integer", null, null, 144, "cols", null, "Screen grid cell columns", true]
        }, {
            "prop": ["Startup", "showDateScans", false, false, false, false, false, false, "boolean", null, null, false, "datescan", true, "(Not Implemented) - Show scan buttons on date fields", true]
        }, {
            "prop": ["Startup", "showMenubar", false, false, false, false, false, false, "boolean", null, null, true, null, null, "(Not Implemented) - Show Menubar on client window", true]
        }, {
            "prop": ["Startup", "showStatusbar", false, false, false, false, false, false, "boolean", null, null, true, null, null, "(Not Implemented) - Show Statusbar on client window", true]
        }, {
            "prop": ["Startup", "showToolbar", false, false, false, false, false, false, "boolean", null, null, true, null, null, "(Not Implemented) - Show Toolbar on client window", true]
        }, {
            "prop": ["Startup", "showScanButtons", false, false, false, false, false, false, "boolean", null, null, true, null, null, "(Not Implemented) - Show Scan Buttons on client window", true]
        }, {
            "prop": ["Startup", "windowTitle", false, false, false, false, true, false, "string", null, null, "APPX - $(host):$(port):$(lastPid)", "title", null, "(Not Implemented) - Text to show in the window title", true]
        }, {
            "prop": ["Startup", "mergeBoxes", true, true, false, false, false, false, "boolean", null, null, false, null, null, "Merge boxes that touch top and two sides of screen", false]
        }, {
            "prop": ["Startup", "widgetFontAdjust", false, false, false, false, false, false, "integer", null, null, 0, null, null, "Font scaling adjustment for widgets", false]
		}, {
            "prop": ["Constants", "[Constants]", false, false, false, false, false, false, "string", null, null, null, null, null, "", false]
        }, {
            "prop": ["Constants", "serverConnectorVersionStr", false, false, false, false, false, false, "string", null, null, null, null, null, "", false]
        }, {
            "prop": ["Constants", "serverConnectorVersionNum", false, false, false, false, false, false, "integer", null, null, null, null, null, "", false]
        }, {
            "prop": ["Constants", "clientServerVersionStr", false, false, false, false, false, false, "string", null, null, null, null, null, "", false]
        }, {
            "prop": ["Constants", "clientServerVersionNum", false, false, false, false, false, false, "integer", null, null, null, null, null, "", false]
        }, {
            "prop": ["Constants", "clientPublicVersionStr", false, false, false, false, false, false, "string", null, null, null, null, null, "", false]
        }, {
            "prop": ["Constants", "clientPublicVersionNum", false, false, false, false, false, false, "integer", null, null, null, null, null, "", false]
        }, {
            "prop": ["Constants", "localConnectorVersionStr", false, false, false, false, false, false, "string", null, null, null, null, null, "", false]
        }, {
            "prop": ["Constants", "localConnectorVersionNum", false, false, false, false, false, false, "integer", null, null, null, null, null, "", false]
        }, {
            "prop": ["LastLogin", "[LastLogin]", false, false, false, false, false, false, "string", null, null, null, null, null, "", false]
        }, {
            "prop": ["LastLogin", "lastHost", false, false, true, false, false, false, "string", null, null, null, null, null, "Remote login hostname", true]
        }, {
            "prop": ["LastLogin", "lastPort", false, false, true, false, false, false, "integer", null, null, 8060, null, null, "Remote connection Appx server port", true]
        }, {
            "prop": ["LastLogin", "userData", false, false, false, false, false, false, "string", null, null, null, null, null, "User Data to pass to server", true]
        }, {
            "prop": ["LastLogin", "lastPassword", true, false, false, false, true, false, "string", null, null, null, null, null, "Remote login password", false]
        }, {
            "prop": ["LastLogin", "lastPid", false, false, true, false, false, false, "string", null, null, null, null, null, "Last server side process id", false]
        }
    ];
    for (var opn = 0; opn < options.length; opn++) {
        appx_session.options[options[opn].prop[PROP_NAME]] = options[opn];
    }
    if (localStorage["appx_options"]) {
        var storedOptions = JSON.parse(localStorage["appx_options"]);
        for (var key in storedOptions) {
            if (storedOptions[key].prop[PROP_SECTION] == "Constants") {
                storedOptions[key].prop[PROP_VALUE] = null;
            }
            for (var key1 in appx_session.options) {
                if (appx_session.options[key1].prop[PROP_NAME] == storedOptions[key].prop[PROP_NAME]) {
                    appx_session.options[key1].prop[PROP_VALUE] = storedOptions[key].prop[PROP_VALUE];
                }
            }
        }
    }
    localStorage["appx_options"] = JSON.stringify(appx_session.options);
};

appx_session.clearCache = function () {
    localStorage.clear();
    localStorage["appx_ls_version"] = "1";
    window.location.reload()
}

appx_session.showPreferences = function (atlogin) {
    var d = $("<div id='appx_prefs'>").css({
        "background": "rgba(50, 50, 50, 0.7)",
        "width": "100%",
        "height": "100%",
        "min-height": "400px",
        "z-index": 10000000,
        "display": "none",
        "position": "absolute",
        "top": "0px",
        "left": "0px",
        "font-family": "verdana",
        "font-size": "11px"
    })
        .appendTo("body");
    if (atlogin) {
        d.on('keydown', function (event) {
            sendkey(event);
        });
    }

    var prefwrap = $("<div style='border: 10px solid #333;'>").css({
        "width": "950px",
        "height": "430px",
        "background": "#fff"
    }).appendTo("#appx_prefs")
        .position({
            my: "center",
            at: "center",
            of: window
        }).draggable();

    var prefsdiv = $("<div>").css({
        "width": "950px",
        "height": "400px",
        "overflow": "scroll"
    });

    var closer = $("<button type='button' style='float:right;border:none;;background: #333;text-align:right;padding: 5px;color: #F5F539; font-weight:bold;padding-bottom: 10px;'>")
        .append($("<span>" + appx_session.language.buttons.closeX + "</span>"))
        .click(function () {
            $("#appx_prefs").hide();
            $("#appx_prefs").remove();
        });

    var prefs = sortAppxOptions(atlogin);
    $(prefwrap).prepend($("<div>").append(closer));
    $(prefsdiv).append($("<div>").append(prefs));
    $(prefsdiv).appendTo(prefwrap);
    $("#appx_prefs").show();
    $(prefs).find("input").change(function () {
        appx_session.setProp($(this).attr("id"), $(this).val());
        if (appx_session.getRawProp($(this).attr("id")) != null)
            $(this).css({
                "background": "#ff0"
            });
        else
            $(this).css({
                "background": "#fff"
            });
    });
}

function sortAppxOptions(atlogin) {
    appxSortedOptions = {};
    appxSortedOptionsArray = [];
    $.each(appx_session.options, function (k, v) {
        if (v.prop[PROP_HIDDEN].toString().trim() == "false") {
            if (v.prop[PROP_NAME].toString().indexOf("[") > -1) {
                appxSortedOptions[v.prop[PROP_SECTION]] = {};
                appxSortedOptions[v.prop[PROP_SECTION]].items = [];
                appxSortedOptions[v.prop[PROP_SECTION]].header = v;
            }
            else {
                if (appxSortedOptions[v.prop[PROP_SECTION]]) {
                    appxSortedOptions[v.prop[PROP_SECTION]].items.push(v);
                }
            }
        }
    });

    $.each(appxSortedOptions, function (k, v) {
        appxSortedOptions[k].items.sort(function (a, b) {
            if (a.prop[PROP_NAME] < b.prop[PROP_NAME]) return -1;
            if (a.prop[PROP_NAME] > b.prop[PROP_NAME]) return 1;
            return 0;
        });
        appxSortedOptionsArray.push(k);
    });
    appxSortedOptionsArray.sort();

    var prefs = $("<table id='preferences' border-collapse='collapse' border='1' cellspacing='0' cellpadding='10'>");
    $(prefs).append("<thead style='padding: 3px;color: #fff;font-weight: bold;background: #678'>" + "<th>Option</th>" + "<th>Value</th>" + "<th>Default Value</th>" + "<th>Description</th>" + "</thead>");
    $(prefs).append("<tbody>");
    /*$(prefs).append("<tr style='padding: 3px;color: #fff;font-weight: bold;background: #678'>" + "<td>Option</td>" + "<td>Value</td>" + "<td>Default Value</td>" + "<td>Description</td>" + "</tr>");*/
    
    for (var i = 0; i < appxSortedOptionsArray.length; i++) {
        var v = appxSortedOptions[appxSortedOptionsArray[i]];
        $(prefs).append("<tr style='padding: 3px; background: #5C90DD; color: #fff; font-weight: bold; font-size: 1.2em'>" + "<td>" + v.header.prop[PROP_NAME] + "</td>" +
            " <td></td>" + "<td></td>" + "<td></td>" + "</tr>");
        for (var j = 0; j < v.items.length; j++) {
            var prop10;
            var hasChanged = false;
            if (v.items[j].prop[PROP_SECTION] != "Constants" && v.items[j].prop[PROP_VALUE] != null && v.items[j].prop[PROP_VALUE] != v.items[j].prop[PROP_DEFAULT]) {
                hasChanged = true;
            }
            if (v.items[j].prop[PROP_SECTION] != "Constants" && (v.items[j].prop[PROP_EDIT_AT_RT] || atlogin == true) && !v.items[j].prop[PROP_READONLY]) {
                prop10 = "<input style='background:" + (hasChanged ? "#ff0" : "#fff") + "' id='" + v.items[j].prop[PROP_NAME] + "' type='text' value='" + (v.items[j].prop[PROP_VALUE] == null ? v.items[j].prop[PROP_DEFAULT] : v.items[j].prop[PROP_VALUE]) + "' />";
            }
            else {
                prop10 = "<span style='background:" + (hasChanged ? "#ff0" : "#fff") + "'>" + (v.items[j].prop[PROP_VALUE] == null ? (v.items[j].prop[PROP_DEFAULT] == null ? "" : v.items[j].prop[PROP_DEFAULT]) : v.items[j].prop[PROP_VALUE]) + "</span>";
            }
            $(prefs).append("<tr style='padding: 3px;'>" + "<td>" + v.items[j].prop[PROP_NAME] + "</td>" + "<td class='editable-prop'>" + prop10 + "</td>" + "<td>" + (v.items[j].prop[PROP_DEFAULT] == null ? "" : v.items[j].prop[PROP_DEFAULT]) + "</td>" + "<td>" + (v.items[j].prop[PROP_DESC] == null ? "" : v.items[j].prop[PROP_DESC]) + "</td>" + "</tr>");
        }
    }
    $(prefs).append("</tbody>");
    return $(prefs);
}

appx_session.loadOptions();
//JTNJTN Load developer option overrides here
appx_session.setProp("clientServerVersionStr", appxServerClientVersionStr);
appx_session.setProp("clientServerVersionNum", appxServerClientVersionNum);
appx_session.setProp("serverConnectorVersionStr", appx_session.serverConnectorVersionStr);
appx_session.setProp("serverConnectorVersionNum", appx_session.serverConnectorVersionNum);
appx_session.setProp("screenColumns", appx_session.screencols.toString());
var tempSR = appx_session.screenrows - 3;
appx_session.setProp("screenRows", tempSR.toString());



$("#client_version").text(appxServerClientVersionStr);
$("#appx_access").prop('title', appx_session.language.tooltips.clientVersion + appxServerClientVersionStr); // <-- does not support HTML tags in tooltip

//try local first to keep IE happy
// creates a global LOCAL OS Session object
// NOTE: this object is destroyed on refresh, may need a work-around to prevent user to accidentally restarting a session
try {
    if (appxLocalRequired === "true") {
        localos_session = new LOCALOS();
    }
}
catch (ex) {
    console.log("LOCALOS: " + ex.message);
    console.log(ex.stack);
}

if (appxLoginAutoConnect) {
    setTimeout( function() {
        start_session();
    }, 1000 );
}