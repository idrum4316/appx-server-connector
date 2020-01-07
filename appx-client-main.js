/*********************************************************************
 **
 **   server/appx-client-main.js - Client main logic processing
 **
 **   This module contains code to process the main client logic.
 **
 *********************************************************************/

"use strict";
// what_str =  "@(#)Appx $Header: /src/cvs/appxHtml5/server/appx-client-main.js,v 1.50 2019/01/03 01:07:07 pete Exp $";
$("#btn_appx_login").click(function () {
    start_session();
});

$("#btn_appx_reconnect").click(function () {
    session_management();
});

$("#appx_login_modul input").keyup(function (event) {
    if (fixKeyEvent(event) && (event.which == 10 || event.which == 13)) start_session();
});

$("#appx-status-msg").html("");
$(".appx-show-on-load").show();

if ((!appxNewSession) && (!appxLoginAutoConnect)) {
    $("#appx_login_modul").show();
    $("#appx_server").focus();
}

$(document).ready(function () {
    if (localStorage && localStorage["appx_options"] && !localStorage["appx_ls_version"]) {
        localStorage.clear();
        localStorage["appx_ls_version"] = "1";
        window.location.reload()
    }
});

//Client To Server Functions - each of these will likely have a handler name myfunctionhandler();

// Appx Main Functions - These may be Injected after the get_appx_init call from the main APPX session object
// or built into the client
function appxobjectcreatehandler(msg) {
    appx_session.objEventFired = false;
    appxSetLocked(true);
    appx_session.objItems = [];
    appx_session.ws.send(JSON.stringify({
        cmd: 'appxmessage',
        args: [0, 0, 0, 0, 0, 0, 0, 0],
        handler: 'appxobjectcreatehandler',
        data: null
    }));
}

function appxobjectinvokehandler(msg) {
    try {
        //AppxTokenScan
        if (msg.data.proto.indexOf("addListItem") != -1) {
            appx_session.objItems.push(msg.data.argBlocks[0].dataObject);
        }
        else if (msg.data.proto.indexOf("showTheList") != -1) {
            var cur = appxGetScanCursorPos();
            var $tag = $("#" + getClientId("appxitem_" + cur.col + "_" + cur.row));
            if ($tag.length) {
                var $sel = $('<select>');
                var len = appx_session.objItems.length;
                var val = $tag.val();
                for (var i = 0; i < len; i++) {
                    var $opt = $('<option>')
                        .attr('value', i + 1)
                        .html(appx_session.objItems[i]).appendTo($sel);
                    if (appx_session.objItems[i] == val)
                        $opt.attr('selected', 'selected');
                }
                //need some extra z-index to be on top of following scrolling records
                var zin = 99999;
                var offset = $tag.offset();
                offset.top += 21;
                var parent = $tag.parent();
                var top = ($tag.position().top + 21);
                var height = $tag.closest(".appxbox").height();

                /*Change where we are getting parent from if scrolling region*/
                if (parent.hasClass("appx-scroll-act")) {
                    parent = $(".appxbox.appx-scroll").parent();
                    height = parent.height();
                }
                if ((top + (len * 17)) > height) {
                    len = ((height - top) / 17);
                }
                $sel.appendTo(parent)
                    .attr('size', len)
                    .blur(appxFireObjectEvent)
                    .click(appxFireObjectEvent)
                    .css({
                        'position': 'absolute',
                        'z-index': zin,
                        'min-width': $tag.width()
                    })
                    .focus()
                    .offset(offset);
                appx_session.objFocus = $sel;
            }
            else {
                //this happens for example after choosing select path on the same key
                appx_session.objFocus = $("<select>").val('0'); //fake it
                appxFireObjectEvent();
            }
        }
    }
    catch (ex) {
        console.log("appxobjectinvokehandler: " + ex);
        console.log(ex.stack);
    }
}

function appxFireObjectEvent() {
    if (appx_session.objFocus && !appx_session.objEventFired) {
        console.log(appx_session.objEventFired);
        appx_session.objEventFired = true;
        var val = appx_session.objFocus.val();
        appx_session.ws.send(JSON.stringify({
            cmd: 'appxmessage',
            args: hton32(0).concat(hton32(val)),
            handler: 'appxobjectinvokehandler',
            data: null
        }));
    }
}

function appxobjectdestroyhandler(msg) {
    appxSetLocked(false);
    /*Delay clearing objFocus so we can use it to kick out of widget callback
    **when button is pressed while engine is processing listbox message*/
    setTimeout(function () {
        appx_session.objFocus = null;
    }, 250);
}
