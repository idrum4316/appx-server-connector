/*********************************************************************
 **
 **   server/appx-client-localos.js - Client local OS interface
 **
 **   This module contains code to process local OS requests
 **
 *********************************************************************/

// what_str =  "@(#)Appx $Header: /src/cvs/appxHtml5/server/appx-client-localos.js,v 1.93 2018/08/15 19:30:14 jnelson Exp $";
function appxIsLocalReady() {
    return (localos_session && localos_session.ws.readyState == 1)
}

//File Message Handler
//SENDING A File from the SERVER to the CLIENT(client receive)
//Server is telling client to save a file locally
function appxsendfilehandler(x) {
    if (appxIsLocalReady()) {
        switch (x.messagepart) {
            case -1:
                var msgfilenamedata = [];
                var filepath = appx_session.currsendfile.filename;
                appxClearStatusMsgText();
                appxSetStatusText("Saving File...");
                appx_session.currsendfile.filedata = [];
                setTimeout(function setTimeout1() {
                    //send client file path length
                    var ms = {
                        cmd: 'appxmessage',
                        args: hton32(filepath.length),
                        handler: 'appxsendfilehandler',
                        data: null
                    };
                    appx_session.ws.send(JSON.stringify(ms));
                    //send client file path
                    for (var vi = 0; vi < filepath.length; vi++) {
                        msgfilenamedata.push(filepath.charCodeAt(vi));
                    }
                    var ms = {
                        cmd: 'appxmessage',
                        args: msgfilenamedata,
                        handler: 'appxsendfilehandler',
                        data: null
                    };
                    appx_session.ws.send(JSON.stringify(ms));
                    //send client status EOF
                    var ms = {
                        cmd: 'appxmessage',
                        args: [3, 1],
                        handler: 'appxsendfilehandler',
                        data: null
                    };
                    appx_session.ws.send(JSON.stringify(ms));
                    appxClearStatusMsgText();
                    appxSetStatusText("File Download Complete...");
                    setTimeout(function setTimeout2() {
                        if ($("#appx-status-msg").html() === "File Download Complete...") {
                            appxClearStatusMsgText();
                        }
                    }, 1000);
                }, appx_session.currsendfile.blocksreceived * 1); //end setTimeout

                break;
            case 3:
                appx_session.currsendfile.filename = x.data.filename;
                appx_session.currsendfile.guid = Math.floor((Math.random() * 1000000) + 1);
                appx_session.currsendfile.filedatareceived = 0;
                appx_session.currsendfile.blocksreceived = 0;
                appx_session.currsendfile.datalengthneeded = x.data.datalength;
                if (appx_session.currsendfile.filename.indexOf("$(") > -1) {
                    appx_session.currsendfile.filename = appx_session.parseOption(appx_session.currsendfile.filename);
                }
                else {
                    appx_session.currsendfile.filename = appx_session.currsendfile.filename;
                }
                if (appx_session.currsendfile.filename.indexOf("/") == -1 && appx_session.currsendfile.filename.indexOf("\\") == -1) {
                    appx_session.currsendfile.filename = appx_session.parseOption("$(userHome)" + appx_session.fileseparatorchar + appx_session.currsendfile.filename);
                }
                appxClearStatusMsgText();
                appxSetStatusText("Creating File:  " + appx_session.currsendfile.filename);
                appx_session.currsendfile.filecreated = false;
                CreateFile(appx_session.currsendfile);
                break;
            case 5:
                appx_session.currsendfile.blocksreceived += 1;
                appx_session.currsendfile.filedatareceived += x.data.length;
                appxClearStatusMsgText();
                appxSetStatusText("File Downloading... Received:  " + appx_session.currsendfile.filedatareceived + " Bytes of " + appx_session.currsendfile.datalengthneeded.toString() + " Needed");
                AppendFile(x.data);
                break;

            default:
                //append data to file via local connector
                break;
        }
    }
    else {
        //send client status EOF
        if (x.messagepart != -1) {
            var ms = {
                cmd: 'appxmessage',
                args: [0, 0],
                handler: 'appxsendfilehandler',
                data: null
            };
            appx_session.ws.send(JSON.stringify(ms));
        }
    }
}

