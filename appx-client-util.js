/****************************************************************************/
//Utility Functions : appx-client-util.js
//01/28/2014
//Chris Smith
/****************************************************************************/

//binary.js: http://ats.oka.nu/titaniumcore/js/tools/binary.readme.txt
//s2ba_be(i) Converts a 16bit-integer to a byte array in big-endian byte order.
//i2ba_be(i) Converts a 32bit-integer to a byte array in big-endian byte order.
//DataStream.js: https://github.com/kig/DataStream.js - might be useful too?
"use strict";
function hton16(i) {
    return [
        0xff & (i >> 8),
        0xff & (i >> 0)
    ];
}

function hton32(i) {
    return [
        0xff & (i >> 24),
        0xff & (i >> 16),
        0xff & (i >> 8),
        0xff & (i >> 0)
    ];
}

// Utilities

function cleanClassName(x) {
    return (x.replace(/[^_0-9a-zA-Z]/g, "_"));
}

function ab2int32(buf) {
    return new DataView(new Uint8Array(buf).buffer).getUint32(0);
}

// Convert buffer to string
function ab2str(buf) {
    return decodeURIComponent(escape(String.fromCharCode.apply(null, new Uint16Array(buf)) + " "));
}

// Convert buffer to string
function ab3str(buf) {
    return decodeURIComponent(escape(String.fromCharCode.apply(" ", new Uint8Array(buf)) + " <br/>"));
}

// Convert buffer to string
function ab4str(array) {
    var string = "";
    for (var i = 0; i < array.length; i++) {
        if (array[i] != 0) {
            string += String.fromCharCode(array[i]);
        }
        else {
            string += " ";
        }
    }
    return string + " ";
}

// Convert buffer to string
function buf2str(buf) {
    var str = '';
    var charcode;
    logactivity("got buffer:  " + JSON.stringify(buf));
    for (var i = 0; i < buf.length; i++) {
        charcode = buf.readUInt8(i);
        if (charcode == 0) {
            str += " ";
        }
        else {
            str += String.fromCharCode(charcode);
        }
    }
    buf = [];
    return decodeURIComponent(escape(str));
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
    var buf = new Uint8Array(str.length); // 1 bytes for each char
    for (var i = 0, strLen = str.length; i < strLen; i++) {
        buf[i] = str.charCodeAt(i);
    }
    return buf;
}

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

function getUnicodeCharacter(cp) {
    if (cp >= 0 && cp <= 0xD7FF || cp >= 0xE000 && cp <= 0xFFFF) {
        return String.fromCharCode(cp);
    }
    else if (cp >= 0x10000 && cp <= 0x10FFFF) {

        // we substract 0x10000 from cp to get a 20-bits number
        // in the range 0..0xFFFF
        cp -= 0x10000;

        // we add 0xD800 to the number formed by the first 10 bits
        // to give the first byte
        var first = ((0xffc00 & cp) >> 10) + 0xD800

        // we add 0xDC00 to the number formed by the low 10 bits
        // to give the second byte
        var second = (0x3ff & cp) + 0xDC00;

        return String.fromCharCode(first) + String.fromCharCode(second);
    }
}

function decodeUTF16LE(binaryStr) {
    var cp = [];
    for (var i = 0; i < binaryStr.length; i += 2) {
        cp.push(
            binaryStr.charCodeAt(i) |
            (binaryStr.charCodeAt(i + 1) << 8)
        );
    }

    return String.fromCharCode.apply(String, cp);
}

function fixedCharCodeAt(str, idx) {
    // ex. fixedCharCodeAt ('\uD800\uDC00', 0); // 65536
    // ex. fixedCharCodeAt ('\uD800\uDC00', 1); // 65536
    idx = idx || 0;
    var code = str.charCodeAt(idx);
    var hi, low;

    // High surrogate (could change last hex to 0xDB7F to treat high
    // private surrogates as single characters)
    if (0xD800 <= code && code <= 0xDBFF) {
        hi = code;
        low = str.charCodeAt(idx + 1);
        if (isNaN(low)) {
            throw 'High surrogate not followed by low surrogate in fixedCharCodeAt()';
        }
        return ((hi - 0xD800) * 0x400) + (low - 0xDC00) + 0x10000;
    }
    if (0xDC00 <= code && code <= 0xDFFF) { // Low surrogate
        // We return false to allow loops to skip this iteration since should have
        // already handled high surrogate above in the previous iteration
        return false;
    }
    return code;
}


