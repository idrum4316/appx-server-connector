
/*********************************************************************
 **
 **   server/appx-client-setfield.js - Client Set Field processing
 **
 **   This module contains code to process client set field data.
 **
 *********************************************************************/

// what_str =  "@(#)Appx $Header: /src/cvs/appxHtml5/server/appx-client-setfield.js,v 1.11 2019/05/13 13:01:20 pete Exp $";

function appxsetfieldhandler(x) {
    setfield(x);
}

function sendappxdate(row, col, datestring) {
    var ms = {
        cmd: 'appxdate',
        args: [row, col, datestring],
        handler: 'appxsetfieldhandler',
        data: null
    };
    appx_session.ws.send(JSON.stringify(ms));
}

function setfield(x) {
    var clientId = getClientId("appxitem_" + x.data.col.toString() + "_" + x.data.row.toString());
    $("#" + clientId).is("input") ? $("#" + clientId).val(ab2str(x.data.data)) : $("#" + clientId).find(".appxdatevalue").val(ab2str(x.data.data));
    $("#" + clientId).is("input") ? $("#" + clientId).focus() : $("#" + clientId).find(".appxdatevalue").focus();
    appx_session.activeDatepicker = null;
}