// SET CLIPBOARD Handler
function appxsetclipboardhandler(x) {
    var clipboardobj = x.data;
    if (appxIsLocalReady()) {
        console.log("Setting Clipboard Data:  " + clipboardobj.data);
        ms = {
            cmd: 'setclipboard',
            args: [clipboardobj.data],
            handler: 'localos_setclipboard_handler',
            data: null
        };
        localos_session.ws.send(JSON.stringify(ms));
    }
    else {
        createClipboardDialog(true, x.data.data);
    }
}

// GET CLIPBOARD Handler
function appxgetclipboardhandler(x) {
    if (appxIsLocalReady()) {
        ms = {
            cmd: 'getclipboard',
            args: ["getclipboard"],
            handler: 'localos_exeoscmd_handler',
            data: null
        };
        localos_session.ws.send(JSON.stringify(ms));
    }
    else {
        createClipboardDialog(false);
    }
}

function buildOpenCommand(fileToOpen) {
    var arg = "";
/*    var cshell = appx_session.getRawProp("commandShell");   ##DELETEUSERPREFS##

    if (cshell && cshell.length > 0) {
        arg += cshell + appx_session.parseOption(urlString.substring(9));
    }
    else { */
        if (appx_session.globals["os"].indexOf("Win") > -1) {
            arg += 'powershell -Command "& {start-process \'' + fileToOpen.replace('/"/g', "").trim() + '\'}"';
        }
        else if (appx_session.globals["os"].indexOf("Mac") > -1) {
            arg += 'open ' + fileToOpen;
        }
        else {
            arg += 'xdg-open ' + fileToOpen;
        }
//    }
    return arg;
}

function buildOpenCommandDos(fileToOpen) {
    var arg = "";
//    var cshell = appx_session.getRawProp("commandShell"); ##DELETEUSERPREFS##
    if (fileToOpen.indexOf("/H") > -1) {
        fileToOpen = fileToOpen.replace(/\/h /i, "/b ");
    }
    if (fileToOpen.indexOf("/W") > -1) {
        fileToOpen = fileToOpen.replace(/\/w /i, "/WAIT ");
    }

/*    if (cshell && cshell.length > 0) {  ##DELETEUSERPREFS##
        arg += cshell + appx_session.parseOption(urlString.substring(9));
    }
    else {*/
        if (appx_session.globals["os"].indexOf("Win") > -1) {
            arg += ("start \"\" " + fileToOpen);
        }
        else if (appx_session.globals["os"].indexOf("Mac") > -1) {
            arg += 'open ' + fileToOpen;
        }
        else {
            arg += 'xdg-open ' + fileToOpen;
        }
//    }
    return arg;
}