/**
 * Format a javascript DateChooser value into an Appx compatible
 * date value for sending to the engine.
 *
 * @param date The date value from the date chooser.  it will only
 *             contains data for the date parts defined in the Appx
 *             date field.
 *
 * @param datemsk The date portion mask showing what date component
 *                are defiend in the data field and the mask component
 *                offsets match the date value offsets.
 *
 * @param timemsk The time portion mask showing what time component
 *                are defiend in the data field.  Since a time value
 *                is not passed in we just use the system current time
 *                value.  We look at the timmsk to see what time
 *                components are defined in the data field precision.
 * 
 * @return This function returns a 16 digit Appx date value with --
 *         for the date and time compoenents not defined in the Appx
 *         data field as communicated by the datemsk and timemsk strings.
 */

APPX.DateFormatter2 = function (date, datemsk, timemsk) {

    // Adjust masks for easier parsing

    var myDateMask = datemsk.replace(/y/g, "yy").replace(/yyyy/g, "ccyy");
    var myTimeMask = timemsk.replace(/HH/g, 'hh').replace(/l/g, 'll');

    // Create a time value from the current time

    function zeroFill( i ) {
	return  i < 10  ? '0' + i : i;
        }

    var currentTime = new Date();
    var hh = zeroFill( currentTime.getHours() );
    var mm = zeroFill( currentTime.getMinutes() );
    var ss = zeroFill( currentTime.getSeconds() );
    var ll = zeroFill( Math.floor(currentTime.getMilliseconds() / 10) ); 
    var time = hh + ':' + mm + ':' + ss + '.' + ll;

    // Build up Appx date time value and return it

    var result = "";

    function getDateTimePart( value, mask, part ) {
	var offset = mask.indexOf( part );
	return offset < 0 ? '--' : value.substr(offset, 2);
    }

    result += getDateTimePart( date, myDateMask, 'cc' );
    result += getDateTimePart( date, myDateMask, 'yy' );
    result += getDateTimePart( date, myDateMask, 'mm' );
    result += getDateTimePart( date, myDateMask, 'dd' );

    result += getDateTimePart( time, myTimeMask, 'hh' );
    result += getDateTimePart( time, myTimeMask, 'mm' );
    result += getDateTimePart( time, myTimeMask, 'ss' );
    result += getDateTimePart( time, myTimeMask, 'll' );

    return result;
}

//use to Sort an array of objects
// "-PropertyName" for desc
function SortByProperty(property) {
    var sortOrder = 1;
    if (property[0] === "-") {
        sortOrder = -1;
        property = property.substr(1);
    }
    return function (a, b) {
        var result = a[property] == null ? -1 : b[property] == null ? 1 : (a[property] < b[property]) ? -1 : (a[property] > b[property]) ? 1 : 0;
        return result * sortOrder;
    }
}

/*
**Function to return the difference between 2 numbers for array sorting purposes
**
**@param a: first number to compare
**@param b: second number to compare
**
**@return: integer based on which number is bigger
**
*/
function numberSort(a, b) {
    return (a - b);
}

//CharView
var appxColor = {
    black: [0, 0, 0], //#000000
    blue: [0, 0, 255], //#0000ff
    cyan: [0, 255, 255], //#00ffff
    darkBlue: [107, 35, 142], //0x6b238e (#00008b)
    darkCyan: [95, 159, 159], //0x5F9F9F (#008b8b)
    darkGray: [169, 169, 169], //#a9a9a9
    darkGreen: [47, 79, 47], //0x2F4F2F (#006400)
    darkMagenta: [142, 35, 107], //0x8E236B (#8b008b)
    darkRed: [142, 35, 35], //0x8E2323 (#8b0000)
    green: [0, 255, 0], //#00ff00//#008000(128)
    lightGray: [211, 211, 211], //#d3d3d3
    magenta: [255, 0, 255], //#ff00ff
    orange: [255, 165, 0], //#ffa500
    red: [255, 0, 0], //#ff0000
    white: [255, 255, 255], //#ffffff
    yellow: [255, 255, 0], //#ffff00
};
var appxColorTable = [
    appxColor.black,
    appxColor.blue,
    appxColor.cyan,
    appxColor.green,
    appxColor.magenta,
    appxColor.red,
    appxColor.yellow,
    appxColor.white,
    appxColor.darkBlue,
    appxColor.darkCyan,
    appxColor.darkGreen,
    appxColor.darkMagenta,
    appxColor.darkRed,
    appxColor.darkGray,
    appxColor.lightGray
];

