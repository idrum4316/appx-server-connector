/**************************************************************************
**@File: appx-client-automaticLoginTemplate.js
**@Company: APPX Software, Inc.
**@Programmer: John Nelson
**@Last Edited By: John Nelson
**@Date Created: 14 Feb 2017
**@Date Last Modified: 14 Feb 2017
**@Description: Dynamically loads meta tags required for automatic login &
***logging in user to specific application
**@Function: setServerMetas
***************************************************************************/

"use strict";
/*
**Function to set meta tags for automatic login and logging in user to specific
**application
*/
function setServerMetas() {
    var serverMetas = {
        "appx-allow-noLogin": { "value": "false" }, //allow automatic login
        "appx-allow-specific": { "value": "false" }, //allow specific process login
        "appx-use-noLogin": { "value": "false" }, //use automatic login
        "appx-use-specific": { "value": "false" }, //use specific process login
        "appx-auto-user": { "value": "{Appx Login Name}" },
        "appx-auto-pswd": { "value": "{Appx Login Password}" },
        "appx-auto-host": { "value": "{Appx Login Server}" },
        "appx-auto-port": { "value": "{Appx Login Port}" },
        "appx-application": { "value": "Appx Application" },
        "appx-database": { "value": "Appx Database" },
        "appx-procType": { "value": "Process Type" },
        "appx-process": { "value": "Name of Process" },
        "appx-browser-redirect": { "value": "Enter Redirect Website Here" }
    }
    
    for (var tags in serverMetas) {
        var mTag = document.createElement("meta");
        mTag.name = tags;
        mTag.content = serverMetas[tags].value;
        document.getElementsByTagName("head")[0].appendChild(mTag);
    }
}

setServerMetas();