// LOAD URL Handler
function appxloadurlhandler(x) {
    var cmd = x.data;
    var ms = {};
    var urlString = cmd.trim();
    var waitfor = false;
    var shellCmd = null;
    try {
        var urllen = urlString.toLowerCase().trim().length;
        if (urlString.toLowerCase().substring(0, 2).indexOf("/w") > -1 || urlString.toLowerCase().substring(urllen - 2, urllen).indexOf("/w") > -1) {
            urlString = cmd.replace("/w", "").trim();
            waitfor = true;
        }
        if (appx_session.globals["os"].indexOf("Win") && urlString.substring(0, 1).indexOf("@") > -1)
            urlString = urlString;
        if (urlString.substring(0, 1).indexOf("@") > -1) {
            try {
                ms = {
                    cmd: 'execoscmd',
                    args: [urlString.substring(1)],
                    handler: 'localos_exeoscmd_handler',
                    data: null
                };
                if (appxIsLocalReady()) {
                    localos_session.ws.send(JSON.stringify(ms));
                }
                else {
                    alert(appx_session.language.alerts.localCommandOSError + urlString);
                }
                }
                catch (e) {
                    console.log("CharView.loadUrl(" + urlString.substring(1) + "): Run Failed");
                    console.log("Run Failure Exception = " + e);
                    console.log(e.stack);
                }
        }
        else if (urlString.indexOf("$print:") > -1) {
            try {
                var prtcmd = appx_session.parseOption(urlString.substring(7).trim());
                if (appx_session.globals["os"].indexOf("Win") > -1) {
                    if (prtcmd.indexOf(".txt") > -1) {
                        ms = {
                            cmd: 'execoscmd',
                            args: ['\"' + appx_session.local_environment.currentworkingdirectory + '\\bin\\winprint.exe\" ' + prtcmd],
                            handler: 'localos_exeoscmd_handler',
                            data: null
                        };
                    }
                    else {
                        if (prtcmd.indexOf(".cfg") > -1) {
                            prtcmd = prtcmd.substring(prtcmd.indexOf(".cfg"), prtcmd.length);
                            prtcmd = prtcmd.replace(/\"/g, "\'");
                            prtcmd = prtcmd.replace("\.cfg' ", "")
                        }
                        ms = {
                            cmd: 'execoscmd',
                            args: ['powershell -Command "& {start-process \"' + prtcmd + '\" -Verb Print}"'],
                            handler: 'localos_exeoscmd_handler',
                            data: null
                        };
                    }
                }
                else {
                    //linux and mac
                    ms = {
                        cmd: 'execoscmd',
                        args: ['\"' + appx_session.local_environment.currentworkingdirectory + '/bin/appx_print\" ' + prtcmd],
                        handler: 'localos_exeoscmd_handler',
                        data: null
                    };
                }
                if (appxIsLocalReady()) {
                    localos_session.ws.send(JSON.stringify(ms));
                }
                else {
                    alert(appx_session.language.alerts.localPrintOSError + urlString);
                }
            }
            catch (e) {
                console.log("CharView.loadUrl(" + urlString.substring(1) + "): Run Failed");
                console.log("Run Failure Exception = " + e);
                console.log(e.stack);
            }
        }
        else if (urlString.indexOf("$printSetup:") > -1) {
            console.log("FIXME - newInstance() called");
            ms = {
                cmd: 'execoscmd',
                args: [appx_session.parseOption("$(cacheRoot)") + "\\print-dialog.exe"],
                handler: 'localos_exeoscmd_handler',
                data: null
            };
            if (appxIsLocalReady()) {
                localos_session.ws.send(JSON.stringify(ms));
            }
            else {
                alert(appx_session.language.alerts.localOSError);
            }
        }
        else if (urlString.indexOf("$display:") > -1) {
            ms = {
                cmd: 'execoscmd',
                args: [buildOpenCommand(appx_session.parseOption(urlString.substring(9)))],
                handler: 'localos_exeoscmd_handler',
                data: null
            };
            if (appxIsLocalReady()) {
                localos_session.ws.send(JSON.stringify(ms));
            }
            else {
                alert(appx_session.language.alerts.localDisplayOSError + urlString);
            }
        }
        else if (urlString.indexOf("$beep:") > -1) {
            var a = $('<embed height="50" width="100" src="' + appxClientRoot + '/assets/beep.wav">').appendTo("body").hide();
            setTimeout(function setTimeout() {
                $(a).remove();
            }, 1500);
        }
        else if (urlString.indexOf("$play:") > -1) {
            var $audio = $("<audio>");
            $audio.attr("src", appx_session.parseOption(urlString.substring(6)));
            $audio.attr("autoplay", "autoplay");
            $audio.appendTo("body");

        }
        else if (urlString.indexOf("$setprop:") > -1) {
            var prop = urlString.substring(9, urlString.length).split("=");
            appx_session.setPropEx(prop[0].trim(), prop[1], false);

        }
        else if (urlString.indexOf("$newsession:") > -1) {
            var propspairs = urlString.substring(12, urlString.length).trim().split(" ");
            var sessionflags = {};
            for (var i = 0; i < propspairs.length; i++) {
                var kv = propspairs[i].split("=");
                if (kv[0] != "")
                    sessionflags[kv[0].replace("-", "")] = kv[1].replace(/"/g, ''); // "
            }

            var startup_info = {};
            sendappxnewsession(appx_session.host, appx_session.port, appx_session.user, appx_session.password, appx_session.screenrows, appx_session.screencols, sessionflags) // "
        } else if ((urlString.indexOf("$(pushAndOpen") > -1) || ((urlString.indexOf("$(pushAndSave") > -1) && checkBrowser() != "Edge" && (urlString.indexOf(".pdf") > -1))) {
            /*If we push a file to the client that we want displayed in the browser
            **then we open a new tab and let the browser display the file*/
            var url = appx_session.appxCacheUrl + "/getFile/" + urlString.replace("$(", "").replace(")", "");
            url = encodeURI(url);
            var winOpen = window.open(url, "_blank");
            

        } else if ((urlString.indexOf("$(pushAndSave") > -1) || ((urlString.indexOf("$(pushAndOpen") > -1) && checkBrowser() == "Edge")) {
            /*If we push a file to the client that we want saved to client using
            **the browser then we open a new tab and let the browser display the file*/
            var url = appx_session.appxCacheUrl + "/getFile/" + urlString.replace("$(", "").replace(")", "");
            var blob = null;
            var fileId = urlString.substring(urlString.lastIndexOf("/"));
            var xhr = new XMLHttpRequest;
            xhr.open("GET", url);
            xhr.responseType = "arraybuffer";
            xhr.onload = function xhr_onload() {
                blob = new Blob([xhr.response]);
                var fileName = appx_session.getProp("dataCachePath") + fileId;
                saveAs(blob, fileName);
            }
            xhr.send();
        } else {
            var runString = [];
            runString[0] = "";
            if (shellCmd) {
                runString[0] = shellCmd;
            }
            runString[1] = urlString;
            try {
                ms = {
                    cmd: 'execoscmd',
                    args: [buildOpenCommandDos(appx_session.parseOption(runString[1]))],
                    handler: 'localos_exeoscmd_handler',
                    data: null
                };
                if (appxIsLocalReady()) {
                    localos_session.ws.send(JSON.stringify(ms));
                }
                else {
                    if (urlString.indexOf("http") < 0) {
                        urlString = "http://" + urlString;
                    }
                    window.open(urlString, "_blank", "toolbar=yes, scrollbars=yes, resizable=yes, location=yes, menubar=yes, status=yes, titlebar=yes, channelmode=yes, top=50, left=50, width=" + $(window).width() * .8 + ", height=" + $(window).height() * .8 + "");
                }
            }
            catch (e) {
                console.log("CharView.loadUrl(" + runString[0] + " " + urlString + "): Run Failed");
                console.log("Run Failure Exception = " + e);
                console.log(e.stack);
            }
        }
    }
    catch (e) {
        console.log("appxloadurlhandler(" + urlString + "): Bad URL, e=" + e);
        console.log(e.stack);
    }
}

//SENDING A File from the CLIENT to the SERVER(server receive)
//Server is telling client to grab a file and send it
function appxreceivefilehandler(x) {
    try {
        var url = x.data;
        if (url.length > 0) {
            /*If we put a file into mongo for server to grab then we get file from
            **mongo and call function to send file to server. Else we use the old
            **method involving the local connector to grab file*/
            if (url.indexOf("$(sendFile)") > -1) {
                var ms = {
                    cmd: 'appxMongoToEngine',
                    args: [],
                    handler: "appxreceivefilehandler",
                    fileName: url.substring(url.lastIndexOf("\/")),
                    data: null
                };
                appx_session.ws.send(JSON.stringify(ms));
            } else if (url.indexOf("$(signature)") > -1) {
                /*Upon receiving a file upload request for a signature we create
                **a file dialog for uploading signature. This code is self contained
                **and doesn't depend on any other functions to capture signature and
                **transmit to engine.*/
                var fd = $("<div>").addClass("appxsignaturedialog").css({
                    "z-index": 200000
                });
                var $canvas = $("<canvas>").addClass("signaturepad");
                $(fd).append($canvas);
                $("body").append(fd);
                $.each($(".appxsignaturedialog"), function $_each(i, el) {
                    $(el).dialog({
                        open: function $_dialog_open(event, ui) {
                            $(this).parent().addClass("appx-signature-dialog-parent").position({
                                my: "center",
                                at: "center",
                                of: "#box_0"
                            });
                            $(this).addClass("appx-signature-dialog");
                            /*Creating global so button clicks have access to signature pad*/
                            appx_session.signaturePad = new SignaturePad($(".signaturepad")[0]);
                            //const data = appx_session.signaturePad.toData();
                            setTimeout(function () {
                                var ratio = Math.max(window.devicePixelRatio || 1, 1);
                                $(".signaturepad")[0].width = $(".signaturepad")[0].offsetWidth * ratio;
                                $(".signaturepad")[0].height = $(".signaturepad")[0].offsetHeight * ratio;
                                $(".signaturepad")[0].getContext("2d").scale(ratio, ratio);
                                appx_session.signaturePad.clear();
                            }, 0);
                        },
                        close: function $_dialog_close() {
                            /*If we close the dialog without uploading a signature then we send a fail
                            **back to engine*/
                            if (appx_session.signaturePadFail) {
                                var ms = {
                                    cmd: 'appxmessage',
                                    args: [3, 0],
                                    handler: "appxreceivefilehandler",
                                    data: null
                                };
                                appx_session.ws.send(JSON.stringify(ms));
                            }
                            appx_session.signaturePadFail = true;
                            $(this).dialog("destroy").remove();
                        }
                    });
                    $(el).dialog("open");
                });

                $(fd).append($("<input id='submitsignature' type='button' value='" + appx_session.language.buttons.submit + "'>").click(function $_click() {
                    if (!appx_session.signaturePad.isEmpty()) {
                        /*Block the screen with message while uploading files*/
                        $("#main").block({
                            message: "<h1>Uploading file to temporary storage, please wait...</h1>",
                            baseZ: 999999,
                            fadeIn: 0,
                        });

                        function createBlob(callback) {
                            if (HTMLCanvasElement.prototype.toBlob !== undefined) {
                                /*toBlob for all browsers except IE/Edge... Microsoft likes to create their own standards.*/
                                $(".signaturepad")[0].toBlob(function (blob) {
                                    callback(blob);
                                });
                            } else {
                                /*IE/Edge version*/
                                callback($(".signaturepad")[0].msToBlob());
                            }

                        }
                        createBlob(function (fileBlob) {
                            /*Need slight delay to let blob get built.*/
                            var fileName = "signature.png" + Date.now();
                            uploadFileToMongo(fileBlob, fileName, function () {
                                var ms = {
                                    cmd: 'appxMongoToEngine',
                                    args: [],
                                    handler: "appxreceivefilehandler",
                                    fileName: fileName,
                                    data: null
                                };
                                appx_session.ws.send(JSON.stringify(ms));

                                appx_session.signaturePadFail = false;
                                appx_session.signaturePad.off();
                                $(".appxsignaturedialog").dialog("close");
                            });
                        });
                    }

                }));

                /*Clear signature pad*/
                $(fd).append($("<input id='clearsignature' type='button' value='" + appx_session.language.buttons.clearSignature + "'>").click(function $_click() {
                    appx_session.signaturePad.clear();
                }));

                $(fd).append($("<input id='cancelsignature' type='button' value='" + appx_session.language.buttons.cancel + "'>").click(function $_click() {
                    appx_session.signaturePad.off();
                    $(".appxsignaturedialog").dialog("close");
                }));
            } else {
                appx_session.currrecfile = {};
                appx_session.currrecfile.filename = url;
                var ms = {
                    cmd: 'openfile',
                    args: [url],
                    mongoHost: appxConnectorHost,
                    uid: appx_session.user,
                    pid: appx_session.pid.trim(),
                    port: appxConnectorMongoPort,
                    httpPath: appxConnectorPathHttp,
                    protocol: appxProtocol,
                    handler: 'localopenfile',
                    data: null
                };
                localos_session.ws.send(JSON.stringify(ms));
            }
        }
        else {
            if ($(".appxfiledialog").length == 0) {
                var fd = $("<div>").addClass("appxfiledialog").css({
                    "z-index": 200000
                });
                $(fd).append($("<input id='fileChooser' class='non-widget' type='file'>"));

                $(fd).append($("<input id='submitfile' type='submit'>").click(function $_click() {
                    /*In this instance appx is waiting for file, so we must call the
                    **appxreceivefilehandler ourselves so that the next item appx 
                    **receives is the file.*/
                    /*Block the screen with message while uploading files*/
                    $("#main").block({
                        message: "<h1>Uploading file to temporary storage, please wait...</h1>",
                        baseZ: 999999,
                        fadeIn: 0,
                    });
                    appxReadBlob($(this).attr("id"), function appxReadBlob_callback() {
                        var ms = {
                            cmd: 'appxMongoToEngine',
                            args: [],
                            handler: "appxreceivefilehandler",
                            fileName: $("#fileChooser")[0].files[0].name.replace(/ /g, "_"),
                            data: null
                        };
                        appx_session.ws.send(JSON.stringify(ms));
                        $(".appxfiledialog").dialog("close");
                    });

                }));
                $("body").append(fd);
                $.each($(".appxfiledialog"), function $_each(i, el) {
                    $(el).dialog({
                        open: function $_dialog_open(event, ui) {
                            $(this).parent().css({
                                "z-index": 200000
                            });
                            $(this).css({
                                "z-index": 200000
                            });
                        },
                        close: function $_dialog_close() {
                            if ($("#fileChooser")[0].files.length === 0) {
                                var ms = {
                                    cmd: 'appxmessage',
                                    args: [3, 0],
                                    handler: "appxreceivefilehandler",
                                    data: null
                                };
                                appx_session.ws.send(JSON.stringify(ms));
                            }
                            $(this).dialog("destroy").remove();
                        }
                    });
                    $(el).dialog("open");
                });
            }
            else {
                $("#fileChooser").val("");
                $(".appxfiledialog").dialog("open");
            }
        }
    } catch (e) {
        console.log(e);
        console.log(e.stack);
        var ms = {
            cmd: 'appxmessage',
            args: [3, 0],
            handler: "appxreceivefilehandler",
            data: null
        };
        appx_session.ws.send(JSON.stringify(ms));

    }
}

function appxReadBlob(elId, callback) {
    var mId = "fileopener";
    var mDir = false;
    var files = null;

    /*If we came in with elId then we are using browser and not the local connector
    **to upload the files to server*/
    if (elId) {
        mId = elId;
    }
    /*If mId === DnD then drag & drop functionality was used*/
    if (mId === "DnD") {
        files = appx_session.dropEvent.dataTransfer.files;
        appx_session.filesUploadArray = appx_session.dropEvent.dataTransfer.files;
    } else {
        files = $("#fileChooser")[0].files;
    }
    if (!files.length) {
        alert(appx_session.language.alerts.fileError);
        return;
    }
    if (files.length > 1) {
        mDir = true;
    }

    for (var i = 0; i < files.length; i++) {
        var file = files[i];
        uploadFileToMongo(new Blob([file]), file.name, callback);
    }
}

function CreateFile(file) {
    //create file on localos_session
    var ms = {
        cmd: 'createfile',
        args: [file],
        handler: 'localfilecreate',
        data: null
    };
    localos_session.ws.send(JSON.stringify(ms));
}
var msgCount = 0;
function AppendFile(data) {
    if (data.length > 0) {
        var filecopy = {};
        filecopy.filename = appx_session.currsendfile.filename;
        filecopy.filedata = data;
        filecopy.count = ++msgCount;
        //create file on localos_session
        var ms = {
            cmd: 'appendfile',
            args: [filecopy],
            handler: 'localfileappend',
            data: null
        };
        localos_session.ws.send(JSON.stringify(ms));
    }
}

function localos_create_file_handler(data) {
    console.log("Create File");
    var arg;
    /*If we get an error creating file then we send error code (0) back to engine*/
    if (data.hasOwnProperty("errno")) {
        arg = [3, 0];
    } else {
        arg = [3, 1];
    }

    //send client status for filename
    var ms = {
        cmd: 'appxmessage',
        args: arg,
        handler: 'appxsendfilehandler',
        data: null
    };
    appx_session.ws.send(JSON.stringify(ms));
}

/*
**Function to display custom error message if file trying to be uploaded errored out
**because it was a folder instead of a file.
**
**@param fileName: Name of folder that caused the error
*/
function fileUploadError(fileName) {
    appxClearStatusMsgText();
    alert("\"" + fileName + appx_session.language.alerts.folderSelectedError);
    $("#main").unblock();
}

/*
**Function to create dialog popup for getting/setting clipboard functionality
**
**@param booleanClipboardSet: Whether we are setting clipboard or getting clipboard
**@param textToCopyToClipboard: Data to set into clipboard
*/
function createClipboardDialog(booleanClipboardSet, textToCopyToClipboard) {
    var labelText;
    var buttonText;
    var divId;
    var titleText;
    var textAreaId;
    if (booleanClipboardSet) {
        labelText = appx_session.language.tooltips.clipboardToText;
        buttonText = appx_session.language.buttons.copyText;
        divId = "copyToClipboardDiv";
        titleText = appx_session.language.tooltips.clipboardTo;
        textAreaId = "copyToClipboard";
    } else {
        labelText = appx_session.language.tooltips.clipboardFromText;
        buttonText = appx_session.language.buttons.submit;
        divId = "copyFromClipboardDiv";
        titleText = appx_session.language.tooltips.clipboardFrom;
        textAreaId = "copyFromClipboard";
    }
    var $textAreaDiv = $('<div>').attr("id", divId);
    var $label = $('<label for="' + divId + '">').addClass("clipboard").html(labelText);
    var $textArea = $('<textarea rows="10" cols="50" id="' + textAreaId + '">').addClass(divId).val(textToCopyToClipboard);
    var $copyButton = $('<button>').attr("data-clipboard-target", "#" + textAreaId).addClass("btn clipboard").html(buttonText);

    $label.append("<br /><br /><br />").appendTo($textAreaDiv);
    $textArea.appendTo($textAreaDiv);
    $copyButton.appendTo($textAreaDiv);

    $textAreaDiv.dialog({
        title: titleText,
        position: { "of": "#appx_main_container" },
        minWidth: 700,
        height: 300
    });
    $textAreaDiv.on("dialogclose", function (event) {
        if (booleanClipboardSet) {
            clipboard.destroy();
        } else {
            var pastedText = $textArea.val();
            var ms = {
                cmd: 'appxclipboard',
                args: [pastedText],
                handler: 'appxsendfilehandler',
                data: null
            };
            appx_session.ws.send(JSON.stringify(ms));
        }
    });

    if (booleanClipboardSet) {
        var clipboard = new Clipboard(".btn");
        clipboard.on("success", function clipboard_onSuccess(e) {
            e.clearSelection();
            $textAreaDiv.dialog("destroy").remove();
        });
    } else {
        $copyButton.on("click", function (e) {
            $textAreaDiv.dialog("destroy").remove();
        });
    }
}

function localos_append_file_handler(data) { }