function appxColorXlate(colorName, alpha) {
    try {
        var clr = null;
        if (colorName != null && colorName.length > 0) {
            // First, look for hex encoded RGB values
            var colorArray = colorName.split('');
            if (colorArray[0] == '#' && ((colorArray.length == 7) || (colorArray.length == 9))) {
                var r = parseInt(colorName.substring(1, 3), 16); //from, to - parseInt(,16=toHex)
                var g = parseInt(colorName.substring(3, 5), 16)
                var b = parseInt(colorName.substring(5, 7), 16)
                clr = [r, g, b];
                if (!alpha) alpha = (colorArray.length == 9 ? colorName.substring(7, 9) : 100); //255
            }

            if (!clr) {
                // If that failed, look for numeric table positions
                var c = colorArray[0];
                if (c >= '0' && c <= '9') //isDigit
                {
                    try {
                        clr = colorTable[parseInt(colorName) - 1];
                    }
                    catch (e) {
                        clr = null;
                        console.log(e.stack);
                    }
                }
                else {
                    // OK, last chance.  Maybe it is a color name
                    colorName = colorName.toLowerCase();
                    if (colorName == "black") clr = appxColor.black;
                    if (colorName == "blue") clr = appxColor.blue;
                    if (colorName == "cyan") clr = appxColor.cyan;
                    if (colorName == "darkGray") clr = appxColor.darkGray;
                    if (colorName == "gray") clr = appxColor.gray;
                    if (colorName == "green") clr = appxColor.green;
                    if (colorName == "lightGray") clr = appxColor.lightGray;
                    if (colorName == "magenta") clr = appxColor.magenta;
                    if (colorName == "orange") clr = appxColor.orange;
                    if (colorName == "pink") clr = appxColor.pink;
                    if (colorName == "red") clr = appxColor.red;
                    if (colorName == "white") clr = appxColor.white;
                    if (colorName == "yellow") clr = appxColor.yellow;
                }
            }
        }

        if (!clr || clr.length != 3) {
            console.log("CharView.xlateColor(" + colorName + ") Can't translaet color.  Using 'orange' instead.");
            clr = appxColor.orange;
        }
        if (!alpha) alpha = 1;
        else if (alpha > 1) alpha = Math.round(alpha) / 100;
        return 'rgba(' + clr[0] + ',' + clr[1] + ',' + clr[2] + ',' + alpha + ')'
    }
    catch (ex) {
        console.log('appxXlateColor: ' + ex);
        console.log(ex.stack);
    }
}

function base64ToArrayBuffer(base64) {
    var binary_string = window.atob(base64);
    var len = binary_string.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}


/*Converts array buffer to base64 encoding*/
function arrayBufferToBase64(ab) {
    var bin = "";
    var bytes = new Uint8Array(ab);
    for (var i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

function Str2byteArray(str) {
    var arObj = str4ab(str);
    var ar = [];
    for (var i = 0; i < arObj.length; i++)
        ar.push(arObj[i]);
    return ar;
}

function StrGetSubstr(str, prefix, suffix) {
    var idx1 = str.indexOf(prefix);
    var str1 = str.substr(idx1 + prefix.length);
    var idx2 = str1.indexOf(suffix);
    var str2 = str1.substr(0, idx2);
    return str2;
}

/*
**Function to check browser versions. Checks are made in specific order to allow
**for browsers reporting multiple browser support. IE does not specify any browser
**so the default if we get through every check is to return IE.
**
**@return: String of browser version.
*/
function checkBrowser() {
    var ua = navigator.userAgent;

    if (ua.indexOf("Edge") != -1) {
        return "Edge";
    }

    if (ua.indexOf("OPR") != -1) {
        return "Opera";
    }

    if (ua.indexOf("Chrome") != -1) {
        return "Chrome";
    }

    if (ua.indexOf("Safari") != -1) {
        return "Safari";
    }

    if (ua.indexOf("Firefox") != -1) {
        return "Firefox";
    }

    return "IE";
}

/*
**Function to take a number and round it away from zero. ex -1.8 == -2 && 1.8 = 2
**
**@param x: number to round
**
**@return a: rounded number
*/
function roundAwayFromZero(x) {
    var a;
    if (x < 0) {
        a = Math.floor(x);
    } else {
        a = Math.ceil(x);
    }
    return a;
}

/*
**Function to take a number and round it towards zero. ex -1.8 == -1 && 1.8 = 1
**
**@param x: number to round
**
**@return a: rounded number
*/
function roundTowardsZero(x) {
    var a;
    if (x < 0) {
        a = Math.ceil(x);
    } else {
        a = Math.floor(x);
    }
    return a;
}

/*
**Function to get cursor position inside a text field and return that position
**
**@param $tag: Element to get cursor position from
**
**@return integer: Position of cursor or -1 for error
*/
function getCursorPosition($tag) {
    var ssElement = false;
    var ssElements = [
        "[type=password]",
        "[type=search]",
        "[type=text]",
        "isindex",
        "textarea"
    ];

    for (var i = 0; i < ssElements.length; i++) {
        if ($tag.is(ssElements[i])) {
            ssElement = true;
            break;
        }
    }
    if (ssElement) {
        return document.getElementById($tag.attr("id")).selectionStart;
    }

    return -1;
}

/*
**Function to clear some items on screen that need to be cleared and
**reset some variables before displaying new screen.
*/
function clearAndReset() {
    /*Clear pending counts*/
    appx_session.pendingTables = 0;
//    appx_session.pendingResources = {};
//    appx_session.pendingResources.length = 0;

    for (name in CKEDITOR.instances) {
        $(".ui-tooltip").remove();

        //This clears all textareas on the screen not just the html editor's. Replaced by the following line
        //$("textarea").val("");
        var textAreaElem;
        if(CKEDITOR.instances[name].element){
            textAreaElem= CKEDITOR.instances[name].element.$;
            textAreaElem.value = "";
        }
       
        if (name.indexOf("stale") === -1 && CKEDITOR.instances[name].status !== "unloaded") {
            CKEDITOR.instances[name].destroy(true);
        }
        //This should only apply to ckeditors text areas
        //$("textarea").hide();
        if(textAreaElem){
            textAreaElem.style.display = "none";
        }
    }
}

/*
**Function to attach on paste event listeners to input and textarea elements
*/
function callValidateText() {
    $("input, textarea").on('input', function () {
        var element = this;
        setTimeout(function () {
            validateInputText($(element).val(), $(element).data("unicode"));
        }, 0);
    });
}

/*
**Function to test encoding against HTML client set character
**encoding. We do this by encoding the string with the HTML
**client set encoding and then decoding the encoded string
**with the same encoding. If the output of the decoded
**string is same as passed in variable then encodings
**are compatible.
**
**@param mStringToValidate: Pasted string requiring validation
**@param unicode: Boolean for whether the field is a unicode field
*/
function validateInputText(mStringToValidate, unicode) {
    try {
        var htmlEncoding = appx_session.rawEncoding;
        if (unicode) {
            htmlEncoding = "utf-8";
        }
        var ms = {
            cmd: 'appxCheckCharacterEncoding',
            args: [mStringToValidate, htmlEncoding],
            handler: 'appxCheckCharacterEncoding',
            data: null
        };
        appx_session.ws.send(JSON.stringify(ms));
    } catch (e) {
        console.log(e);
        console.log(e.stack)
    }
}

/*
**Function to check table data for invalid characters and
**display an alert letting users know that the table has
**invalid characters being displayed
*/
function invalidTableData() {
    if ($("td:contains('\(???\)')").length > 0) {
        alert(appx_session.language.alerts.characterError);
    }
}

/*
**Function to display an alert letting users know that there were 
**invalid characters input for the chosen encoding
*/
function appxEncodingError(encoding) {
    var message = appx_session.language.alerts.encodingFrontError + encoding + appx_session.language.alerts.encodingBackError;
    //alert(message);
    appxSetStatusText(message, 2);
}

/*
**Function to send file into mongodb
**
**@param fileBlob: Blob of file to send
**@param fileName: Name of file to send
**@param callback: Callback function
*/
function uploadFileToMongo(fileBlob, fileName, callback) {
    var url = appx_session.uploadURL + encodeURI(fileName.replace(/ /g, "_"));
    var xhr = new XMLHttpRequest;
    xhr.open("POST", url);
    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4 && xhr.status === 201) {
            appxClearStatusMsgText();
            appxSetStatusText("File upload to server complete...");
            $("#main").unblock();
            if (callback) {
                callback();
            }
        }
    }
    xhr.send(fileBlob);
}

/*
**Function to send saved table preferences into mongodb
**
**@param table: Table 
*/
function tableToMongo(tableData, sendTable) {
    getTableFromMongo(tableData, function (tableData) {
        var tableID = tableData.tableID;
        var tableHash = tableData.tableHash;
        if (appx_session.tablePreferences[tableID] === undefined) {
            appx_session.tablePreferences[tableID] = {};
        }
        if (tableID !== undefined && appx_session.tablePreferences[tableID] !== undefined &&
            appx_session.rowCallback === false) {
            if (appx_session.tablePreferences[tableID].colMapNames === undefined) {
                appx_session.tablePreferences[tableID].colMapNames = [];
            }
            appx_session.tablePreferences[tableID].colModel = tableData.colModel;
            appx_session.tablePreferences[tableID].colMap = tableData.colMap;
            appx_session.tablePreferences[tableID].filters = tableData.filters;
            appx_session.tablePreferences[tableID].lastSortName = tableData.lastSortName;
            appx_session.tablePreferences[tableID].lastSortOrder = tableData.lastSortOrder;
            appx_session.tablePreferences[tableID].virtualScroll = tableData.virtualScroll;
            for (var i = 0; i < appx_session.tablePreferences[tableID].colModel.length; i++) {
                appx_session.tablePreferences[tableID].colMapNames[i] = appx_session.tablePreferences[tableID].colModel[i].name
            }
        }


        if (appx_session.gridpropscache[tableHash] === undefined) {
            appx_session.gridpropscache[tableHash] = {};
        }
        if (appx_session.gridpropscache[tableHash].colMapNames === undefined) {
            appx_session.gridpropscache[tableHash].colMapNames = [];
        }
        appx_session.gridpropscache[tableHash].colModel = tableData.colModel;
        appx_session.gridpropscache[tableHash].colMap = tableData.colMap;
        appx_session.gridpropscache[tableHash].filters = tableData.filters;
        appx_session.gridpropscache[tableHash].lastSortName = tableData.lastSortName;
        appx_session.gridpropscache[tableHash].lastSortOrder = tableData.lastSortOrder;
        appx_session.gridpropscache[tableHash].selected = tableData.selected;
        appx_session.gridpropscache[tableHash].virtualScroll = tableData.virtualScroll;
        appx_session.gridpropscache[tableHash].scrollTop = tableData.scrollTop;
        for (var i = 0; i < appx_session.gridpropscache[tableHash].colModel.length; i++) {
            appx_session.gridpropscache[tableHash].colMapNames[i] = appx_session.gridpropscache[tableHash].colModel[i].name
        }
        if (!($.isEmptyObject(appx_session.tablePreferences)) && sendTable) {
            var xhr = new XMLHttpRequest;
            xhr.open("POST", appx_session.userPrefsURL + "preferences");
            xhr.send(JSON.stringify(appx_session.tablePreferences));
        }
        appx_session.tableDefaults[tableID] = {};
    });
}

/*
**Function to get table data from mongodb
*/
function getTableFromMongo(tableData, callback) {
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
        callback(tableData);
    }
    xhr.send();
}

function appxUtil_downloadUrl( url ) {
    if( checkBrowser() === "IE" ) {
	    window.open( url, "_blank" );
    }
    else {
	var fileName = url.replace(/.*[/]/g,"");
    
	var link = document.createElement('a');
	link.href = url;
    link.download = fileName;
    link.target = "_blank";
	document.body.appendChild(link);	    
	link.click();
	document.body.removeChild(link);
    }
}

