/*********************************************************************
 **
 **   server/appx-client-screen.js - Client Screen processing
 **
 **   This module contains code to process client resources.
 **
 *********************************************************************/

// what_str =  "@(#)Appx $Header$";

"use strict";
var screenflipped = false;
var blocked = false;
var inProgressBox = null;

function getInputElement($tag) {
    if ($($tag).hasClass("appxdatefield") && $($tag).find(".appxdatevalue")) {
        $tag = $($tag).find(".appxdatevalue");
    }

    return($tag);
}

function setInputFocus($tag) {
    if ($($tag).hasClass("appxdatefield") && $($tag).find(".appxdatevalue")) {
        $tag = $($tag).find(".appxdatevalue");
    }
    if ($($tag).hasClass("appxcolorpickerwrapper") && $($tag).find(".appxcolorpicker")) {
        $tag = $($tag).find(".appxcolorpicker");
    }

    $tag.focus();
}

function appxmsgshandler(x) {
    appx_session.msgs = [];
    var i = 0;
    var $msgshtml = "";
    while (x.data.length > 0) {
        var msg = x.data.shift();
        if (msg.txtlen > 0 && msg.txtval.indexOf("Building Scan List") < 0) {
            var $msghtml = $("<span>").html(msg.txtval);
            $msghtml.addClass("status-msg");
            switch (msg.severity) {
                case 0:
                    $msghtml.addClass("status-msg-info");
                    appxloadurlhandler( {'data':'$messagebeep:'});   // Bug#4447 - no sound on errors, warnings
                    break;
                case 1:
                    $msghtml.addClass("status-msg-warning");
                    appxloadurlhandler( {'data':'$warningbeep:'});   // Bug#4447 - no sound on errors, warnings
                    break;
                case 2:
                    $msghtml.addClass("status-msg-error");
                    appxloadurlhandler( {'data':'$errorbeep:'});     // Bug#4447 - no sound on errors, warnings
                    break;
                case 3:
                    $msghtml.addClass("status-msg-cancel");
                    appxloadurlhandler( {'data':'$cancelbeep:'});    // Bug#4447 - no sound on errors, warnings
                    break;
            }
            appx_session.msgs.push($msghtml);
        }
    }
}

function applymessages() {
    var $newhtml = $("<div>");
    var msgcount = 0;
    for (var i = 0; i < appx_session.msgs.length; i++) {
        var $msghtml = appx_session.msgs[i];
        if (i > 0)
            $newhtml.append("<br>");
        $newhtml.append($msghtml);
    }
    $("#appx-status-msg").html($newhtml);
}

/*
**Function to find the box id of that belongs to the coordinates provided
**
**@param pos_row: starting row position of item to find box for
**@param pos_col: starting column position of item to find box for
**@param size_rows: row size of item to find box for
**@param size_cols: column size of item to find box for
**@param includeScroll: whether to include scroll boxes in box search
**
**@return ret: box id if found or 0 if box wasn't found
**
*/
function appxFindBoxIdx(pos_row, pos_col, size_rows, size_cols, includeScroll) {
    var ret = 0;
    var boxes = appx_session.current_show.boxes;
    for (var boxIdx = 0; boxIdx < boxes.length; boxIdx++) {
        var box = boxes[boxIdx];
        if (pos_col >= box.begin_column && pos_col <= box.end_column && pos_row >= box.begin_row && pos_row <= box.end_row) {
            if (pos_row + size_rows - 1 <= box.end_row && pos_col + size_cols - 1 <= box.end_column) {
                if (includeScroll == true || (appxIsScroll(box) == false && appxIsScrollReg(box) == false))
                    ret = boxIdx;
            }
        }
    }
    return ret;
}


function appxfindbox(pos_row, pos_col, size_rows, size_cols, includeScroll) {
    var ret = null;
    var boxes = appx_session.current_show.boxes;
    for (var boxIdx = 0; boxIdx < boxes.length; boxIdx++) {
        var box = boxes[boxIdx];
        if (pos_col >= box.begin_column && pos_col <= box.end_column && pos_row >= box.begin_row && pos_row <= box.end_row) {
            if (pos_row + size_rows - 1 <= box.end_row && pos_col + size_cols - 1 <= box.end_column) {
                if (includeScroll == true || (appxIsScroll(box) == false && appxIsScrollReg(box) == false))
                    ret = box;
            }
        }
    }
    return ret;
}

function applyimage(key) {
    if (key != null) {
        var url = appx_session.image_cache[key].url;
        var ctx = appx_session.image_cache[key].ctx;

        switch (ctx) {
            case 4:
            case 5:
                //feed fake attributes for mouse hovers
                $("#screenBuf ." + key + "_imgRO").attr("srcRO", url);
                break;
            case 7:
                // feed background image css
                $("#screenBuf ." + key).css({ "background-image": "url('" + url + "')" });
                break;
            default:
                //feed img tags instead of background-image
                var lookup = "#screenBuf .";

                if ($("#screenBuf").children().length === 0) {
                    lookup = "#appx_main_container .";
                }

                $(lookup + key + "_pic").css({
                    "background-image": "url('" + url + "')"
                });
                $(lookup + key + "_ico").css({
                    "background-image": "url('" + url + "')"
                });
                $(lookup + key + "_img").attr("src", url);
                if (url.indexOf("./images/missing.png") != -1) {
                    $("." + key + "_img").addClass("appx-image-missing");
                }
                $(lookup + "context-menu-icon-" + key).css({ "background-image": "url('" + url + "')", "background-repeat": "no-repeat", "background-size": "auto 90%", "margin-left": "10px" });

                $("#topMenu ." + key).css({ "background-image": "url('" + url + "')" });
                $("#appx-toolbar ." + key).css({ "background-image": "url('" + url + "')" });
        }
    }
    if (appx_session.pendingResources.length == 0 && appx_session.pendingTables === 0 ) {
        appxSetStatusStateText(APPX_STATE_READY);
        if (!screenflipped) {
            appxshowscreen();
        }
    }
    else {
        appxSetStatusStateText(APPX_STATE_IMAGES);
    }
}

function applystyles() {
    try {
        appx_session.applyStylesCount++;
        if (appx_session.image_cache) {
            for (var i = 0; i < appx_session.image_cache.keys.length; i++) {
                var key = appx_session.image_cache.keys[i];
                applyimage(key);
            }
        }
        if (appx_session.applyStylesCount > 1)
            return;
        appxApplyStylesCheckbox();
        appxApplyStylesColorPicker();
        appxApplyStylesDate();
        if (appx_session.pendingResources.length === 0) {
            appxApplyStylesEditor();
        }
        appxApplyStylesHtmlViewer();
        appxApplyStylesTable();
        appxApplyStylesTitleButtons();
        appxApplyStylesSlider();
        appxApplyStylesSignature();

    }
    catch (ex) {
        console.log("applystyles: " + ex);
        console.log(ex.stack);
    }
}

/**
 **Function to turn file chooser widgets marked as signature widgets
 **into signature blocks
 */
function appxApplyStylesSignature() {
    /*
    **This code is duplicated in appx-client-localos.js function appxreceivefilehandler due
    **to it being possible to request a signature directly from the engine instead of using
    **a widget or button.
    */
    try {
        $(".signature").click(function signature_click() {
            appx_session.signaturePadID = $(this).attr("id");
            /*On click create pop up dialog that contains the signature pad*/
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
                        appx_session.signaturePadID = null;
                        this.remove();
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
                                appx_session.sigBlob = blob;
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
                            $("#" + appx_session.signaturePadID).val("$(sendFile)\\" + fileName);
                            $("#" + appx_session.signaturePadID).addClass("appxitem dirty");
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
        });
    } catch (ex) {
        console.log("Signature Pad Error: " + ex);
        console.log(ex.stack);
    }
}

function appxApplyStylesTitleButtons() {
    /*add click event to all help buttons on the screen and toolbar*/
    $.each($("#screenBuf .appx-title-button-help, #appx-toolbar .appx-title-button-help"), function $_each(k, el0) {
        if( $(el0).parents(".appx-active-box").length === 0 ) {
            $(el0).prop("disabled",true);
        }
        $(el0).click(function $_click(event) {
            $(".appx-active-box").addClass("appx-help-cursor");
            event.preventDefault();
            appx_session.processhelp = true;
            $.each($(".appx-active-box .button"), function $_each(k, e10) {
                $(e10).addClass("appx-help-cursor");
            });
            $.each($(".appx-active-box .appxfield"), function $_each(k, e10) {
                $(e10).addClass("appx-help-cursor");
                $(e10).click(function $_click(event) {
                    var col = $(this).data("col");
                    var row = $(this).data("row");
                    if (!col || !row) {
                        return;
                    }
                    appxPutCursor(col, row);
                    appx_session.processhelp = false;
                    appxwidgetcallback(OPT_HELP_ITM);

                });
            });
        });
    });
    $.each($("#screenBuf .appx-title-button-ok"), function $_each(k, el0) {
        if( $(el0).parents(".appx-active-box").length === 0 ) {
            $(el0).prop("disabled",true);
        }
        $(el0).click(function $_click(event) {
            event.preventDefault();
            appxwidgetcallback(OPT_ENTER);
        });
    });
    $.each($("#screenBuf .appx-title-button-close"), function $_each(k, el0) {
        if( $(el0).parents(".appx-active-box").length === 0 ) {
            $(el0).prop("disabled",true);
        }
        $(el0).click(function $_click(event) {
            event.preventDefault();
            appxwidgetcallback(OPT_END);
        });
    });
}

function appxApplyStylesCheckbox() {
    try {
        var browser = checkBrowser();
        $.each($(".checkbox-label input[type=checkbox]"), function $_each(k, el0) {
            var parent = $(el0).parent();
            if ($(el0).attr('disabled')) {
                if (browser == "Edge" || browser == "IE") {
                    // Do nothing for these browsers, their disabled checkboxes look ok.
                }
                else {
                    $(el0).addClass('disabled')
                        .removeAttr('disabled')
                        .keypress(function $_keypress(event) {
                            event.preventDefault();
                        })
                        .click(function $_click(event) {
                            event.preventDefault();
                        });
                }
                /*Bug #4690 disable click on custom checkbox-label as well*/
                if($(el0).parent().hasClass("checkbox-label")){
                    $(el0).parent()
                        .keypress(function $_keypress(event) {
                            event.preventDefault();
                        })
                        .click(function $_click(event) {
                            event.preventDefault();
                        });
                }
            }
            else {
                // Bug#4415 - checkbox attributes not previously assigned
                var el = $(el0);
                switch (el.attr('value')) {
                    case 'Y':
                    case '1':
                        el.data('checked', 2);
                        el.prop('indeterminate', false);
                        el.prop('checked', true);
                        el.val("Y");
                        break;
                    case 'N':
                    case '0':
                        el.data('checked', 0);
                        el.prop('indeterminate', false);
                        el.prop('checked', false);
                        el.val("N");
                        break;
                    default:
                        el.data('checked', 1);
                        el.prop('indeterminate', true);
                        el.prop('checked', false);
                        el.val(" ");
                }

                $(el0).data('checked', $(el0).checked)      
                    .click(function $_click(e) {
                        var el = $(this);
                        var parent = $(this).parent();
                        if (el.data('checked') == 0 && parent.hasClass('appx-nullok') == false) {
                            el.data('checked', 1);
                        }
                        switch (el.data('checked')) {
                            // unchecked, going indeterminate
                            case 0:
                                el.data('checked', 1);
                                el.prop('indeterminate', true);
                                el.val(" ");
                               // el.addClass("dirty");
                                el.change();
                                break;
                            // indeterminate, going checked
                            case 1:
                                el.data('checked', 2);
                                el.prop('indeterminate', false);
                                el.prop('checked', true);
                                el.val("Y");
                                //el.addClass("dirty");
                                break;
                            // checked, going unchecked
                            default:
                                el.data('checked', 0);
                                el.prop('indeterminate', false);
                                el.prop('checked', false);
                                el.val("N");
                                //el.addClass("dirty");
                        }
                        /*maintain the value in parent - to keep checkboxes the same style*/
                        parent.data('checked', el.data('checked'));
                        parent.prop('indeterminate', el.prop('indeterminate'));
                        parent.prop('checked', el.prop('checked'));
                        parent.val(el.val());
                        parent.addClass("dirty");
                        if(el.prop('indeterminate') == true)
                            el.change();
                    });
                /*specify the keypress even on parent so it could be triggered id parent label is on focuse*/
                parent.keypress(function $_keypress(event) {
                    var el = $(this).children("input[type=checkbox]");
                    var originalValue = el.val();
                    var parent = $(this);
                    if (event.keyCode == 110 || event.keyCode == 78) { // n or N
                        el.data('checked', 0);
                        el.prop('indeterminate', false);
                        el.prop('checked', false);
                        el.val("N");
                    }
                    else if (event.keyCode == 121 || event.keyCode == 89) { // y or Y
                        el.data('checked', 2);
                        el.prop('indeterminate', false);
                        el.prop('checked', true);
                        el.val("Y");
                    }
                    /*maintain the value in parent - to keep checkboxes the same style*/
                    parent.data('checked', el.data('checked'));
                    parent.prop('indeterminate', el.prop('indeterminate'));
                    parent.prop('checked', el.prop('checked'));
                    parent.val(el.val());
                    parent.addClass("dirty");
                    if(el.val() !== originalValue)
                        el.change();
                });
            }
        });
    }
    catch (ex) {
        console.log("appxApplyStylesCheckbox: " + ex);
        console.log(ex.stack);
    }
}

function appxApplyStylesColorPicker() {
    try {
        //may need to loop and get ids here;
        $.each($("#screenBuf .appxcolorpicker"), function $_each(i, el) {
            $(el).parent().width($(el).parent().width() + (appx_session.colWidthPx * 2) - 2);
            //set initial bg color base on the value if exists
            var color = el.value.trim();
            if(color.length >= 6){
                if(color.substring(0,1) != '#'){
                    color = "#"+color;
                } 
                $(this).css({
                    'border-color': color,
                    'background-color': color
                });
            }
            //change the background color when the color is changed, also set the new color to colorpicker
            $(el).change(function $_change() {
                $(this).parent().find("img").colpickSetColor(this.value,this.value);
                var color = this.value.trim();
                if(color.length >= 6){
                    if(color.substring(0,1) != '#'){
                        color = "#"+color;
                    } 
                    $(this).css({
                        'border-color': color,
                        'background-color': color
                    });
                }
            });
            $(el).focus(function(){
                if(appx_session.getProp("autoSelect")){
                    $(this).select();
                }
            });
            //icon click opens colorpicker
            $(el).parent().find("img").colpick({
                layout: 'hex',
                submit: true,
                colorScheme: 'light',
                color: el.value.trim().length == 0 ? 'ffffff':el.value.trim(),
                /*Callback function triggered when the color is changed. This is the function that allows you to get the color picked by the user whenever 
                  it changes, whithout the user pressing the OK button. Should receive:
                    HSB object: (eg. {h:0, s:100, b:100})
                    HEX string: (with no #)
                    RGB object: (eg. {r:255, g:0, b:0})
                    el element: the parent element on which colorpicker() was called. Use it to modify this parent element on change (see first example below).
                    bySetColor flag: if true, the onChange callback was fired by the colpickSetColor function and not by the user changing the color directly 
                                     in the picker. There are some cases in which you'll want a different behaviour in this case (see last example).
                */
                onChange: function $_colpick_onChange(hsb, hex, rgb, elc, bySetColor) {
                    $(elc).parent().find("input").css({
                        'border-color': '#' + hex,
                        'background-color': '#' +hex
                    });
                    // Fill the text box just if the color was set using the picker, and not the colpickSetColor function.
                    if (!bySetColor){
                         $(elc).parent().find("input").val("#"+hex);
                         $(elc).parent().addClass("dirty");
                    }
                },
                onSubmit: function $_colpick_onSubmit(hsb, hex, rgb, elc, bySetColor) {
                    $(elc).parent().find("input").css({
                        'border-color': '#' + hex,
                        'background-color': '#' +hex
                    });
                    if (!bySetColor){ 
                        $(elc).parent().find("input").val("#"+hex);
                        $(elc).parent().addClass("dirty");
                    }
                    $(elc).colpickHide();
                },
                onBeforeShow: function $_colpickOnBoforeShow(elem){
                    //set the current color value
                    var currentValue = $(this).parent().find("input").val();
                    currentValue = currentValue.trim().length == 0? "ffffff":currentValue;
                    $(this).colpickSetColor(currentValue,currentValue);
                },
                onShow: function $_colpick_onShow(elem){
                    //this is to prevent sending keys to appx while colpick is open
                    var $elc = $(this);
                    $(elem).keydown(function $_colpick_onKeyDown(e){
                        //F8 and Escape to close the color chooser 
                        if( e.key === "Escape" || e.key === "F8"){
                            $elc.colpickHide();
                        }
                        //Enter will close the color chooser
                        if(e.key === "Enter" ){
                            $elc.colpickHide();
                        }
                        e.stopPropagation();
                    });
                    //set the focuse to the hex feild on the popup. This is needed to intercept all the keydown events
                    setTimeout( function(){
                        //we have to do it this way, because the element is not added to the screen yet
                        var $hexTextField = $("#"+elem.id +" > .colpick_hex_field > input");
                        $hexTextField.focus();
                        $hexTextField.select();
                        }
                        ,1);
                }
            });
        });
    }
    catch (ex) {
        console.log('appxApplyStylesColorPicker: ' + ex);
        console.log(ex.stack);
    }
}

function appxApplyStylesDate() {
    try {
        $.each($("#screenBuf .appxdatefield"), function $_each(i, el) {
            $(el).width($(el).width() + (appx_session.colWidthPx * 2.5));
            var datevalue = $(el).find(".appxdatevalue").first();
            datevalue.css({
                "font-size": appx_session.basefontsize + "px"
            });
            var datepicker = $(el).find(".appxdatepicker").first();
            var parts = JSON.parse(datepicker.val());
            var opt = {
                beforeShow: function opt_beforeShow(inp, inst) {
                    appx_session.activeDatepicker = $(this);
                },
                buttonImage: "" + appxClientRoot + "/images/calendar.gif",
                buttonImageOnly: true,
                changeMonth: true,
                changeYear: true,
                buttonText: "",
                dateFormat: parts.datemsk,
                onClose: function $opt_onClose(date, obj) {
                    //appx_session.activeDatepicker = null;
                    var ad = APPX.DateFormatter2(
                        date, obj.settings.dateFormat, obj.settings.timeFormat
                    );
                    var ar = $(this).closest(".appxitem").attr('id').split('_');
                    sendappxdate(parseInt(ar[2]), parseInt(ar[1]), ad);
                },
                showButtonPanel: true,
                showOn: "button",
                timeFormat: parts.timemsk,
                yearRange: "1000:3000"
            };
            datepicker.datepicker(opt);
            datepicker.val(parts.value);
            $(el).find("img").css({
                "position": "absolute",
                "right": "2px",
                "top": "2px",
                "z-index": 100000
            }).click(function $_click() {
                appx_session.activeDatepicker = $(this);
            });
        });
    }
    catch (ex) {
        console.log('appxApplyStylesDate: ' + ex);
        console.log(ex.stack);
    }
}

function appxApplyStyleEditor(cacheIDorEl, cacheID) {
    try {
        var el = [];
        if (cacheID) {
            $(":data(editorConfig)").each(function data_each() {
                if ($(this).data().editorConfig === cacheIDorEl) {
                    el = $(this);
                }
            });
            if (el.length === 0) {
                return;
            }
        } else {
            el[0] = cacheIDorEl;
        }
        for (var els = 0; els < el.length; els++) {
            var $ckElement = $(el[els]);
            if ($ckElement.attr("id").indexOf("stale") !== -1) {
                return;
            }

            $ckElement.removeClass("ckeditor");
            var tLeft = $ckElement.css("left");
            var tTop = $ckElement.css("top");
            var tWidth = $ckElement.css("width");
            var tHeight = $ckElement.css("height");
            tLeft = parseInt(tLeft.substring(0, (tLeft.length - 2)));
            tTop = parseInt(tTop.substring(0, (tTop.length - 2)));
            tWidth = parseInt(tWidth.substring(0, (tWidth.length - 2)));
            tHeight = parseInt(tHeight.substring(0, (tHeight.length - 2)));

            /*
            ** If element is not long enough to hold CKEDITOR element correctly or
            ** show decoration is set to no then
            ** we display text area and when entering change mode, put a button next
            ** element that allows user to popup dialog box with CKEDITOR inside
            */
            if (tHeight <= (appx_session.rowHeightPx * 5) || $ckElement.attr("decoration") == "no") {

                /*if a custom file is pushed down from appx we use that, otherwise we use the
                **config.js file that is in the ckeditor directory.  */
                var config = {};
                config.customConfig = AppxResource.cache[$ckElement.data("editorConfig")];
                if (config.customConfig === undefined) {
                    config.customConfig = '../../custom/appx-ckeditor-config.js';
                }
                config.wordcount = {
                    // Whether or not you want to show the Paragraphs Count
                    showParagraphs: false,
                    // Whether or not you want to show the Word Count
                    showWordCount: false,
                    // Whether or not you want to show the Char Count
                    showCharCount: true,
                    // Whether or not you want to count Spaces as Chars
                    countSpacesAsChars: true,
                    // Whether or not to include Html chars in the Char Count
                    countHTML: true,
                    // Whether or not to include Line Breaks in the Char Count
                    countLineBreaks: true,
                    // Maximum allowed Word Count, -1 is default for unlimited
                    maxWordCount: -1,
                    // Maximum allowed Char Count, -1 is default for unlimited
                    maxCharCount: $ckElement.attr("maxlength"),
                    // Maximum allowed Paragraphs Count, -1 is default for unlimited
                    maxParagraphs: -1,
                    // How long to show the 'paste' warning, 0 is default for not auto-closing the notification
                    pasteWarningDuration: 0
                };
                config.width = tWidth;
                config.height = tHeight;
                
                //now initialize the ckeditor with no toolbar for appxscreen
                config.removePlugins = ["toolbar", "clipboard", "pastetext", "pastetools", 
                                            "tableselection", "widget", "uploadwidget", "uploadimage",
                                            "pastefromword", "pastefromgdocs"];
                
                if ($ckElement.attr("disabled") == "disabled") {
                    config.removePlugins.push("elementspath");
                    config.removePlugins.push("wordcount");
                    config.resize_enabled = false;
                }
                var mainEditor = CKEDITOR.replace($ckElement.attr("id"), config);
                $ckElement.attr("name", mainEditor.name);
                var funcVal = els;
                mainEditor.on('instanceReady', function editor_onInstanceReady() {
                    this.ui.contentsElement.clientHeight = tHeight;
                    $("#cke_" + $(el[funcVal]).attr("id")).find("iframe").attr("title", "");
                    $("#cke_" + $(el[funcVal]).attr("id")).css({
                        "position": "absolute",
                        "top": tTop + "px",
                        "left": tLeft + "px",
                        "z-index": $(el[funcVal]).css("z-index")
                    });
                    var footerbar  =  $("#cke_" + $(el[funcVal]).attr("id")+" .cke_bottom");

                    /*hide footerbar instead of removing it so we can still enforce character limit*/
                    if(footerbar){
                        footerbar.css({"display":"none"});
                    }
                    
                    this.resize(tWidth, tHeight, true);
                });
                mainEditor.on('paste', function (event) {
                    validateInputText(event.data.dataValue, $ckElement.data("unicode"));
                });
                // when user closes the notification this event happens
                //Fixing the issue with 'close' tooltip stays visible
                mainEditor.on('notificationHide', function (event){
                    var tooltipDiv = document.querySelector("div.ui-tooltip");
                    if(tooltipDiv != null){
                        tooltipDiv.remove();
                    }
                });

                /*
                ** Event for when user presses a key inside of html editor
                **
                */
                mainEditor.on( 'key', function(event){ 
                    var domEvent = event.data.domEvent.$;
                    //don't send arrow key events to sendkey function
                    if(domEvent.which >= 37 && domEvent.which <= 40){
                        event.data.domEvent.stopPropagation();
                    }
                    //don't send return key to sendkey function if htmleditor is not in rtead only mode
                    else if( (domEvent.which == 10 || domEvent.which == 13) && (event.editor.element.$.getAttribute("disabled") == null)){
                        event.data.domEvent.stopPropagation();
                    }
                    else{
                        /* 
                        ** event is a ckeditor event. It also has the dom event
                        ** we want to pass the dom event (event.data.domEvent.$) to sendkey function to
                        ** intercept appx special shortcuts 
                        */
                        var ret = sendkey(domEvent);
                        //if appx intercepted the key event don't pass it to html editor
                        if(ret == false){
                            event.cancel();
                        }
                    }
                });
                mainEditor.resetDirty();

                $ckElement.addClass("button_cke");
                var $ckeButton = $('<button title="Launch a Full Featured HTML Editor">');
                $ckeButton.attr("id", "CKE_Button");
                $ckeButton.val("a");
                $ckeButton.addClass("cke_fullscreen_button");
                //$ckeButton.text(". ");
                $ckeButton.click(function ckeButton_click() {
                    var $element = $ckElement;
                    var popup_height = tHeight;
                    var popup_width = tWidth;
                    //dont let the width to be less than 600px on the popup
                    if(popup_width < 600){
                        popup_width = 600;
                    }
                    // Minus 3 to not overlap the status bar and footer bar
                    if((popup_height * 5) > ((appx_session.screenrows - 3)  * appx_session.rowHeightPx)){
                        popup_height = (appx_session.screenrows - 3) * appx_session.rowHeightPx;
                    }
                    else{
                        popup_height = popup_height * 5;
                    }
                    /*If in inquiry mode we do not display ckeditor toolbar. Else if a custom
                    **file is pushed down from appx we use that, otherwise we use the
                    **config.js file that is in the ckeditor directory for toolbar items.*/
                    var config = {};
                    config.customConfig = AppxResource.cache[$element.data("editorConfig")];
                    if (config.customConfig === undefined) {
                        config.customConfig = '../../custom/appx-ckeditor-config.js';
                    }
                    /* 
                    ** Add plugins to limit the number of characters user can add to html client 
                    */
                    config.wordcount = {
                        // Whether or not you want to show the Paragraphs Count
                        showParagraphs: false,
                        // Whether or not you want to show the Word Count
                        showWordCount: false,
                        // Whether or not you want to show the Char Count
                        showCharCount: true,
                        // Whether or not you want to count Spaces as Chars
                        countSpacesAsChars: true,
                        // Whether or not to include Html chars in the Char Count
                        countHTML: true,
                        // Whether or not to include Line Breaks in the Char Count
                        countLineBreaks: true,
                        // Maximum allowed Word Count, -1 is default for unlimited
                        maxWordCount: -1,
                        // Maximum allowed Char Count, -1 is default for unlimited
                        maxCharCount: $element.attr("maxlength"),
                        // Maximum allowed Paragraphs Count, -1 is default for unlimited
                        maxParagraphs: -1,
                        // How long to show the 'paste' warning, 0 is default for not auto-closing the notification
                        pasteWarningDuration: 0,
                        // Add filter to add or remove element before counting (see CKEDITOR.htmlParser.filter), Default value : null (no filter)
                        /*filter: new CKEDITOR.htmlParser.filter({
                            elements: {
                                div: function( element ) {
                                    if(element.attributes.class == 'mediaembed') {
                                        return false;
                                    }
                                }
                            }
                        })*/
                    };
                    config.width = popup_width;
                    // because the popup is in modal mode, we need this so the floating (menu lists) 
                    // frames open on top of the modal not under it
                    config.baseFloatZIndex = 1000001;
                    var $elementClone = $element.clone();
                    var $dialogDiv = $('<div>');
                    $dialogDiv.hide().appendTo($element.parent())
                    $elementClone.hide().appendTo($dialogDiv);
                    $elementClone.css("height", (popup_height)+"px");
                    $elementClone.attr("id", "clone_" + $element.attr("id"));
                    var editor = CKEDITOR.replace($elementClone.attr("id"), config);
                    $elementClone.attr("name", editor.name);
                    editor.on('instanceReady', function editor_onInstanceReady() {
                        // Bug #4728: Move data from the Main Editor to the popup editor
                        this.setData(mainEditor.getData());
                        $("#cke_" + $elementClone.attr("id")).find("iframe").attr("title", "");
                        $("#cke_" + $elementClone.attr("id")).css({
                            "position": "absolute",
                            //"height": $elementClone.css("height"),
                            "z-index": $elementClone.css("z-index")
                        });
                        setTimeout(function setTimeoutCallback() {
                            editor.resize( popup_width, popup_height, false);
                        }, 0);
                    });
                    editor.on('paste', function (event) {
                        validateInputText(event.data.dataValue, $element.data("unicode"));
                    });

                    editor.resetDirty();
                    $element.hide();
                    /*Create dialog popup for CKEDITOR*/
                    $dialogDiv.dialog({
                        title: "HTML EDITOR",
                        position: { "of": "#appx_main_container" },
                        minWidth: ( popup_width + 30),
                        height: (popup_height + 130),
                        modal: true,
                        closeOnEscape: false,
                        buttons: {
                            Ok: function () {
                                $element.val(editor.getData());
                                mainEditor.setData(editor.getData());
                                $(this).dialog("close");
                            },
                            Cancel: function () {
                                $(this).dialog("close");
                            }
                        },
                        close: function () {
                            $elementClone.remove();
                            $element.show();
                            editor.destroy();
                        },
                        //This is to prevent keystrokes to go back to appx process
                        open: function(){
                            $(this).dialog("widget").on("keydown", function(event){ 
                                                                                    event.stopPropagation();
                                                                                    });
                        }
                    })
                });
                $ckeButton.css({
                    "position": "absolute",
                    "top": tTop + "px",
                    "left": (tLeft + tWidth + 3) + "px",
                    "z-index": $ckElement.css("z-index")
                });
                if ($ckElement.hasClass("button_cke") && $ckElement.hasClass("appx-modifiable")){
                    $ckeButton.appendTo($ckElement.parent());
                }

            } else {
                /*If in inquiry mode we do not display ckeditor toolbar. Else if a custom
                **file is pushed down from appx we use that, otherwise we use the
                **config.js file that is in the ckeditor directory for toolbar items.  */
                var config = {};
                var editor = {};
                config.customConfig = AppxResource.cache[$ckElement.data("editorConfig")];
                if (config.customConfig === undefined) {
                    config.customConfig = '../../custom/appx-ckeditor-config.js';
                }
                config.wordcount = {
                    // Whether or not you want to show the Paragraphs Count
                    showParagraphs: false,
                    // Whether or not you want to show the Word Count
                    showWordCount: false,
                    // Whether or not you want to show the Char Count
                    showCharCount: true,
                    // Whether or not you want to count Spaces as Chars
                    countSpacesAsChars: true,
                    // Whether or not to include Html chars in the Char Count
                    countHTML: true,
                    // Whether or not to include Line Breaks in the Char Count
                    countLineBreaks: true,
                    // Maximum allowed Word Count, -1 is default for unlimited
                    maxWordCount: -1,
                    // Maximum allowed Char Count, -1 is default for unlimited
                    maxCharCount: $ckElement.attr("maxlength"),
                    // Maximum allowed Paragraphs Count, -1 is default for unlimited
                    maxParagraphs: -1,
                    // How long to show the 'paste' warning, 0 is default for not auto-closing the notification
                    pasteWarningDuration: 0
                };
                config.width = tWidth;
                config.height = tHeight;
                //Hide toolbar and footerbar by removing their plugins
                //Note that you also need to remove all dependent plugings as well
                if ($ckElement.attr("disabled") == "disabled") {
                    config.removePlugins = ["toolbar", "elementspath", "wordcount", "clipboard", "pastetext", "pastetools", 
                                            "tableselection", "widget", "uploadwidget", "uploadimage",
                                            "pastefromword", "pastefromgdocs"];
                    config.resize_enabled = false;
                } 
                
                editor = CKEDITOR.replace($ckElement.attr("id"), config);
                $ckElement.attr("name", editor.name);
                var funcVal = els;
                editor.on('instanceReady', function editor_onInstanceReady() {
                    this.ui.contentsElement.clientHeight = tHeight;
                    $("#cke_" + $(el[funcVal]).attr("id")).find("iframe").attr("title", "");
                    $("#cke_" + $(el[funcVal]).attr("id")).css({
                        "position": "absolute",
                        "top": tTop + "px",
                        "left": tLeft + "px",
                        "z-index": $(el[funcVal]).css("z-index")
                    });
                    this.resize(tWidth, tHeight, false);
                });
                editor.on('paste', function (event) {
                    validateInputText(event.data.dataValue, $ckElement.data("unicode"));
                });
                // when user closes the notification this event happens
                //Fixing the issue with 'close' tooltip stays visible
                 editor.on('notificationHide', function (event){
                    var tooltipDiv = document.querySelector("div.ui-tooltip");
                    if(tooltipDiv != null){
                        tooltipDiv.remove();
                    }
                 });

                 /*
                 ** Event for when user presses a key inside of html editor
                 **
                 */
                 editor.on( 'key', function(event){ 
                    var domEvent = event.data.domEvent.$;
                    //don't send arrow key events to sendkey function
                    if(domEvent.which >= 37 && domEvent.which <= 40){
                        event.data.domEvent.stopPropagation();
                    }
                    //don't send return key to sendkey function if htmleditor is not in rtead only mode
                    else if( (domEvent.which == 10 || domEvent.which == 13) && (event.editor.element.$.getAttribute("disabled") == null)){
                        event.data.domEvent.stopPropagation();
                    }
                    else{
                        /* 
                        ** event is a ckeditor event. It also has the dom event
                        ** we want to pass the dom event (event.data.domEvent.$) to sendkey function to
                        ** intercept appx special shortcuts 
                        */
                        var ret = sendkey(domEvent);
                        //if appx intercepted the key event don't pass it to html editor
                        if(ret == false){
                            event.cancel();
                        }
                    }
                 });

                editor.resetDirty();
            }
        }
    }
    catch (ex) {
        console.log('appxApplyStyleEditor: ' + ex);
        console.log(ex.stack);
    }
}

function appxApplyStylesEditor() {
    try {
        for (name in CKEDITOR.instances) {
            CKEDITOR.instances[name].destroy(true);
        }

        //may need to loop and get ids here;

        for (var key in appx_session.image_cache) {
            if (appx_session.image_cache[key].ctx == 10) {
                appxApplyStyleEditor(key, true);
            }
        }
        $.each($("#screenBuf .ckeditor"), function $_each(i, el) {
            if (!CKEDITOR.instances.hasOwnProperty(el.id)){
                appxApplyStyleEditor(el, false);
            }
        });
    }
    catch (ex) {
        console.log('appxApplyStylesEditor: ' + ex);
        console.log(ex.stack);
    }
}

function appxApplyStylesHtmlViewer() {
    try {
        $.each($("#screenBuf .appx-html-viewer a"), function $_each(k, el0) {
            var opt = $(el0).attr("href");
            if (!isNaN(opt)) {
                $(el0).attr({
                    "href": "#"
                }).click(function $_click(event) {
                    event.preventDefault();
                    appxwidgetcallback(parseInt(opt));
                    return false;
                });
            }
        });
    }
    catch (ex) {
        console.log('appxApplyStylesHtmlViewer: ' + ex);
        console.log(ex.stack);
    }
}

function appxApplyStylesTable() {
    try {
        $.each($("#screenBuf .appxtablewidget"), function $_each(i, el) {
            var appx_table = AppxTable.getAppxTable($(el).data("tableHashKey"));
            // create grid if we have received the userPrefs for this table,
            // if not, wait 250ms and and try again. Try this 4 times and if we still didn't get the preferences then use the default
            if(appx_table._prefsDataReceived == true){
                createGridMongo( {}, $(el).attr("id") );
            }
            else{
                setTimeout(function(){
                    if(appx_table._prefsDataReceived == true){
                        createGridMongo( {}, $(el).attr("id") );
                    }
                    else{
                        setTimeout(function(){
                            if(appx_table._prefsDataReceived == true){
                                createGridMongo( {}, $(el).attr("id") );
                            }
                            else{
                                setTimeout(function(){
                                    if(appx_table._prefsDataReceived == true){
                                        createGridMongo( {}, $(el).attr("id") );
                                    }
                                    else{
                                        setTimeout(function(){
                                            createGridMongo( {}, $(el).attr("id") );
                                        }, 250);
                                    }
                                }, 250);
                            }
                        }, 250);
                    }
                }, 250);
            }
        });
    }
    catch (ex) {
        console.log('appxApplyStylesTable: ' + ex);
        console.log(ex.stack);
    }
}

/*
**Function to turn any slider divs created into slider elements.
**
**@Library noUiSlider: http://refreshless.com/nouislider/
*/

function appxApplyStylesSlider() {
    try {
        $.each($("#screenBuf .slider"), function $_each(i, el) {
            var sStep = 1;
            var dDensity = 1;
            var dDirection = "ltr";
            var ticMajor, ticMinor, min, max;
            var sliderRange = {};
            var percent, stringPercent, count;
            var createPips = false;
            var oOrientation = "horizontal";


            min = parseInt($(el).attr("data-min"));
            max = parseInt($(el).attr("data-max"));
            sliderRange["min"] = [min];
            sliderRange["max"] = [max];

            if ($(el).attr("data-orientation") === "vertical") {
                oOrientation = "vertical";
            } else {
                $(el).closest(".appx--box").css("top", "10px");
            }

            if ($(el).attr("data-tickMajor") != null) {
                ticMajor = parseInt($(el).attr("data-tickMajor"));
                dDensity = ticMajor;
            }
            if ($(el).attr("data-tickMinor") != null) {
                ticMinor = parseInt($(el).attr("data-tickMinor"));
                dDensity = ticMinor;
            }

            if ($(el).attr("data-invert") != null &&
                $(el).attr("data-invert") == "true") {
                dDirection = "rtl";
            }

            /*Create range of values from what the user defined with tick marks.
            **If user chose snap to ticks then there is no extra processing required.*/
            if ($(el).attr("data-tickSnap") != null &&
                $(el).attr("data-tickSnap") == "true") {
                createPips = true;
                percent = 0;
                if (ticMinor) {
                    sStep = ticMinor;
                    count = (max / ticMinor + 1);
                } else if (ticMajor) {
                    sStep = ticMajor;
                    count = (max / ticMajor + 1);
                }
            } else {
                if (($(el).attr("data-tickShow") != null &&
                    $(el).attr("data-tickShow") == "true") &&
                    (ticMinor || ticMajor)) {
                    createPips = true;
                    if (ticMinor) {
                        count = (max / ticMinor + 1);
                        percent = ((ticMinor / max) * 100);
                        for (var i = 1; i <= max / percent; i++) {
                            var value = (ticMinor * i);
                            stringPercent = (percent * i).toString() + "%";
                            sliderRange[stringPercent] = [value];
                        }
                    } else if (ticMajor) {
                        count = (max / ticMajor + 1);
                        percent = ((ticMajor / max) * 100);
                        for (var i = 1; i <= max / percent; i++) {
                            var value = (ticMajor * i);
                            stringPercent = (percent * i).toString() + "%";
                            sliderRange[stringPercent] = [value];
                        }
                    }
                }
            }

            /*
            **Function to test tick marks so we can add labels to only the ones we want
            **
            **@param value: value of tick mark
            **
            **@return value: 0 - no label, 1 - large label, 2 - small label (not used)
            **
            */
            function filterTics(value) {
                var ticMajor;
                if ($(".slider").attr("data-tickMajor") != null) {
                    ticMajor = parseInt($(".slider").attr("data-tickMajor"));
                }
                if (ticMajor) {
                    value = value % ticMajor ? 0 : 1;
                } else {
                    value = 0;
                }

                return value;
            }

            /*Need to create slider differently based on if we want tick marks or not*/
            if (createPips) {
                noUiSlider.create(el, {
                    start: [parseInt($(el).attr("data-value"))],
                    step: sStep,
                    range: sliderRange,
                    direction: dDirection,
                    orientation: oOrientation,
                    pips: {
                        mode: 'count',
                        values: count,
                        density: dDensity,
                        filter: filterTics,
                        stepped: true
                    }
                });
            } else {
                noUiSlider.create(el, {
                    start: [parseInt($(el).attr("data-value"))],
                    step: sStep,
                    range: sliderRange,
                    direction: dDirection,
                    orientation: oOrientation
                });
            }

            /*Disable slider if it is not modifiable*/
            if (($(el).attr("data-modifiable") != null &&
                $(el).attr("data-modifiable") != "true")) {
                $(el).attr("disabled", true);
            }

            if ($(el).attr("data-orientation") === "vertical") {
                var tHeight = ($(el).closest(".noUiSlider").height() - 13);
                $(el).height(tHeight);
            }
            /*Upon changing slider value mark appxitem tag as dirty & update its value
            **to current slider value*/
            el.noUiSlider.on('change', function noUiSlider_onChange(values, handle) {
                var slider = $(el).closest(".noUiSlider");
                if (parseInt($(el).attr("data-value")) !== parseInt(el.noUiSlider.get())) {
                    slider.addClass("dirty");
                }
                slider.val(parseInt(values[0]));
            });

            /*Remove value divs if user has chosen not to show labels*/
            if ($(el).attr("data-tickLabels") != null &&
                $(el).attr("data-tickLabels") == "false") {
                $("div").remove(".noUi-value");
            }

        });
    }
    catch (ex) {
        console.log('appxApplyStylesSlider: ' + ex);
        console.log(ex.stack);
    }
}

//Attributes Message Handler
function appxattributeshandler(x) { }

//Extra Attributes Message Handler
function appxextraattributeshandler(x) { }

function attachMouseListener(obj) {
    obj.mousedown(function $_mousedown(e) {
        appx_session.mouseX = (e.pageX - parseInt($('#appx_main_container').position().left));
        appx_session.mouseY = (e.pageY - parseInt($('#appx_main_container').position().top));
    });
}

//Screen Message Handler
function appxscreenhandler(x) {
    var screendatastr = "";
    if ($_screenBuf == null) {
        var $screen = $("#appx_main_container").empty();
        $_screenBuf = $screen.clone();
        $_screenBuf.attr("id", "screenBuf");
        $_screenBuf.appendTo($screen.parent());
        $_screenBuf.css("visibility","hidden"); //hide();
        attachMouseListener($screen.parent());
   }
    $_screenBuf.html("<div id='appx_main_background' style='float:left;width:70%;'>" + screendatastr + "</div>");
    //the menu may have multiple blocks and has to be cleared as a function of the current show/screen
    initializeMenu();
}

//raw screen data not used at the moment
function appxscreenhandlerdata(x) {
    var screendata = [];
    var screendatastr = "";
    var datalength = 0;
    while (x.length > 0) { //process compressed screen
        var mask = x.shift();
        logactivity("mask:  " + mask);
        if (mask > 255) {
            screendata = new Array(mask);
            var rptchar = x.shift();
            for (var i = 0; i < screendata.length; i++) {
                screendata[i] = rptchar;
            }
            x = x.slice(screendata.length, x.length);
        }
        else {
            x = x.slice(1, x.length);
            datalength = x.shift() + 1;
            screendata = x.slice(0, datalength);
            screendatastr += ab4str(screendata);
            x = x.slice(datalength, x.length);
        }
    }
    return screendatastr;
}

function appxMergeBoxes(oldbox, newbox) {
    var topAdj = oldbox.begin_row - newbox.begin_row;
    var leftAdj = oldbox.begin_column - newbox.begin_column;
    var topAdjPx = topAdj * appx_session.rowHeightPx;
    var leftAdjPx = leftAdj * appx_session.colWidthPx;
    while (oldbox.items.length) {
        var boxitem = oldbox.items.shift();
        var item = boxitem[0];
        var $tag = boxitem[1];
        item.pos_row += topAdj;
        item.pos_col += leftAdj;
        if ($tag) {
            $tag.css({
                "top": (parseInt($tag.css("top")) + topAdjPx) + "px",
                "left": (parseInt($tag.css("left")) + leftAdjPx) + "px"
            });
        }
        newbox.items.push(boxitem);
    }
    while (oldbox.widgets.length) {
        var boxwdgt = oldbox.widgets.shift();
        var wx = boxwdgt[0];
        var $tag = boxwdgt[1];
        wx.wPositionY += topAdj;
        wx.wPositionX += leftAdj;
        if ($tag) {
            $tag.css({
                "top": (parseInt($tag.css("top")) + topAdjPx) + "px",
                "left": (parseInt($tag.css("left")) + leftAdjPx) + "px"
            });
        }
        newbox.widgets.push(boxwdgt);
    }
    while (oldbox.rowtext.length) {
        var rowtext = oldbox.rowtext.shift();
        rowtext.pos_row += topAdj;
        rowtext.pos_col += leftAdj;
        newbox.rowtext.push(rowtext);
    }
}

var _boxcur = null; //appx_session?

function appxHandleEmBox() {
    for (var i = 0; i < appx_session.current_show.boxes.length; i++) {
        var box = appx_session.current_show.boxes[i];
        if (appxIsEmBuild(box)) {
            $("#appx_status_date").html(box.widget.wLabel);
            return true;
        }
    }
    return false;
}

function appxshowboxes() {
    try {
        var box1 = null,
            box2 = null,
            box3 = null;
        var boxcnt = 0;
        var $boxcurhtml = null;
        var cel = appxGetCellSize();
        var cur = appxGetCursorPos();
        var bPrevScrollAct = false;
        var topBoxIdx = 0;
        var topMerged = null;
        appx_session.topbox = null;
        appx_session.tablist = null;
        for (var i = 0; i < appx_session.current_show.boxes.length; i++) {
            inProgressBox = null;
            var box = appx_session.current_show.boxes[i];
            //console.log("box %d(%d)(%d) begin: %d/%d end %d/%d mask 0x%s, label=%s",i,(box.widget == null ? -1 : box.widget.wBoxNumber),box.newbox,box.begin_row,box.begin_column,box.end_row,box.end_column,box.bit_mask.toString(16),box.widget.wLabel);
            if (appxIsInProgress(box))
                inProgressBox = box;
/*
            if (appxIsEmBuild(box)) {
                $("#appx_status_date").html(box.widget.wLabel);
                continue;
            }
*/
            if (box.begin_row == 0 && box.end_row == 0) {
                continue;
            }
            if (box.end_row > (appx_session.screenrows - 3))
                box.end_row = appx_session.screenrows - 3;
            if (box.end_column > appx_session.screencols)
                box.end_column = appx_session.screencols;
            // Full window scrolling inputs, not really scrolling but used to get Prev/Next Record with PageUp/Down keys
            if (box1 != null && appxIsScrollReg(box) && appxIsScrollAct(box) && appxIsScroll(box1) && box.begin_row == 1 && box.begin_column == 1 && box.begin_row == box1.begin_row && box.end_row == box1.end_row && box.begin_column == box1.begin_column && box.end_column == box1.end_column) {
                box.newbox = i - 1;
                box.bit_mask &= ~SCROLL_REG;
                box.bit_mask &= ~SCROLL_ACT;
                box1.bit_mask &= ~SCROLL;
                appxMergeBoxes(box, box1);
                box3 = null;
                box2 = null;
                box1 = null;
            }
            if (appxIsScrollReg(box)) {
                box3 = null;
                box2 = null;
                box1 = null;
            }
            else {
                box3 = box2;
                box2 = box1;
                box1 = box;
            }
            if (box3 != null) {
                if (box3.begin_column == box2.begin_column && box2.begin_column == box1.begin_column) {
                    if (box3.end_column == box2.end_column && box2.end_column == box1.end_column) {
                        if (box1.end_row >= (box2.begin_row - 1) && box3.end_row >= (box1.begin_row - 1)) {
                            if (appxIsScroll(box1)) {
                                /*If outer boxes are exactly the same as inner boxes, but the inner boxes have
                                **more attributes then we get rid of the outer box & keep the inner box*/
                                if (box3.begin_column === box2.begin_column && box3.end_column == box2.end_column &&
                                    box3.begin_column === box2.begin_column && box3.end_column == box2.end_column &&
                                    box3.data_length < box2.data_length) {
                                    box3.newbox = i - 2;
                                    box2.scrollrow = box1.begin_row - (box2.begin_row - 1);
                                } else {
                                    box3.end_row = box2.end_row;
                                    box2.newbox = i - 2;
                                    appxMergeBoxes(box2, box3);
                                    box3.scrollrow = box1.begin_row - (box3.begin_row - 1);
                                }
                            }
                        }
                    }
                }
            }
            if (box2 != null) {
                if ((box2.begin_column <= box1.begin_column) && (box2.data.indexOf("SWBC=") === -1)) {
                    if (box2.end_column >= box1.end_column) {
                        if ((box2.begin_row - 1) <= box1.end_row && box2.end_row >= (box1.begin_row - 1)) {
                            if (appxIsScroll(box1)) {
                                box2.scrollrow = box1.begin_row - (box2.begin_row - 1);
                            }
                            else {
                                if (Math.abs(box1.bit_mask & BORD_AROUND) == 0 && box1.widget.wIconWallpaper == null && box1.widget.wColorBgWallpaper == null && box1.widget.wBorder == null && box1.widget.wLabel == null) {
                                    if (box1.widget.wBorder == null) {
                                        if (box2.end_row < box1.end_row) {
                                            box2.end_row = box1.end_row;
                                        }
                                        box1.newbox = i - 1;
                                        /*If there are 3 boxes then top box should be
                                        **2 less than i, otherwise 1 less*/
                                        if (box3 === null) {
                                            topMerged = box1.newbox;
                                        } else {
                                            topMerged = box1.newbox - 1;
                                        }
                                        appxMergeBoxes(box1, box2);
                                        box1 = box2;
                                        box2 = box3;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            if (!(appxIsScroll(box) || appxIsScrollReg(box))) {
                /*If boxes were merged then the top box is not i*/
                if (topMerged !== null) {
                    topBoxIdx = topMerged;
                } else {
                    topBoxIdx = i;
                }
            }
        }
        if (appx_session.current_show.boxes[topBoxIdx] && appx_session.current_show.boxes[topBoxIdx].hasOwnProperty("newbox"))
            topBoxIdx = appx_session.current_show.boxes[topBoxIdx].newbox;

        appx_session.topboxid = topBoxIdx;
        var scrollBoxNo = 0;
        var boxLayer = 0;
        for (var i = 0; i < appx_session.current_show.boxes.length; i++) {
            var box = appx_session.current_show.boxes[i];
            //If we are receiving empty box do not paint to screen
            if ((box.bit_mask == 0x40040000 && box.items[0] == null &&
                box.widgets[0] == null && box.rowtext[0] == null) &&
                (Math.abs(box.bit_mask & BORD_AROUND) == 0 &&
                    box.widget.wIconWallpaper == null &&
                    box.widget.wColorBgWallpaper == null && box.widget.wBorder == null &&
                    box.widget.wLabel == null)) {
                continue;
            }
            if (appxIsEmBuild(box))
                continue;
            if (box.begin_row == 0 && box.end_row == 0) {
                continue;
            }
            if (appxIsInProgress(box))
                continue;
            if (box.newbox >= 0) {
                continue;
            }
            if (appxIsScroll(box))
                scrollBoxNo = boxcnt;
            if (appxIsScrollReg(box))
                boxLayer = 1000 * (scrollBoxNo + 1);
            else
                boxLayer = 1000 * (boxcnt + 1);
            box.layer = boxLayer;
            if (!(appxIsScroll(box) || appxIsScrollReg(box))) {
                if (box.rowtext && box.rowtext.length > 0) {
                    var title = "";
                    for (var j = 0; j < box.rowtext.length; j++) {
                        var rowtxt = box.rowtext[j];
                        if (rowtxt.pos_row == 1) {
                            title += rowtxt.string.trim() + " ";
                            if (rowtxt.isTitle) {
                                rowtxt.string = "";
                            }
                        }
                    }
                    if (title.length > 0 && box.widget.wLabel == null)
                        box.widget.wLabel = title;
                }
            }
            var boxwidth = ((box.end_column - box.begin_column) * cel.w) + (3 * cel.w) + 2;
            var boxheight = ((box.end_row - (box.begin_row - 1)) * cel.h) + (1 * cel.h);
            if (appxIsScroll(box)) {
            /*Scroll Boxes don't have an extra margin.  The - 4 is to leave the
                    **box 4 pixels larger for scroll boxes.  This allows room for the 2
                    **pixel top and bottom needed to render correctly */
                boxheight -= ((1 * cel.h) - 4);
            } else {
                boxheight += (1 * cel.h);
            }
            /*Firefox doesn't honor ending main content at footer element. This accounts for places (hopefully all of them)
            **where the box would overlay the footer bar.*/
            if (boxheight >= document.documentElement.clientHeight && (box.data.indexOf("SBN=0") > -1 && checkBrowser() === "Firefox")) {
                boxheight += appx_session.rowHeightPx;
            }

            // BUG #3712: Popup input screen is centered incorrectly
            if( i==0 ) {
                var backgroundBoxHeight = boxheight;
            }

            
            var boxtop = (box.begin_row * cel.h) - cel.h;
            var boxleft = (box.begin_column * cel.w) - cel.w;
            if(box.widget && box.widget.wPositionX && box.widget.wPositionY){
                //Readjust the position based on widget data
                boxtop  = (box.widget.wPositionY * cel.h) - cel.h;
                boxleft = (box.widget.wPositionX * cel.w) - cel.w;
            }
            /*If engine was told to center the box, then we remove the horizontal
            **centering the engine did to allow client to handle horizontal centering.
            **We also remove vertical centering, but only apply our own vertical
            **centering if a smaller box should be positioned inside a larger box.*/
            if (!(appxIsScroll(box) || appxIsScrollReg(box))) {
                var tempVert = (($("#appx_main_container").height() - boxheight) / 2);
                if (i === 0 || tempVert > appx_session.centerVerticalOffset) {
                    appx_session.centerVerticalOffset = tempVert;
                }
                if (box.widget.specialHorizontalLocation == 0) {
                    boxleft = 0;
                }
                if (box.widget.specialVerticalLocation == 0) {
                    boxtop = 0;
                    if (i > 0) {
                        var tempBoxHeight = box.end_row - box.begin_row;
                        var tempPrevBoxHeight = appx_session.current_show.boxes[i - 1].end_row - appx_session.current_show.boxes[i - 1].begin_row;
                        if (tempBoxHeight <= tempPrevBoxHeight) {
                         // BUG #3712: Popup input screen is centered incorrectly
                         // JES: centers on 'main' rather than primary frame box. Chose to use 'backgroundBoxHeight' instead of last Box Height
                         //      to ensure popup-within-popup is properly centered. Formerly     boxtop = appx_session.centerVerticalOffset;
                            boxtop = ( backgroundBoxHeight - boxheight) / 2;
                        }
                    }
                }
            }

            /*The first box is the "main appx window" so we need the width to
            **properly calculate the offset for centering inside browser. It's
            **possible for overlay box to be larger than main window so we check
            **for that also and use the smallest offset*/
            var mainWidth = $("#appx_main_container").width();
            var tempOffset = ((mainWidth - boxwidth) / 2);
            if (tempOffset < 0) {
                tempOffset = 0;
            }
            if ((i === 0 || (tempOffset < appx_session.centerHorizontalOffset)) &&
                appx_session.getProp("centerAppx")) {
                var curOffset = appx_session.centerHorizontalOffset;
                appx_session.centerHorizontalOffset = tempOffset;

                /*If we change the offset based on box that is not the first box
                **then we go back and change the left position for all previous boxes*/
                for (var j = 0; j < i; j++) {
                    var tempBox = appx_session.current_show.boxes[j];
                    var $tempBox = $("#box_" + tempBox.widget.wBoxNumber.toString());
                    if ($tempBox.length) {
                        var tempBoxLeft = ($tempBox.position().left - curOffset);
                        if (tempBoxLeft < 0) {
                            tempBoxLeft = 0;
                        }
                        $tempBox.css({
                            "left": ((tempBoxLeft + appx_session.centerHorizontalOffset) + "px")
                        });
                    }
                }
            }
            if (tempOffset > appx_session.centerHorizontalOffset &&
                !(appxIsScroll(box) || appxIsScrollReg(box)) &&
                box.widget.specialHorizontalLocation == 0) {
                tempOffset = tempOffset - appx_session.centerHorizontalOffset;
            } else {
                tempOffset = 0;
            }

            if (appxIsScroll(box)) {
                boxleft += 3;
                boxwidth -= 6;
            }
            if (appxIsScrollReg(box)) {
                boxleft += 3;
                boxwidth -= 6;
            }
            var $boxhtml2 = null;
            if (box.widget.wLabel && box.widget.wLabel != "") {
                var m = 2; //margin
                var t = m;
                var l = m;
                var w = (boxwidth - (m * 4)) + "px";
                var h = (cel.h) + "px";
                if (appxFillWindow == "true" && box.end_column - box.begin_column + 1 == appx_session.screencols) {
                    w = "100%";
                    t = "0px";
                    l = "0px";
                }
                var $boxhtml2 = $("<div>").css({
                    "border": "0px", //remove any border
                    "box-sizing": "border-box",
                    "display": "table",
                    "height": h,
                    "left": l,
                    "overflow": "hidden",
                    "position": "absolute",
                    "top": t,
                    "width": w,
                    "z-index": boxLayer + 1
                });
                $boxhtml2.addClass("appx-title");
                $boxhtml2.attr("id", "box_2_" + box.widget.wBoxNumber.toString());
                $boxhtml2.data("row", box.widget.wPositionY);
                $boxhtml2.data("col", box.widget.wPositionX);
                box.widget.isBox = false;
                appxwidgetshandlerpropsex(box.widget, $boxhtml2, true);
            }
            //</toolbar>

            /*Adjust box positioning to center in browser*/
            boxleft = ((boxleft + tempOffset + appx_session.centerHorizontalOffset) + "px");

            if (appxFillWindow == "true" && box.begin_row == 1 && box.begin_column == 1 && box.end_row == (appx_session.screenrows - 3) && box.end_column == appx_session.screencols) {
                boxwidth = "100%";
            }
            var $boxhtml = $("<div>").css({
                "box-sizing": "border-box",
                "height": boxheight,
                "left": boxleft,
                "overflow": "hidden",
                "position": "absolute",
                "top": boxtop,
                "width": boxwidth,
                "z-index": boxLayer
            });
            if ($boxhtml2) $boxhtml.append($boxhtml2);
            $boxhtml.addClass("appxbox");
            $boxhtml.attr("id", "box_" + box.widget.wBoxNumber.toString());
            $boxhtml.data("row", box.widget.wPositionY);
            $boxhtml.data("col", box.widget.wPositionX);
            $boxhtml.attr("data-role", "content");
            if (box.begin_row == 1 && box.begin_column == 1 && box.end_row == (appx_session.screenrows - 3) && box.end_column == appx_session.screencols) {
                $boxhtml.addClass("appxbox-full");
            }
            box.widget.isBox = true;
            appxwidgetshandlerprops(box.widget, $boxhtml);

            //store box between items for tabindexing
            $_screenBuf.append($boxhtml);
            if ( //lets see if this is the box that contains the cursor
                cur.row >= box.begin_row && cur.row <= box.end_row &&
                cur.col >= box.begin_column && cur.col <= box.end_column) {
                if (_boxcur == null ||
                    (_boxcur.end_row - _boxcur.begin_row) >= (box.end_row - box.begin_row) ||
                    (_boxcur.end_column - _boxcur.begin_column) >= (box.end_column - box.begin_column)
                ) {
                    if (Math.abs(box.bit_mask & SCROLL) == 0) {
                        _boxcur = box;
                        $boxcurhtml = $boxhtml;
                    }
                }
            }

            //<scroll>
            //no scrolling classes if box size is full screen
            if (!((box.end_column - box.begin_column) + 1 >= appx_session.screencols &&
                (box.end_row - box.begin_row) + 1 >= (appx_session.screenrows - 3))) {
                if (appxIsScroll(box)) {
                    $boxhtml.addClass("appx-scroll");
                    $boxhtml.css("top", boxtop + cel.h); //remove the -1 offset row
                }
                else if (appxIsScrollReg(box)) {
                    /*We do not want scroll regions to be part of the main box, we
                    **want them merged into the scroll box*/
                    var scrollParentArray = $boxhtml.siblings(".appx-scroll");
                    var scrollParent;
                    /*Possible to have multiple scroll boxes on one screen. To get
                    **the correct one, we match the z-indexes.*/
                    for (var j = 0; j < scrollParentArray.length; j++) {
                        if ($(scrollParentArray[j]).zIndex() === $boxhtml.zIndex()) {
                            scrollParent = $(scrollParentArray[j]);
                        }
                    }
                    if (scrollParent) {
                        var parentTop = parseInt(scrollParent.css("top").substring(0, scrollParent.css("top").indexOf("px")));
                        var parentLeft = parseInt(scrollParent.css("left").substring(0, scrollParent.css("left").indexOf("px")));
                        var boxL = parseInt(boxleft.substring(0, boxleft.indexOf("px")));
                        var adjTop = Math.abs(parentTop - (boxtop + cel.h));
                        var adjLeft = (boxL - parentLeft );                   /* Bug #4303: formerly:   var adjLeft = (parentLeft - boxL); */
                        var adjWidth = scrollParent.width();
                    }
                    if (appxIsScrollAct(box)) {
                        $boxhtml.addClass("appx-scroll-act");
                        $boxhtml.removeClass("appxbox");
                        bPrevScrollAct = true;
                    } else {
                        if (bPrevScrollAct) {
                            bPrevScrollAct = false;
                            $boxhtml.removeClass("appxbox");
                            $boxhtml.addClass("appx-scroll-act-next");
                        }
                        else {
                            $boxhtml.addClass("appx-scroll-reg");
                            $boxhtml.removeClass("appxbox");
                        }
                    }
                    /*Attach scroll regions to scroll box*/

                    $boxhtml.appendTo(scrollParent);
                    $boxhtml.data("col", box.begin_column);
                    $boxhtml.data("row", box.begin_row);
                    $boxhtml.click(function tag_onclick() {
                        appxScrollClick($(this).parent());
                    });
                    $boxhtml.css({
                        "top": adjTop,
                        "left": adjLeft,
                        "width": adjWidth
                    });
                    $boxhtml.height(boxheight - (2 * cel.h)); //remove the default two extra lines
                }
                else if (!box.widget.wBorder) {
                    $boxhtml.addClass("appx-border-bevel-raised");
                }
            }
            //</scroll>
            /*Is box movable*/
            if (box.widget.wMovable) {
                $boxhtml.data({
                    "wMovableCommand": box.widget.wMovableCommand
                })
                $boxhtml.draggable({
                    cancel: ".appx-modifiable, .ui-pg-input, .ui-pg-selbox",
                    stop: function $_draggable_drop() {
                        var r = Math.floor(($(this).offset().top - $("#appx_main_container").offset().top) / appx_session.rowHeightPx) + 1;
                        var c = Math.floor(($(this).offset().left - $("#appx_main_container").offset().left - appx_session.centerHorizontalOffset) / appx_session.colWidthPx) + 1;
                        appxPutCursor(c, r);

                        if ($(this).data("wMovableCommand")) {
                            appxwidgetcallback($(this).data("wMovableCommand"));
                        }
                    }
                });
            }



            /*$boxhtml.dblclick(function $_dblclick() {   ##DELETEUSERPREFS##
                if (appx_session.getProp("appxDoubleClick") == "true")
                    appxwidgetcallback(OPT_ENTER);
            });*/
            $("a").each(function $_each() {
                $(this).attr("tabindex", -1);
            });
            $("button").each(function $_each() {
                $(this).attr("tabindex", -1);
            });
            if ((appxIsScroll(box) || appxIsScrollReg(box))) {
                var scrollIdx = appxFindBoxIdx(box.begin_row, box.begin_column, (box.end_row - box.begin_row + 1), (box.end_column - box.begin_column + 1), false);
            } else {
                scrollIdx = i;
                var boolTopBox = true;

                /*If every box after this box has a newbox property (box was merged)
                **or a scroll(scrolls can't be top box) then current box is the top box & the topBoxIdx should be equal
                **to i*/
                for (var j = i + 1; j < appx_session.current_show.boxes.length; j++) {
                    if (!appx_session.current_show.boxes[j].hasOwnProperty("newbox") && !appxIsScroll(appx_session.current_show.boxes[j]) &&
                        !appxIsScrollReg(appx_session.current_show.boxes[j])) {
                       boolTopBox = false;
                    }
                }
                if (boolTopBox) {
                    topBoxIdx = i;
                }
            }
            appxshowrowtextforbox(box);
            appxshowitemsforbox(box, topBoxIdx == scrollIdx, $boxhtml);
            appxshowwidgetsforbox(box, topBoxIdx == scrollIdx);
            if (!(appxIsScroll(box) || appxIsScrollReg(box))) {
                if (topBoxIdx != i) {
                    $boxhtml.addClass("appx-not-modifiable");
                }
                else {
                    $boxhtml.addClass("appx-active-box");
                }
            }
            boxcnt++;
        }

        if (inProgressBox && !blocked) {
            try {
                blocked = true;
                var progressLabel = inProgressBox.widget.wlabel;
                if (!progressLabel) {
                    progressLabel = "In Progress";
                }

                $("#main").block({
                    message: progressLabel + "...",
                    overlayCSS: {
                        backgroundColor: null,
                        opacity: null,
                        cursor: "wait"
                    },
                    centerY: false,
                    css: {
                        "z-index": 10000
                    },
                    blockMsgClass: "appx-in-progress-msg"
                });
            }
            catch (e) { }
        }
    }
    catch (ex) {
        console.log("appxshowboxes: " + ex);
        console.log(ex.stack);
    }
}

//Display.drawCursor
function appxshowcursor(bFocus) {
    try {
        var cel = appxGetCellSize();
        var pos = appxGetCursorPos();
        if (!bFocus) {
            var bCurItem = false; //cursor inside field?
            var box = appxfindbox(pos.row, pos.col, 1, 1, true);
            if (!box) return;
            var $cur = $("#appxCursor");
            var firstModItem = null;
            if ($cur.length == 0) {
                $cur = $("<div>");
                $cur.attr("id", "appxCursor");
                $cur.css({
                    "background-color": "rgba(0,0,0,.5)",
                    "height": cel.h,
                    "position": "absolute",
                    "width": cel.w,
                    "z-index": "100000"
                });
                $("#appx_main_container").append($cur);
            }

            var curLeft = ((pos.col * cel.w) + appx_session.centerHorizontalOffset);
            if (appxIsScrollReg(box)) {
                curLeft -= 3;
            }
            var curTop = (pos.row * cel.h);
            $cur.css({
                "left": (curLeft + "px"),
                "top": (curTop + "px")
            });

            $(".appx-scroll-act-new").removeClass("appx-scroll-act-new");
            if (appxIsScrollReg(box) && !appxIsScrollAct(box)) {
                $("#box_" + box.widget.wBoxNumber.toString()).addClass("appx-scroll-act-new");
            }

            for (var i = 0; i < box.items.length; i++) {
                var item = box.items[i];
                if (item[1] != null) {
                    var $tag = item[1][0];

                    if (item[0].hasOwnProperty("pos_row")) { //Item, not box

                        if (firstModItem == null && appxIsModifiable(item[0]))
                            firstModItem = item;

                        var pc = 0;
                        if (appx_session.keyLeft) {
                            pc = 1;
                        }
                        /*Set position row & column to adjust for being inside box instead
                        **of statically positioned on main screen*/
                        var modPos = {
                            row: pos.row - box.begin_row + 1,
                            col: pos.col - box.begin_column + 1
                        };
                       /*Note: Position adjustment seems to be not needed for scrolling screens?
                               Do this only when we navigate through the items in a record not when
                               we are changing the selected row
                        #BUG: 4565 */ 
                        if(appxIsScrollReg(box) && appxIsScrollAct(box)){
                            modPos = {
                                row: pos.row,
                                col: pos.col
                            }
                        }

                        if (
                            appxIsModifiable(item[0]) &&
                            modPos.row >= item[0].pos_row &&
                            modPos.row <= (item[0].pos_row + item[0].size_rows - 1) &&
                            pc + modPos.col >= item[0].pos_col &&
                            modPos.col <= (item[0].pos_col + item[0].size_cols - 1)
                        ) {
                            bCurItem = true;
                            setInputFocus($tag);
                            break;
                        }
                    }
                }
            }
            $cur.css("visibility", ((bCurItem || appxIsLocked() || (appx_session.getProp("drawBlockCursor") != "true" && !appx_session.showCursor)) ? "hidden" : "visible"));
            return bCurItem;

        } else {
            var eFocus = $("#appxitem_" + pos.col + "_" + pos.row);
            if (eFocus.length === 0 || !eFocus.hasClass("appx-modifiable")) {
                eFocus = $(".appx-modifiable").first();
            }
            if (eFocus[0] !== undefined) {
                setInputFocus(eFocus[0]);
            }
        }
    }
    catch (ex) {
        console.log("appxshowcursor: " + ex);
        console.log(ex.stack);
    }
}

function appxnestwidgets() {
    var boxNos = {};
    try {
        for (var i = 0; i < appx_session.current_show.boxes.length; i++) {
            var box = appx_session.current_show.boxes[i];
            box.widget = new Widget(0, "", box.data);
            if (box.widget) {
                boxNos[box.widget.wBoxNumber] = i;
            }
        }
    }
    catch (ex) {
        console.log("appxidboxes: " + ex);
        console.log(ex.stack);
    }

    try {
        // process items
        for (var i = 0; i < appx_session.items.length; i++) {
            var item = appx_session.items[i][0];
            var box = appxitembox(item.pos_row, item.pos_col, item.size_rows, item.size_cols);
            var $tag = appx_session.items[i][1];

            /*Items not in scroll boxes haven't been adjusted for box positioning yet.
            **Not sure where scroll box adjusting gets done for items.*/
            if (!(appxIsScroll(box) || appxIsScrollReg(box))) {
                item.init_pos_row = item.pos_row;
                item.init_pos_col = item.pos_col;
                item.pos_row -= box.begin_row - 1;
                item.pos_col -= box.begin_column - 1;
                var topAdjPx = item.pos_row * appx_session.rowHeightPx;
                var leftAdjPx = item.pos_col * appx_session.colWidthPx;

                if ($tag) {
                    $tag.css({
                        "top": topAdjPx + "px",
                        "left": leftAdjPx + "px"
                    });
                }
            } else {
                if ($tag) {
                    var tempTop = ((box.begin_row - item.pos_row) * appx_session.rowHeightPx);
                    $tag.css({
                        "top": tempTop + "px",
                    });
                }
            }
            if (box) {
                box.items.push(appx_session.items[i]);
            }

        }
        appx_session.items = [];

        // process widgets
        for (var i = 0; i < appx_session.widgets.length; i++) {
            var wgt = appx_session.widgets[i];
            var wx = wgt[0];
            var boxno = wgt[0].boxid;
            var boxid = boxNos[boxno];
            var box = appx_session.current_show.boxes[boxid];
            /*Widgets in scroll boxes haven't been adjusted for box positioning.
            **Non-scroll box widgets get adjusted in engine.*/
            if (!appxIsFullscreen(box) && appxIsScroll(box)) {
                var $tag = wgt[1];
                var scrollbox = box;
                var box = appxitembox((scrollbox.begin_row + wx.wPositionY - 1), (scrollbox.begin_column + wx.wPositionX - 1), wx.wSizeH, wx.wSizeW);
                var topAdj = (box.begin_row - scrollbox.begin_row) + 1;
                var leftAdj = (box.begin_column - scrollbox.begin_column) + 1;
                $tag.css({
                    "top": (parseInt($tag.css("top")) - (topAdj * appx_session.rowHeightPx)) + "px",
                    "left": (parseInt($tag.css("left")) - (leftAdj * appx_session.colWidthPx)) + "px"
                });
                if ($tag.data("row")) {
                    $tag.data("row", $tag.data("row") + (scrollbox.begin_row - 1));
                }
                if ($tag.data("col")) {
                    $tag.data("col", $tag.data("col") + (scrollbox.begin_column - 1));
                }
            }
            if (box) { box.widgets.push(appx_session.widgets[i]); }
            else { console.log("appxnestwidgets() failed to find box for widget"); }
        }
        appx_session.widgets = [];

        // process rowtext
        for (var i = 0; i < appx_session.rowtext.length; i++) {
            var beginRow = 1;
            var rowtxt = appx_session.rowtext[i];
            /*Some rowtext box adjustment gets done in the engine. If it is not
            **done in the engine then we adjust for both scroll box items and
            **non-scroll box items*/
            if (rowtxt.type == ROWTEXT_TYPE_ITEM) {
                box = appxitembox(rowtxt.pos_row, rowtxt.pos_col, rowtxt.size_rows, rowtxt.size_cols)
            } else {
                var boxNo = rowtxt.boxid; // Box number from Appx
                var boxIdx = boxNos[boxNo];
                if (boxIdx >= 0) {
                    var box = appx_session.current_show.boxes[boxIdx];
                    if (!appxIsFullscreen(box) && appxIsScroll(box)) {
                        var scrollbox = box;
                        box = appxitembox((scrollbox.begin_row + rowtxt.pos_row - 1), (scrollbox.begin_column + rowtxt.pos_col - 1), rowtxt.size_rows, rowtxt.size_cols);
                        beginRow = scrollbox.begin_row;
                    }
                }
            }
            if (!(appxIsScroll(box) || appxIsScrollReg(box))) {
                if (rowtxt.type == ROWTEXT_TYPE_ITEM) {
                    rowtxt.pos_row -= box.begin_row - 1;
                    rowtxt.pos_col -= box.begin_column - 1;
                }
            }
            else {
                rowtxt.pos_row -= box.begin_row - beginRow;
                rowtxt.pos_col -= box.begin_column - 1;
            }
            box.rowtext.push(rowtxt);
        }
        appx_session.rowtext = [];

    }
    catch (ex) {
        console.log("appxnestwidgets: " + ex);
        console.log(ex.stack);
    }
}

//Show Message Handler (CharView.updater?)
function appxshowhandler(x) {
    try {
        if (x == null || x.data == null) return;
        appx_session.current_show = (x.data);
        var show = appx_session.current_show;
        var mode = show.curraction[0];

        $("#appx_main_container *").each(function $_each() {
                var newid = $(this).attr("id") + "-stale";
                $(this).attr("id", newid);
            });
        appxnestwidgets();

        if( appxHandleEmBox() ) {
            appx_session.buildingEm = true;
        }
        else {
            $("#appx_status_date").html("");
        }

        if( ! appx_session.buildingEm ) {
            appxshowboxes();
            appxprepscreen();
            setTimeout(function setTimeoutCallback() {
                    appxSetTabIndexes();
                }, 0);
        }

        AppxResource.sendHeld();

        screenflipped = false;

        if ((appx_session.pendingResources.length == 0 && appx_session.pendingTables === 0) || (Math.abs(show.curraction[0] & M_WAIT) == 0)) {
            appxshowscreen();
        }

        if (Math.abs(show.curraction[0] & M_SAVE) != 0) {
            appx_session.dirtySinceSave = false;
        }

        if ((Math.abs(show.curraction[0] & M_WAIT) == 0) &&
            (appx_session.pendingResources.length == 0)) {
            sendappxshow(OPT_NULL, []);
        }
        else {
            $(document).tooltip();
            blocked = false;
            try {
                $("#main").unblock();
            }
            catch (e) { }
            appxstarttimeout();
            if (appx_session.pendingResources.length == 0 && appx_session.pendingTables === 0)
                appxSetStatusStateText(APPX_STATE_READY);
            else {
                appxSetStatusStateText(APPX_STATE_IMAGES);
            }
        }
        if (appx_session.processhelp == true) {
            appx_session.processhelp = false;
            setTimeout(function setTimeoutCallback() {
                    appxwidgetcallback(appx_session.processhelpoption);
                    appx_session.processhelpoption = null;
                }, 0);
        }

        if( appx_session.buildingEm && ( $("#appx_status_date").text().length === 0 || ! $("#appx_status_date") )) {
            appx_session.buildingEm = false;
            appx_session.pendingTables = 0;
        }
    }
    catch (ex) {
        console.log("appxshowhandler: " + ex);
        console.log(ex.stack);
    }
}

function appxshowrowtextforbox(box) {
    var count = 0;
    var equalRow = 0;
    var headingOne = 0;
    var headingTwo = 0;
    var zIndexModifier = 25; //default wLayer for RowText based on Widget class
    for (var k = box.rowtext.length - 1; k > -1; k--) {
        var rowtxt = box.rowtext[k];
        var boxNo = box.widget.wBoxNumber;
        if (rowtxt.pos_row == 1 && rowtxt.string.trim() == "Standard Toolbars")
            continue;
        if (rowtxt.string && rowtxt.string.length > 1 && rowtxt.string[0] == '=' && box.scrollrow && box.scrollrow == rowtxt.pos_row + 1) {
            equalRow = rowtxt.pos_row;
            continue;
        }
        if (equalRow > 0 && equalRow == rowtxt.pos_row + 1) {
            headingOne = rowtxt.pos_row;
            rowtxt.pos_row++;
        }
        if (equalRow > 0 && headingOne > 0 && equalRow == rowtxt.pos_row + 2) {
            headingTwo = rowtxt.pos_row;
            rowtxt.pos_row++;
        }
        if (rowtxt.pos_row > 0) {
            if (rowtxt.pos_row == 1 && box.widget && box.widget.wLabel && box.widget.wLabel.trim() == rowtxt.string.trim()) {
                continue;
            }
            count++;
            var x = 0,
                y = 0,
                w = 0,
                h = 0;
            var colW = appx_session.colWidthPx;
            var rowH = appx_session.rowHeightPx;
            if (box && appxIsScrollReg(box)) {
                x = 1;
                y = 1;
            }
            x = (rowtxt.pos_col - x) * colW;
            y = (rowtxt.pos_row - y) * rowH;
            w = rowtxt.size_cols * colW + 5; //added 5 so IE would fit text in box
            h = rowtxt.size_rows * rowH;

            var $tag = $("<div>");

            if (rowtxt.size_rows > 1)
                if (rowtxt.wordWrap) {
                    $tag.addClass("rowtextwrap");
                } else {
                    $tag.addClass("appx-alpha-field");
                }

            else
                $tag.addClass("rowtext");

            if (rowtxt.type == ROWTEXT_TYPE_ITEM) {
                $tag.addClass("rowtextitem");
            }

            if (rowtxt.uline) {
                $tag.addClass("appx-uline");
            }

            if (rowtxt.string.length > 1 && rowtxt.string[0] == '=')
                $tag.addClass("ColHdgSep");
            $tag.attr("id", "rowtext_" + count.toString());
            $tag.html(rowtxt.string.replace(/[\xb6\x0d\x0a]/g, " "));

            $tag.css({
                "margin": "0",
                "padding": "0"
            });

            $tag.css({
                "position": "absolute",
                "left": x,
                "top": y,
                "height": h,
                "width": w,
                "z-index": box.layer + (zIndexModifier * -1)
            });

            for (var i = 0; i < box.items.length; i++) {
                var item = box.items[i];
                if (item.length === 4 && item[3] === rowtxt) {
                    box.items[i][1] = $tag;
                    break;
                }
            }
            if (box != null) {
                var $box = $("#screenBuf #box_" + boxNo);
                if ($box.length) $box.append($tag);
            }
        }
    }
}

function appxshowitemsforbox(box, isActiveBox, boxHtml) {
    //sort array of boxes and items for tabindex

    for (var i = box.items.length - 1; i >= 0; i--) {
        var item = box.items[i][0];
        var itemNext = null;
        if (i > 0) {
            itemNext = box.items[i - 1][0];
        }
        if (box.items[i][1] == null) {
            continue;
        }
        var boxtop = 0;
        if (!appxIsScrollReg(box)) {
            boxtop = box.begin_row;
        }

                var $tag = box.items[i][1];
                var $box = $_screenBuf;

        if (isActiveBox) appxSetTabElement(item, $tag);

        if (appxIsModifiableCapable(item) && appxIsScrollReg(box))
            $tag.removeClass("appx-not-modifiable");
        var boxno = box.widget.wBoxNumber;
        appxwidgetdimensions(item, $tag, box);
        var $boxTemp = $("#screenBuf #box_" + boxno);
        if ($boxTemp.length) {
            $box = $boxTemp;
        } else {
            console.log("no box...");
        }

        //put a click handler on scrolling records
        if (appxIsScrollReg(box)) {
            //ignore a click on modifiable fields (inside the active record)
            if (!appxIsModifiable(item)) $tag.click(function tag_onclick() {
                appxScrollClick($(this).parent());
            });
        }

        /*If item is a list box or was originally listbox, then we check the position of the field to the right,
        **if it overlaps then we change tag from select to input*/
        if ( ($tag.is("select") || $tag.hasClass("appx-listbox-originally")) && navigator.userAgent.indexOf("Mobile") === -1) {
            var tagWidth = parseInt($tag.css("width"));
            var tagLeft = parseInt($tag.css("left"));
            var selRight = tagLeft + tagWidth;
            var selTop = parseInt($tag.css("top"));
            var nextTag = null;
            if (i - 1 >= 0) {
                nextTag = box.items[i - 1][1];
            }
            var boxWidth = parseInt($box.css("width")) - 4;//-4 for padding of box
            var hitBoxRight = boxWidth < selRight;
            if (nextTag || hitBoxRight) {
                appxwidgetdimensions(itemNext, nextTag, box);
                var nextLeft = boxWidth;

                /*If it's hitting box edge we do not need to check the top, if it's
                **hitting another element then we check tops to see if both are on
                **the same row*/
                var topsOrBox = true;
                if (!hitBoxRight) {
                    nextLeft = parseInt(nextTag.css("left"));
                    topsOrBox = (selTop === parseInt(nextTag.css("top")));
                }
                if (topsOrBox && (selRight > nextLeft)) {
                    var padWidth = $tag.attr("data-padWidth");
                    var initWidth = tagWidth - padWidth;
                    var noPadRight = selRight - padWidth;
                    var minCol = 4 * appx_session.colWidthPx;

                    /*If tags would overlap, test whether they won't overlap if we
                    **remove padding. Copying java client in putting in a 5 column
                    **minimum size. */
                    if (noPadRight < nextLeft) {
                        /*If tags won't overlap without padding then do the math to
                        **set the tag width to 1px (another element) or 5px (edge of
                        **box) less than an overlap*/
                        var spacing = hitBoxRight ? 5 : 1;
                        var w = ((nextLeft - spacing) - tagLeft);
                        if(w > minCol){
                            $tag.width(w + "px");
                        } else {
                            //if still doesn't fit, then draw it with minimum acceptable
                            //size knowing that it overlaps the next field becaus eof design problem.
                            $tag.width(minCol.toString()+"px");
                            /*
                            var attrs = {};

                            //retrieve all the attributes of the original tag
                            $.each($tag[0].attributes, function $_each(idx, attr) {
                                attrs[attr.nodeName] = attr.nodeValue;
                            });

                            //Create new tag
                            $tag = $("<input type='text' />")

                            //Add all attributes to new tag
                            for (var attr in attrs) {
                                $tag.attr(attr, attrs[attr]);
                            }

                            //Change width to correct size for input field
                            var w = (appx_session.colWidthPx * item.size_cols + 5) + "px";
                            $tag.css({
                                "width": w
                            });
                            */
                        }
                    }
                }
            }
                }

                // Fix for bug #4441 Scroll Screen - separate lines and alignment; with adjustments to work in conjunction with
                // fix for bug #4455 Separator line is missing from an item of row text
                // When the design calls for a separator, either before or after the row text item, add the required CSS class
                var $addedSeparator = false;
                if (item.type == ROWTEXT_TYPE_ITEM) {
                        var $divTagBefore = $("<div>");
                        var $divTagAfter = $("<div>");
                        if (item.widget.wSepBefore != null &&
                                item.widget.wSepBefore === true) {
                                $addedSeparator = true;
                                $divTagBefore.addClass("sepBefore");
                                $box.append($divTagBefore);
                                $tag.removeClass("sepBefore");
                        }
                        if (item.widget.wSepAfter != null &&
                                item.widget.wSepAfter === true) {
                                $addedSeparator = true;
                                $divTagAfter.addClass("sepAfter");
                                $box.append($divTagAfter);
                                $tag.removeClass("sepAfter");
                        }

            // Retrieve all the attributes of the target tag
                        var attrs = {};
            $.each($tag[0].attributes, function $_each(idx, attr) {
                attrs[attr.nodeName] = attr.nodeValue;
            });

            //Loop through and find the 'style' attribute
            for (var attr in attrs) {
                                if (attr == "style") {
                                        // Copy the 'style' attribute from the target tag to the new <div>(s)
                                        // then adjust the new tag's position and prominence
                            var zIndexModifier = 10;
                            if (item.widget.wLayer !== null || item.widget.wLayer !== undefined) {
                                zIndexModifier = item.widget.wLayer;
                        }
                                        if (item.widget.wSepBefore === true) {
                                                $divTagBefore.attr(attr, attrs[attr]);
                                                $divTagBefore.css({"height": parseInt(boxHtml.css("height")) + "px" });
                                                $divTagBefore.css({"left": (parseInt($tag.css("left")) - 4) + "px" });
                                                $divTagBefore.css({"width":  1 + "px" });
                                                $divTagBefore.css({"top":  0 + "px" });
                                    $divTagBefore.css({"z-index": (box.layer +  (zIndexModifier * -1))});
                                        }
                                        if (item.widget.wSepAfter === true) {
                                                $divTagAfter.attr(attr, attrs[attr]);
                                                $divTagAfter.css({"height": parseInt(boxHtml.css("height")) + "px" });
                                                $divTagAfter.css({"left": (parseInt($tag.css("left")) + parseInt($tag.css("width")) - 2) + "px" });
                                                $divTagAfter.css({"width":  1 + "px" });
                                                $divTagAfter.css({"top":  0 + "px" });
                                    $divTagAfter.css({"z-index": (box.layer +  (zIndexModifier * -1))});
                                        }
                                        break;
                                }
                        }
                }

        if (box.items[i].length < 4) {
                        // Fix for bug #4441 Scroll Screen - separate lines and alignment; with adjustments to work in conjunction with
                        // fix for bug #4442 Scroll Screen - separator line for checkbox
                        if ((item.widget !== undefined && item.widget != null) &&
                                 (item.widget.wWidgetType !== undefined &&
                                  item.widget.wWidgetType != null) &&
                                 (item.widget.wWidgetType == WIDGET_TYPE_CHECK_BOX ||
                                  item.widget.wWidgetType == WIDGET_TYPE_NONE ||
                                  item.widget.wWidgetType == WIDGET_TYPE_RAW_TEXT ||
                                  item.widget.wWidgetType == WIDGET_TYPE_LABEL) &&
                                 (item.widget.wSepBefore === true ||
                                  item.widget.wSepAfter === true) &&
                                  $addedSeparator == false) {

                                var $divTagBefore = $("<div>");
                                var $divTagAfter = $("<div>");
                                if (item.widget.wSepBefore === true) {
                                $divTagBefore.addClass("sepBefore");
                                        $tag.removeClass("sepBefore");
                                        $box.append($divTagBefore);
                                }
                                if (item.widget.wSepAfter === true) {
                                        $divTagAfter.addClass("sepAfter");
                                        $tag.removeClass("sepAfter");
                                        $box.append($divTagAfter);
                                }

                                $box.append($tag);

                // Retrieve all the attributes of the target tag
                                var attrs = {};
                $.each($tag[0].attributes, function $_each(idx, attr) {
                    attrs[attr.nodeName] = attr.nodeValue;
                });

                //Loop through and find the 'style' attribute
                for (var attr in attrs) {
                                        if (attr == "style") {
                                                // Copy the 'style' attribute from the target tag to the new <div>(s)
                                                // then adjust the new tag's position and prominence
                                    var zIndexModifier = 10;
                            if (item.widget.wLayer !== null || item.widget.wLayer !== undefined) {
                                        zIndexModifier = item.widget.wLayer;
                                }
                                                if (item.widget.wSepBefore === true) {
                                                        $divTagBefore.attr(attr, attrs[attr]);
                                                        $divTagBefore.css({"height": parseInt(boxHtml.css("height")) + "px" });
                                                        $divTagBefore.css({"left": (parseInt($tag.css("left")) - 4) + "px" });
                                                        $divTagBefore.css({"width":  1 + "px" });
                                                        $divTagBefore.css({"top":  0 + "px" });
                                            $divTagBefore.css("z-index", (box.layer +  (zIndexModifier * -1)));
                                                }
                                                if (item.widget.wSepAfter === true)  {
                                                        $divTagAfter.attr(attr, attrs[attr]);
                                                        $divTagAfter.css({"height": parseInt(boxHtml.css("height")) + "px" });
                                                        $divTagAfter.css({"left": (parseInt($tag.css("left")) + parseInt($tag.css("width")) - 2) + "px" });
                                                        $divTagAfter.css({"width":  1 + "px" });
                                                        $divTagAfter.css({"top":  0 + "px" });
                                        $divTagAfter.css({"z-index": (box.layer +  (zIndexModifier * -1))});
                                                }
                                                break;
                                        }
                                }
                        }
                        else {
                    $box.append($tag);
                        }

            var zIndexModifier = 10;
            if (item.widget.wLayer !== null || item.widget.wLayer !== undefined) {
                zIndexModifier = item.widget.wLayer;
            }
            $tag.css("z-index", (box.layer +  (zIndexModifier * -1)));
        }
        if (appxIsScannable(item)) {
            var cel = appxGetCellSize();
            var pad = 1;
            var itemLeft = item.pos_col * cel.w;
            var tagLeft = parseInt($tag.css("left"));
            var item2TagPx = itemLeft - tagLeft;
            var scanLeft = tagLeft + parseInt($tag.css("width")) + pad;
            var scanRight = scanLeft + 9;
            var scanTop = parseInt($tag.css("top")) + 4;
            var addScan = true;


            if (itemNext) {
                var nextLeft = ((itemNext.pos_col * cel.w) - item2TagPx);
                var nextTop = (item.pos_row * cel.h);
                if (item.pos_row == itemNext.pos_row) {
                    if (scanLeft >= nextLeft || scanRight >= nextLeft) {
                        addScan = false;
                    }
                }
            }
            if (addScan) {
                var col = item.widget.wPositionX;
                var row = item.widget.wPositionY;
                if (col === null) {
                    col = $tag.data().col;
                    row = $tag.data().row;
                }
                $("<img>")
                    .attr("src", "" + appxClientRoot + "/images/scanicon.png")
                    .data({
                        "col": col,
                        "row": row
                    })
                    .css({
                        "left": scanLeft,
                        "position": "absolute",
                        "top": scanTop,
                        "z-index": $tag.css("z-index")
                    })
                    .mousedown(function $_mousedown() {
                        appx_session.scan = true;
                        appxPutCursor($(this).data().col, $(this).data().row);
                                                appxSnapshotScanCursor();
                        appxwidgetcallback(OPT_SCAN);
                    })
                    .appendTo($box);
            }
        }
    }
}

//double buffering
var $_screenBuf = null; //appx_session?
function appxshowscreen() {
    if (screenflipped)
        return;
    screenflipped = true;

    if( ! appx_session.buildingEm ) {
        var $screen = $("#appx_main_container");
        $screen.attr("id", "screenBuf");

        $_screenBuf.attr("id", "appx_main_container");
        if ($_screenBuf.enhanceWithin)
            $_screenBuf.enhanceWithin();
        $_screenBuf.css("visibility","visible"); //show();

        $screen.css("visibility","hidden"); //hide();
        $screen.empty();

        $_screenBuf = $screen;

        appxshowcursor(true);
        callValidateText();
    }

    setTimeout(function setTimeoutCallback() {
        appxSetLocked(false);
    }, 0);
}

function appxprepscreen() { //flip
    createDropDownMenu();
    createPopupMenu();
    createToolbarMenu();
    applymessages();
    $(".temp").each(function destroyTemp() {
        this.remove();
    });

    //Using context menu library to add popup menus to screen
    $.contextMenu('destroy');
    $("*").unbind("contextmenu");


    if (!($.isEmptyObject(appx_session.currentmenuitems.popupItems))) {
        for (var key in appx_session.currentmenuitems.popupItems) {
            if (appx_session.currentmenuitems.popupItems[key].icon !== undefined) {
                var icon = appx_session.currentmenuitems.popupItems[key].icon;
                var iconUrl = appx_session.image_cache[icon].wIcon.substring(1, appx_session.image_cache[icon].wIcon.lastIndexOf(",")).replace(",", ".");
                var url = appx_session.appxResourceUrl + iconUrl;
                var style = $("<style>");
                style.attr("type", "text/css");
                style.html(".context-menu-icon-" + icon + " { background-image: url(" + url + "); background-repeat: no-repeat; background-size: contain;}");
                style.addClass("temp");
                style.appendTo($("head")[0]);
            }
        }
        $.contextMenu({
            selector: ".context-selector",
            zIndex: 20000,
            items: appx_session.currentmenuitems.popupItems
        });
        $(":input").contextmenu(false);
    }
    applystyles();
    if (appx_session.token_cache) {
        for (var i = 0; i < appx_session.token_cache.keys.length; i++) {
            var key = appx_session.token_cache.keys[i];
            if (key != "") {
                if (!appxtokengetitem(key)) {
                    continue;
                } else {
                    applyToken(key);
                }
            }
        }
    }

    if (appx_session.getProp("showScrollbar") == true) {
        var vcrcount = 0;
        $.each($("#screenBuf .appx-scroll"), function $_each(i, el) {
            vcrcount++;
            var zi = $(el).css("z-index");
            var $grouphtml = $("<div id='appx-group-vcr-" + vcrcount + "'>").addClass("appx-vcr-group");
            var $vcrhtml = $("<div id='appx-scroll-vcr-" + vcrcount + "'>").addClass("appx-vcr").css({
                "left": (parseInt($(el).css("width")) - 16) + "px",
                "height": $(el).css("height")
            });

/* */
            if (appx_session.getProp("dockingScrollbar") == true) {  /*  ##DELETEUSERPREFS##   */
                $grouphtml.addClass("appx-vcr-hide");
                $vcrhtml.hover(function $_hover_enter() {
                    // mouse enter
                    $("#appx-group-vcr-" + vcrcount).removeClass("appx-vcr-hide");
                }, function $_hover_exit() {
                    // mouse exit
                    $("#appx-group-vcr-" + vcrcount).addClass("appx-vcr-hide");
                });
            }
/* */

            var extra = Math.max(parseInt($(el).css("height")) - (16 * 6), 16) - 0;
            $grouphtml.html("");
            $grouphtml.append($("<button type='button'>").addClass("appx-vcr-btn").addClass("appx-vcr-up3").click(function $_click(event) {
                event.preventDefault();
                appxwidgetcallback(OPT_SCROLL_FIRST);
                return false;
            }));
            $grouphtml.append($("<button type='button'>").addClass("appx-vcr-btn").addClass("appx-vcr-up2").click(function $_click(event) {
                event.preventDefault();
                appxwidgetcallback(OPT_SCROLL_PREV);
                return false;
            }));
            $grouphtml.append($("<button type='button'>").addClass("appx-vcr-btn").addClass("appx-vcr-up1").click(function $_click(event) {
                event.preventDefault();
                appxwidgetcallback(OPT_SCROLL_DOWN);
                return false;
            }));
            $grouphtml.append($("<button type='button'>").addClass("appx-vcr-btn").addClass("appx-vcr-scan").css({
                "height": extra + "px"
            }).click(function $_click(event) {
                event.preventDefault();
                appxwidgetcallback(OPT_KEY_ENTRY);
                return false;
            }));
            $grouphtml.append($("<button type='button'>").addClass("appx-vcr-btn").addClass("appx-vcr-down1").click(function $_click(event) {
                event.preventDefault();
                appxwidgetcallback(OPT_SCROLL_UP);
                return false;
            }));
            $grouphtml.append($("<button type='button'>").addClass("appx-vcr-btn").addClass("appx-vcr-down2").click(function $_click(event) {
                event.preventDefault();
                appxwidgetcallback(OPT_SCROLL_NXT);
                return false;
            }));
            $grouphtml.append($("<button type='button'>").addClass("appx-vcr-btn").addClass("appx-vcr-down3").click(function $_click(event) {
                event.preventDefault();
                appxwidgetcallback(OPT_SCROLL_LAST);
                return false;
            }));

            $vcrhtml.html($grouphtml);
            $(this).append($vcrhtml);
        });
    }
}

function clearBoxRowText($mTag) {
    var boxLeft = parseInt($mTag.css("left").substring(0, $mTag.css("left").length - 2));
    var boxRight = parseInt($mTag.css("width").substring(0, $mTag.css("width").length - 2)) + boxLeft;
    var boxTop = parseInt($mTag.css("top").substring(0, $mTag.css("top").length - 2));
    var boxBottom = parseInt($mTag.css("height").substring(0, $mTag.css("height").length - 2)) + boxTop;

    /*Cycle through rowtext items on screen to see if they have a placement conflict
    **with widget*/
    $(".rowtext").not(".wait").each(function rowtext_each() {
        var rowtextLeft = parseInt($(this).css("left").substring(0, $(this).css("left").length - 2));
        var rowtextRight = parseInt($(this).css("width").substring(0, $(this).css("width").length - 2)) + rowtextLeft;
        var rowtextTop = parseInt($(this).css("top").substring(0, $(this).css("top").length - 2));
        var rowtextBottom = parseInt($(this).css("height").substring(0, $(this).css("height").length - 2)) + rowtextTop;

        if ((rowtextLeft < boxRight && rowtextRight > boxLeft) &&
            (rowtextTop < boxBottom && rowtextBottom > boxTop)) {
            $(this).remove();
        }
    });
}

function appxshowwidgetsforbox(box, isActiveBox) {
    while (box.widgets.length > 0) {
        var wgt = box.widgets.shift(),
            $tag = wgt[1];
        var wx = wgt[0];
        var boxno = box.widget.wBoxNumber;
        if (parseInt(wx.wWidgetType) == WIDGET_TYPE_ROWTEXT && wx.wLabel[5] == '=')
            continue;

        /*If box contains rowtext and widgets, clear rowtext to remove overlaps*/
        if (parseInt(wx.wWidgetType) != WIDGET_TYPE_BOX) {
            clearBoxRowText($tag);
        }

        $("#screenBuf #box_" + boxno).append($tag);
        if (wgt[0].wMovable) {
            $tag.data({
                "wMovableCommand": wgt[0].wMovableCommand
            })
            $tag.draggable({
                cancel: false,
                stop: function $_draggable_stop() {
                    var r = Math.floor(($(this).offset().top - $("#appx_main_container").offset().top) / appx_session.rowHeightPx);
                    var c = Math.floor(($(this).offset().left - $("#appx_main_container").offset().left) / appx_session.colWidthPx);
                    appxPutCursor(c, r);

                    if ($(this).data("wMovableCommand")) {
                        appxwidgetcallback($(this).data("wMovableCommand"));
                    }
                }
            });
        }

        if (isActiveBox && parseInt(wgt[0].wWidgetType) == WIDGET_TYPE_BUTTON) {
            appxSetTabElement(wx, $tag);
        } else {
            //chrome makes fieldsets selectable when they have a tabindex
            if (!$tag.is("fieldset"))
                $tag.attr("tabindex", -1);


            if (parseInt(wgt[0].wWidgetType) == WIDGET_TYPE_BUTTON && !$tag.parent().hasClass("appx-scroll-act")) {
                $tag.prop("disabled", true);
                // Bug #4437. Disabled widgets should gray their buttons icon
                if( $( $tag[0].firstChild ).hasClass('appx-icon-trailing-text') ) {
                    $( $tag[0].firstChild ).addClass('appx-icon-trailing-text-disabled')
                }
                $tag.css({
                    "color": ""
                });
            }
            $tag.removeClass("default"); //can be a button on an underlying frame
        }

    }
}

/*
**Function recieves item and tag and creates tab ordered array of objects
**so that we can set correct tabindex order on the html elements when
**adding them to the screen
**
**@param wori: widget or item to process
**@param $tag: element for widget or item that is being processed
**
*/
function appxSetTabElement(wori, $tag) {
    try {
        if (wori && $tag) {
            var saveTabElement = function saveTabElement(wdgt) {
                if (!wdgt || wdgt.wEnabled != false) {
                    if (!appx_session.tablist) {
                        appx_session.tablist = [];
                    }
                    var tab = appx_session.tablist;
                    var lvl = (wdgt ? parseInt(wdgt.wTabGroup) : 0);
                    var grp = "grp-" + (wdgt ? wdgt.wTabSubGroupId || '0' : '0');
                    //if level is not a number then we assign it 0 as default
                    if (isNaN(lvl)) {
                        lvl = 0;
                    }
                    /*if item is in default group and a button then we set
                    **its group differently to allow for different tab order*/

                    if (grp == "grp-0" && wdgt.wWidgetType == WIDGET_TYPE_BUTTON) {
                        grp = "grp-dfltButtons";
                    }
                    var obj = {
                        'grp': grp,
                        'tag': $tag
                    };

                    tab[lvl] = tab[lvl] || [];
                    if (!tab[lvl][grp]) {
                        tab[lvl][grp] = [];
                    }
                    tab[lvl][grp].push(obj);
                }
            };

            if (wori.hasOwnProperty("wWidgetType")) { //button widget
                if (parseInt(wori.wWidgetType) == WIDGET_TYPE_BUTTON) {
                    saveTabElement(wori);
                }
            } else if (wori.hasOwnProperty("widget") && wori.widget) { //modifiable item
                if (appxIsModifiable(wori)) {
                    if (!$tag.prop("disabled")) {
                        saveTabElement(wori.widget);
                    }
                }
            }
        }
    }
    catch (ex) {
        console.log("appxSetTabElement: " + ex);
        console.log(ex.stack);
    }
}

// called from tag keyhandlers attached in appxSetTabIndexes
function appxSetTabFocus($tagSrc, bBack, mAutoTab) {
    try {
        var ti = (parseInt($tagSrc.attr("tabindex")) % 100);
        var tl = appx_session.tablist;

        var el = tl[ti];
        if (el.hasClass("appxdatefield") && el.find(".appxdatevalue"))
            el = el.find(".appxdatevalue");

        if (bBack)
            el.blur();

        ti = (bBack ? --ti : ++ti);

        if (ti < 0)
            ti = tl.length - 1;
        else if (ti >= tl.length)
            ti = 0;

        el = tl[ti];

        /*If we got here because of autotab and are tabbing to a button,
        **then we need to autotab to the default button instead of the next
        **button on screen.*/
        if (el.is("button") && mAutoTab && ($("button.default").length > 0)) {
            el = $("button.default");
        } else if (el.is("button") && mAutoTab) {
            return;
        }
        setInputFocus(el);

    }
    catch (ex) {
        console.log("appxSetTabFocus: " + ex);
        console.log(ex.stack);
    }
}

// called from appxshowhandler, sort and apply tabable buttons and items
function appxSetTabIndexes() {
    try {

        if (appx_session.tablist) {
            var tablist = [];

            var pushTabElement = function pushTabElement($tag, tabGrp) {
                /*If tag is set to display:none then we do not assign a tab index to
                **it, otherwise the tabbing will stop if the index is set and the
                **element has been set not to display*/
                if ($tag.css("display") !== "none") {
                    tablist.push($tag);
                    $tag.attr("tabindex", (tabGrp + (tablist.length - 1)));
                    $tag.on("keydown", function $_onKeydown(ke) {
                        var self = this;
                        if (ke.which == appx_session.getProp("mapTabKey")) { //tab
                            appxSetTabFocus($(self), ke.shiftKey);
                        }
                        else if (ke.which == 13 && $(self).is("button")) { //enter
                            $(self).trigger("click");
                        }
                        else { //cancel input when communicating (e.g. key pause)
                            if (!appxIsLocked()) return true;
                        }
                        ke.preventDefault();
                        ke.stopPropagation();
                        return false;
                    });
                    if (!$tag.is("button")) {
                        // Implements Auto Tab-Out
                        // modifier and non-printing keys such as Shift, Esc, Del
                        // trigger keydown events and not keypress events
                        // using keyup however, because keypress sometimes doesn't
                        // overwrite chars after a select
                        $tag.on("keyup", function $_onKeyup(ke) {
                            try {

                                if (!ke.altKey && !ke.ctrlKey && !ke.metaKey) {
                                    var k = ke.which;
                                    //http://www.cambiaresearch.com/articles/15/javascript-char-codes-key-codes
                                    //skip nonprintable keycodes
                                    if (k > 46 && (k < 91 || k > 93) && (k < 112 || k > 125)) {
                                        /*Input fields should use selectionstart to check
                                        **for cursor position and not tab when at last
                                        **position in a field. But only certain fields
                                        **use the selectionstart property, so we need to
                                        **check and make sure it has property before
                                        **trying to use it for the autotab option*/
                                        var max = $(this).attr("maxlength");
                                        var autoTab = appx_session.getProp("autoTabOut");
                                        var thisTag = getInputElement(this);

                                        /*If field doesn't have max length to check or if
                                        **autotab is false then there is no reason to
                                        **check*/
                                        if (max && autoTab) {
                                            var tab = false;
                                            var cursorPosition = getCursorPosition($(thisTag));
                                            if (cursorPosition > -1) {
                                                if (max <= cursorPosition) {
                                                    tab = true;
                                                }
                                            } else {
                                                if( $(thisTag).hasClass('appxdatevalue') ) {
                                                    if (max <= $(thisTag).val().replace(/_/g,' ').trim().length) {
                                                    tab = true;
                                                }
                                            }
                                                else {
                                                    if (max <= $(thisTag).val().trim().length) {
                                                    tab = true;
                                                }
                                            }
                                            }
                                            if (tab) {
                                                //select next item
                                                appxSetTabFocus($(this), false, true);
                                            }
                                        }
                                    }
                                }
                            }
                            catch (ex) {
                                alert(appx_session.language.alerts.keypressError + ex);
                                console.log(ex.stack);
                            }
                            return true; //bubble
                        });
                    }
                }
            }; //pushTabElement

            var sortTabElements = function sortTabElements(objA, objB) {

                var posA = objA.tag.position();
                var posB = objB.tag.position();
                posA.top = parseInt(objA.tag.css("top"));
                posA.left = parseInt(objA.tag.css("left"));
                posB.top = parseInt(objB.tag.css("top"));
                posB.left = parseInt(objB.tag.css("left"));

                if (posA.top < posB.top) {
                    return -1; // lower 'row', put before
                }
                else if (posA.top > posB.top) {
                    return 1; // higher 'row', put after
                }
                if (posA.left < posB.left) { //same top, check left
                    return -1;
                }
                else if (posA.left > posB.left) {
                    return 1;
                }
                return 0; //same top and left
            };

            var tab = appx_session.tablist;
            var tabGroup = [];
            var tabGroupNumList = [];
            for (var lvl = 0; lvl < tab.length; lvl++) {
                var grpCnt = 0;
                if (tab[lvl]) {
                    for (var keys in tab[lvl]) {
                        tab[lvl][keys].sort(function tab_sortArrayOverride(objA, objB) {
                            // items go in front of buttons inside a tab level
                            // tab groups don't care about element types
                            if (!objA.tag.is("button") && objB.tag.is("button")) {
                                return 1;
                            }
                            if (objA.tag.is("button") && !objB.tag.is("button")) {
                                return -1;
                            }
                            // both element types are equal, check positions
                            return sortTabElements(objA, objB);
                        });

                        tab[lvl][keys].sort(sortTabElements);
                        tabGroup[grpCnt++] = tab[lvl][keys][0];
                    }
                    /*Split groups into separate groups if another group is supposed
                    **to be in the middle of that group*/
                    for (var keys in tab[lvl]) {
                        for (var KEYS in tab[lvl]) {
                            if (keys !== KEYS && KEYS !== "grp-dfltButtons") {
// Bug #4445, Input Tab sequencing not reacting the same (as Java client)
// Previously: split if 1. the first of this group is after the first of the parent group, AND
//                      2. the last of this group is before the last of the parent group
//                              if ((sortTabElements(tab[lvl][keys][0], tab[lvl][KEYS][0]) > 0) &&
//                                  (sortTabElements(tab[lvl][keys][(tab[lvl][keys].length - 1)], tab[lvl][KEYS][(tab[lvl][KEYS].length - 1)]) < 0)) {
// Now, split if 1. the first of this group is after the first of the parent group, AND
//               2. the parent group is either default group (0) or some split thereof, AND
//               3. the first of this group is before the last of the parent group
//               *. the interrupting tab group cannot be the grp-dfltButtons group
                                if ((sortTabElements(tab[lvl][keys][0], tab[lvl][KEYS][0]) > 0) &&
                                    ( KEYS == 'grp-0' || KEYS.includes( 'split' ) ) &&
                                    ( keys !== 'grp-dfltButtons' ) &&
                                    (sortTabElements(tab[lvl][keys][0], tab[lvl][KEYS][(tab[lvl][KEYS].length - 1)]) < 0)) {

                                    var arrayLength = tab[lvl][KEYS].length;
                                    var arrayCount = 0;
                                    var splitKey = KEYS + "-split"
// We know we're going to split the parent - where in the parent group are we interrupting?
                                    for (var i = 0; i < tab[lvl][KEYS].length; i++) {
                                        if ((sortTabElements(tab[lvl][keys][0], tab[lvl][KEYS][i]) < 0)) {
                                            arrayCount = i;
                                            break;
                                        }
                                    }
// Create new sub-group 'splitKey', populate with all KEYS widgets from point of interception forward, with same widgets removed from original group
                                    tab[lvl][splitKey] = tab[lvl][KEYS].splice(arrayCount, (arrayLength - arrayCount));
                                    for (var i = 0; i < tab[lvl][splitKey].length; i++) {
                                        tab[lvl][splitKey][i].grp = splitKey;
                                    }
// add this new split sub-group to table of tab groups
                                    tabGroup[tabGroup.length] = tab[lvl][splitKey][0];
                                }
                            }
                        }
                    }

                    tabGroup.sort(sortTabElements);
                    /*Modify tab objects with a tab group order, default buttons
                    **are always last*/
                    for (var keys in tab[lvl]) {
                        var dfltButtonsAfter = [];
                        var dfltButtonsBefore = [];
                        if ((keys === "grp-dfltButtons") && (tabGroup.length > 1)) {
                            var comparison = tabGroup[0];
                            if (comparison.grp === "grp-dfltButtons") {
                                comparison = tabGroup[1];
                            }
                            for (var i = 0; i < tab[lvl][keys].length; i++) {
                                if ((sortTabElements(comparison, tab[lvl][keys][i])) < 1) {
                                    dfltButtonsAfter.push(tab[lvl][keys][i]);
                                } else {
                                    dfltButtonsBefore.push(tab[lvl][keys][i]);
                                }
                            }

                            tab[lvl][keys] = dfltButtonsAfter.concat(dfltButtonsBefore);
                            tab[lvl][keys].tabGrp = 2000;
                            tabGroupNumList.push(tab[lvl][keys].tabGrp);

                        } else {

                            for (var i = 0; i < tabGroup.length; i++) {
                                if (tabGroup[i] == tab[lvl][keys][0]) {
                                    tab[lvl][keys].tabGrp = (i * 100);
                                    tabGroupNumList.push(tab[lvl][keys].tabGrp);
                                    break;
                                }
                            }
                        }
                    }

                    /*Push the tab elements based on our tab group ordering*/
                    tabGroupNumList.sort(numberSort);
                    for (var i = 0; i < tabGroupNumList.length; i++) {
                        for (var keys in tab[lvl]) {
                            if (tab[lvl][keys].tabGrp === tabGroupNumList[i]) {
                                for (var j = 0; j < tab[lvl][keys].length; j++) {
                                    pushTabElement(tab[lvl][keys][j].tag, tab[lvl][keys].tabGrp);
                                }
                            }
                        }
                    }
                }
            }

            // apply list filled through pushTabElement and used by appxSetTabFocus
            appx_session.tablist = tablist;
        }

    }
    catch (ex) {
        console.log("appxSetTabIndexes: " + ex);
        console.log(ex.stack);
    }
}

//Sends show data to the server
/* TShow -> MDisplay
  public byte[] terminal = new byte[4];  0
  public byte mode; 0 0 0                4
  public byte[] keymap = new byte[4];    8
  public MRCBlock cursor;               12 (+8) row, col = 16
  public int timeout;                   20
  public byte[] charId = new byte[4];   24
  public int option;                    28
  public int status;                    32
  public int boxCount;                  36
  public byte[] boxPtr = new byte[4];   40
  public MRCBlock cursorAlt;            44 (+8)
  public int optionAlt;                 52
 */
function sendappxshow(option, data) {
    if( !appx_session.buildingEm )
        clearAndReset();

    appx_session.showCursor = false;
    appxSetStatusStateText(APPX_STATE_BUSY);
    try {
        if( !appx_session.buildingEm ) {
            $(".appxtablewidget").each(function $_each() {
                    var uigrid = $(this).attr('id');
                    AppxTable.updateTableFromGrid( uigrid );

                    var selrows = AppxTable.getSelections( uigrid );
                    var selkeys = [];
                    for (var i = 0; i < selrows.length; i++) {
                        //remove the added 'i' from the selkeys
                        /* we added 'i' to the begining of the id to comply with html id (must include at least one character)
                           so the added 'i' needs to be removed from the key before we send it to the engine */
                        selkeys.push(selrows[i].substring(1));
                    }
                    $(this).data("selkeys", selkeys);
                });
        }

        if (appxIsLocked() && option != null && option != OPT_NULL && appx_session.processhelpoption == null ) return; //e.g. obsolete focus handler
        appx_session.applyStylesCount = 0;
        appx_session.currenttabledata = [];
        appxSetLocked(true);
        appxstoptimeout();

        appx_session.override = false;

        var showstructints = [];
        var rtnshow = appx_session.current_show;
        if (rtnshow != null) {

            var mode = rtnshow.rawdata[4];

            //have to set return status in 0xC message to indicate and option was selected
            if (option != null && option >= 0) rtnshow.rawdata[35] = 1;

            var dv = new DataView(new Uint8Array(rtnshow.rawdata).buffer);

            //20140314 chris@praclox.nl cursor
            var cur = appxGetCursorPos();
            dv.setUint32(12, cur.row);
            dv.setUint32(16, cur.col);
            if(option != null){
                dv.setUint32(28, parseInt(option));
            } else{
                dv.setUint32(28, OPT_NULL);
            }

            if (mode == M_SHOW || mode == M_COMPARE) {
                dv.setUint32(32, parseInt("8"));
                dv.setUint32(28, OPT_NULL);
            }

            dv.setInt32(44, 0);
            dv.setInt32(48, 0);
            dv.setUint32(52, 0);
            if (rtnshow.altuseroption && appx_session.scan) {
                var temp1 = 0;
                var temp2 = 0;

                temp1 = dv.getUint32(12);
                temp2 = new DataView(new Uint8Array(rtnshow.altcursorrow).buffer).getUint32(0);
                dv.setUint32(12, temp2);
                dv.setUint32(44, temp1);

                temp1 = dv.getUint32(16);
                temp2 = new DataView(new Uint8Array(rtnshow.altcursorcol).buffer).getUint32(0);
                dv.setUint32(16, temp2);
                dv.setUint32(48, temp1);

                temp1 = dv.getUint32(28);
                temp2 = new DataView(new Uint8Array(rtnshow.altuseroption).buffer).getUint32(0);
                dv.setUint32(28, temp2);
                dv.setUint32(52, temp1);

                rtnshow.altuseroption = null;
                rtnshow.altcursorrow = null;
                rtnshow.altcursorcol = null;
            } else if (rtnshow.altuseroption) {
                var temp1 = 0;
                var temp2 = 0;

                temp1 = dv.getUint32(12);
                temp2 = new DataView(new Uint8Array(rtnshow.altcursorrow).buffer).getUint32(0);
                dv.setUint32(12, temp2);
                dv.setUint32(44, temp1);

                temp1 = dv.getUint32(16);
                temp2 = new DataView(new Uint8Array(rtnshow.altcursorcol).buffer).getUint32(0);
                dv.setUint32(16, temp2);
                dv.setUint32(48, temp1);

                rtnshow.altuseroption = null;
                rtnshow.altcursorrow = null;
                rtnshow.altcursorcol = null;
            }

            var showstructints = [];
            for (var i = 0; i < new Uint8Array(dv.buffer).length; i++) {
                showstructints[i] = dv.getUint8(i);
            }
        }

        var ms = {
            cmd: 'appxmessage',
            args: [0, 0, 0, 2, 12, 0, 0, 0],
            handler: 'appxshowhandler',
            data: null
        };
        appx_session.ws.send(JSON.stringify(ms));

        ms = {
            cmd: 'appxmessage',
            // we need to calculate the screen size here based on attach function(defaults to 31x110 which require 54 bytes to send repeating (ff 00)s which means ((255 x (54/2))/2 = 3410
            args: [0, 54, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 209, 0],
            handler: 'appxshowhandler',
            data: null
        };
        appx_session.ws.send(JSON.stringify(ms));

        ms = {
            cmd: 'appxmessage',
            args: showstructints,
            handler: 'appxshowhandler',
            data: null
        };
        appx_session.ws.send(JSON.stringify(ms));
        if (Math.abs(mode & M_COMPARE) != 0 && appx_session.dirtySinceSave) {
            ms = {
                cmd: 'appxmessage',
                args: [1],
                handler: 'appxshowhandler',
                data: null
            };
            appx_session.ws.send(JSON.stringify(ms));
        }
        else {
            ms = {
                cmd: 'appxmessage',
                args: [0],
                handler: 'appxshowhandler',
                data: null
            };
            appx_session.ws.send(JSON.stringify(ms));
        }
        if (appx_session.override) {

            ms = {
                cmd: 'appxmessage',
                args: [0, 0, 0, 2, 86, 0, 0, 0, 0, 0, 0, 1, 11, 27, 0, 3, 84, 82, 75],
                handler: 'appxshowhandler',
                data: null
            };
            appx_session.ws.send(JSON.stringify(ms));

        }
        else if (data.length > 0) {

            ms = {
                cmd: 'appxmessage',
                args: [0, 0, 0, 2, 86, 0, 0, 0],
                handler: 'appxshowhandler',
                data: null
            };
            appx_session.ws.send(JSON.stringify(ms));

            var msgdata = [];
            for (var dl = 0; dl < data.length; dl++) {
                var dataval = "";
                if ($(data[dl]).find(".appxdatevalue").val()) {
                    dataval = $(data[dl]).find(".appxdatevalue").val();
                } else if ($(data[dl]).closest(".appxitem").find("input").val()) {
                    dataval = $(data[dl]).closest(".appxitem").find("input").val();
                } else if ($(data[dl]).hasClass("masked") && $(data[dl]).val() === "") {
                    dataval = $(data[dl]).data()["_inputmask_opts"].alias.replace(/\*/g, " ");
                } else if ($(data[dl]).val()) {
                    /*If data is file upload element we need to do extra checking and
                    **modify file name so that APPX knows the file was stored in
                    **mongo*/
                    if (($(data[dl]).hasClass("appxfilewrapper") &&
                        $(data[dl]).hasClass("DULC")) ||
                        $(data[dl]).hasClass("DnD")) {
                        var dv = $(data[dl]).val();
                        var filesArrayLength;
                        filesArrayLength = appx_session.filesUploadArray.length;
                        if (filesArrayLength > 1 || $(data[dl]).hasClass("DnD")) {
                            var dvd = dataval = "$(sendFile)\\c:\\directory\\";
                            var fType = "folder";
                            if ($(data[dl]).hasClass("DnD") && filesArrayLength == 1) {
                                fType = "file";
                                dvd = dataval = "$(sendFile)\\";
                            }
                            /*Only method for sending directory or multiple files is
                            **to create drag & drop object for each file.*/
                            for (var i = 0; i < filesArrayLength; i++) {
                                var fileName = appx_session.filesUploadArray[i].name.replace(/ /g, "_");
                                var dndName = "$(sendFile)\\" + "[[" + i + "]]" + fileName;
                                if (filesArrayLength == 1) {
                                    dndName = "$(sendFile)\\" + fileName;
                                }
                                var mRow, mCol;
                                mRow = $(data[dl]).data("row");
                                mCol = $(data[dl]).data("col");
                                appx_session.dndData.push({
                                    row: mRow,
                                    col: mCol,
                                    parentType: $(data[dl]).data("parent_type"),
                                    path: dvd + fileName,
                                    name: dndName,
                                    ext: fileName.substring(fileName.lastIndexOf(".") + 1).toLowerCase(),
                                    mtype: fType,
                                    size: appx_session.filesUploadArray[i].size.toString(),
                                    props: []
                                });
                            }
                        } else {
                            if (dv.indexOf("\\") > -1 || dv.indexOf("\/") > -1) {
                                if (dv.indexOf("\\") > -1) {
                                    dataval = "$(sendFile)" + dv.substring(dv.lastIndexOf("\\"));
                                } else {
                                    dataval = "$(sendFile)" + dv.substring(dv.lastIndexOf("\/"));
                                }
                            } else {
                                dataval = "$(sendFile)\\" + dv;
                            }
                        }
                    } else {
                        dataval = $(data[dl]).val();
                    }
                } else if ($(data[dl]).closest(".appxitem").val()) {
                    dataval = $(data[dl]).closest(".appxitem").val();
                } else if ($(data[dl]).find(".appx-data").html()) {
                    dataval = $(data[dl]).find(".appx-data").html();
                } else if ($(data[dl]).hasClass("togglebutton")){
                    if ($(data[dl]).hasClass("down")) {
                        dataval = "Y";
                    } else {
                        dataval = "N";
                    }
                }


                if ($(data[dl]).css("text-transform") == "uppercase") {
                    dataval = dataval.toUpperCase();
                }
                /*FIXME:What if the field is unicode?*/
                dataval = dataval.replace("\u2018", "'");
                dataval = dataval.replace("\u2019", "'");
                dataval = dataval.replace("\u201C", '"');
                dataval = dataval.replace("\u201D", '"');

                var id = $(data[dl]).closest(".appxitem").attr('id');
                if (id == "" || !id) {
                    id = $(data[dl]).closest(".appxitem").closest("div").attr('id');
                }
                if (id !== undefined) {
                    var datarow = parseInt($("#" + id).data("row"));
                    msgdata.push(datarow);
                    var datacol = parseInt($("#" + id).data("col"));
                    msgdata.push(datacol);
                } else {
                    /*If there is no item, then check to see if it was a widget and
                    **get position of widget*/
                    var datarow = (parseInt($(data[dl]).closest(".appxwidget").closest("div").data("row")));
                    msgdata.push(datarow);
                    var datacol = (parseInt($(data[dl]).closest(".appxwidget").closest("div").data("col")));
                    msgdata.push(datacol);
                }
                var u8strarray = toUTF8Array(dataval);
                /*Since release 6.1 (unicode) we send the data length as 4 bytes so we can send large field lengths*/
                if((appx_session.server_extended_feature_mask & TMNET_FEATURE2_LARGE_WORK_FIELD) == TMNET_FEATURE2_LARGE_WORK_FIELD){
                    Array.prototype.push.apply(msgdata, hton32(u8strarray.length));
                }
                else{
                    var byte2 = u8strarray.length % 256;
                    var byte1 = (u8strarray.length - byte2) / 256;
                    msgdata.push(byte1);
                    msgdata.push(byte2);
                }
                //This cases range error on large data. So, got replaced by a for loop
                //Array.prototype.push.apply(msgdata, u8strarray);
                for(i=0;i<u8strarray.length;i++){
                    msgdata.push(u8strarray[i]);
                }
            }//end for

            clearClientIds();
            /*If we came into this to build a drop object then we send the engine
            **a message length of 0, otherwise we let it process as normal.*/
            if ($(data[0]).hasClass("DnD")) {
                ms = {
                    cmd: 'appxmessage',
                    args: [0, 0, 0, 0],
                    handler: 'appxshowhandler',
                    data: null
                };
                appx_session.ws.send(JSON.stringify(ms));
            } else {
                ms = {
                    cmd: 'appxmessage',
                    args: hton32(data.length),
                    handler: 'appxshowhandler',
                    data: null
                };
                appx_session.ws.send(JSON.stringify(ms));

                ms = {
                    cmd: 'appxmessage',
                    args: msgdata,
                    handler: 'appxshowhandler',
                    data: null
                };
                appx_session.ws.send(JSON.stringify(ms));
            }

        }
        else {

            ms = {
                cmd: 'appxmessage',
                args: [0, 0, 0, 2, 86, 0, 0, 0, 0, 0, 0, 0],
                handler: 'appxshowhandler',
                data: null
            };
            appx_session.ws.send(JSON.stringify(ms));

        }

        //END SENDSHOW and LONGDATA

        /* BEGIN-------------------------------- */
        /* SEND TABLE DATA - ALWAYS SEND MESSAGE */
        /* even when length of table data is 0   */
        /* ------------------------------------- */

        ms = {
            cmd: 'appxmessage',
            args: [0, 0, 0, 4, 90, 0, 0, 0],
            handler: 'appxshowhandler',
            data: null
        };
        appx_session.ws.send(JSON.stringify(ms));

        var keycnt = 0;
        data = $(".appxtablewidget");
        var msgdata = [];
        for (var dl = 0; dl < data.length; dl++) {

            var dataobj = $(data[dl]).data();

            if (dataobj.selkeys) {
                for (var z = 0; z < dataobj.selkeys.length; z++) {
                    var dataval = "";
                    // We should add a handler in keydown event to change to upper if css text tranform UPPER case is set
                    // Or check field class here to see if it should be uppercase
                    dataval = dataobj.selkeys[z];

                    //Table Position ROW - need 4bytes BE
                    var datarow = hton32(parseInt(dataobj.row));
                    Array.prototype.push.apply(msgdata, datarow);
                    //Table Poition COL - need 4bytes BE
                    var datacol = hton32(parseInt(dataobj.col));
                    Array.prototype.push.apply(msgdata, datacol);
                    //SEQ - need 4bytes BE
                    var seq = hton32(keycnt + 1);
                    Array.prototype.push.apply(msgdata, seq);
                    //Parent Type 1byte: alway a 6
                    msgdata.push(6);
                    //Key length in hex 
                    msgdata.push(dataval.length / 2);
                    //convert key values to hex
                    for (var k = 0; k < dataval.length; k += 2) {
                        msgdata.push(parseInt(dataval.substring(k, k + 2), 16));
                    }
                    keycnt++;
                }
            }
        }

        //RUN THRU 4 BYTE BE
        var msglength = hton32(keycnt);

        ms = {
            cmd: 'appxmessage',
            args: msglength,
            handler: 'appxshowhandler',
            data: null
        };

        appx_session.ws.send(JSON.stringify(ms));

        if (data.length > 0) {
            ms = {
                cmd: 'appxmessage',
                args: msgdata,
                handler: 'appxshowhandler',
                data: null
            };
            appx_session.ws.send(JSON.stringify(ms));
        }

        /* END---------------------------------- */
        /* SEND TABLE DATA - ALWAYS SEND MESSAGE */
        /* even when length of table data is 0   */
        /* ------------------------------------- */

        //<dnd>
        /* BEGIN-------------------------------- */
        /* SEND DROP DATA  - ALWAYS SEND MESSAGE */
        /* even when length of table data is 0   */
        /* ------------------------------------- */

        /*
         **  DropInfo Data is organized in this way...
         **
         **  HEADER - 8 byte standard header with a data length of 4 and type 92
         **           where the 4 bytes of data is a uint32 count of dropinfo
         **           records to follow.
         **  count  - uint32 count of dropinfo records to follow.
         **
         **  ===== DropInfo Record, one per count =====
         **
         **    rc_blk - uint32 row, uint32 col of the widget that was dropped onto.
         **    parent - uint32 of the widget parent type of the widget dropped onto.
         **    path   - uint16 string length of path followed by string bytes.
         **    name   - uint16 string length of name followed by string bytes.
         **    ext    - uint16 string length of extention followed by string bytes.
         **    type   - uint16 string length of type followed by string bytes.
         **    size   - uint32 file size
         **    pcount - uint16 count of properties to follow for this dropinfo record.
         **
         **  ===== Property Record, one per pcount =====
         **
         **      keyword - uint16 string length of keyword followed by string bytes.
         **      value   - uint16 string length of value followed by string bytes.
         */
        ms = {
            cmd: 'appxmessage',
            args: [0, 0, 0, 4, 92, 0, 0, 0],
            handler: 'appxshowhandler',
            data: null
        };
        appx_session.ws.send(JSON.stringify(ms));

        var dropcount = appx_session.dndData.length;
        ms = {
            cmd: 'appxmessage',
            args: hton32(dropcount),
            handler: 'appxshowhandler',
            data: null
        };
        appx_session.ws.send(JSON.stringify(ms));
        var htmlEncoding = $('meta[name=appx-character-encoding]').attr("content");
        for (var loop = 0; loop < dropcount; loop++) {
            var mDnD = appx_session.dndData[loop];
            //Should be a uint RC_BLK of the widget position
            //4 byte row
            ms = {
                cmd: 'appxmessage',
                args: hton32(mDnD.row),
                handler: 'appxshowhandler',
                data: null
            };
            appx_session.ws.send(JSON.stringify(ms));
            //4 byte col
            ms = {
                cmd: 'appxmessage',
                args: hton32(mDnD.col),
                handler: 'appxshowhandler',
                data: null
            };
            appx_session.ws.send(JSON.stringify(ms));

            // 4 byte integer parent type
            ms = {
                cmd: 'appxmessage',
                args: hton32(mDnD.parentType),
                handler: 'appxshowhandler',
                data: null
            };
            appx_session.ws.send(JSON.stringify(ms));

            // 2 byte integer dropinfo path len
            ms = {
                cmd: 'appxmessage',
                args: hton16((toUTF8Array(mDnD.path)).length),
                handler: 'appxshowhandler',
                data: null
            };
            appx_session.ws.send(JSON.stringify(ms));

            // string dropinfo path
            ms = {
                cmd: 'appxmessage',
                args: toUTF8Array(mDnD.path),
                handler: 'appxshowhandler',
                data: null
            };
            appx_session.ws.send(JSON.stringify(ms));

            // 2 byte integer dropinfo name len
            ms = {
                cmd: 'appxmessage',
                args: hton16((toUTF8Array(mDnD.name)).length),
                handler: 'appxshowhandler',
                data: null
            };
            appx_session.ws.send(JSON.stringify(ms));

            // string dropinfo name
            ms = {
                cmd: 'appxmessage',
                args: toUTF8Array(mDnD.name),
                handler: 'appxshowhandler',
                data: null
            };
            appx_session.ws.send(JSON.stringify(ms));

            // 2 byte integer dropinfo ext len
            ms = {
                cmd: 'appxmessage',
                args: hton16((toUTF8Array(mDnD.ext)).length),
                handler: 'appxshowhandler',
                data: null
            };
            appx_session.ws.send(JSON.stringify(ms));

            // string dropinfo ext
            ms = {
                cmd: 'appxmessage',
                args: toUTF8Array(mDnD.ext),
                handler: 'appxshowhandler',
                data: null
            };
            appx_session.ws.send(JSON.stringify(ms));

            // 2 byte integer dropinfo type len
            ms = {
                cmd: 'appxmessage',
                args: hton16((toUTF8Array(mDnD.mtype)).length),
                handler: 'appxshowhandler',
                data: null
            };
            appx_session.ws.send(JSON.stringify(ms));

            // string dropinfo type
            ms = {
                cmd: 'appxmessage',
                args: toUTF8Array(mDnD.mtype),
                handler: 'appxshowhandler',
                data: null
            };
            appx_session.ws.send(JSON.stringify(ms));

            // 4 byte int size
            ms = {
                cmd: 'appxmessage',
                args: hton32(mDnD.size),
                handler: 'appxshowhandler',
                data: null
            };
            appx_session.ws.send(JSON.stringify(ms));

            // 2 byte integer propcount
            var propcount = mDnD.props.length;
            ms = {
                cmd: 'appxmessage',
                args: hton16(propcount),
                handler: 'appxshowhandler',
                data: null
            };
            appx_session.ws.send(JSON.stringify(ms));
            for (var proploop = 0; proploop < propcount; proploop++) {
                var prop = mDnD.props[proploop];

                // 2 byte integer dropinfo keyword len
                ms = {
                    cmd: 'appxmessage',
                    args: hton16((toUTF8Array(prop.name)).length),
                    handler: 'appxshowhandler',
                    data: null
                };
                appx_session.ws.send(JSON.stringify(ms));
                // string dropinfo keyword
                ms = {
                    cmd: 'appxmessage',
                    args: toUTF8Array(prop.name),
                    handler: 'appxshowhandler',
                    data: null
                };
                appx_session.ws.send(JSON.stringify(ms));

                // 2 byte integer dropinfo value len
                ms = {
                    cmd: 'appxmessage',
                    args: hton16((toUTF8Array(prop.value)).length),
                    handler: 'appxshowhandler',
                    data: null
                };
                appx_session.ws.send(JSON.stringify(ms));

                // string dropinfo value
                ms = {
                    cmd: 'appxmessage',
                    args: toUTF8Array(prop.value),
                    handler: 'appxshowhandler',
                    data: null
                };
                appx_session.ws.send(JSON.stringify(ms));
            }
        }
        appx_session.dndData = [];
        //</dnd>

    }
    catch (ex) {
        console.log("sendappxshow: " + ex);
        console.log(ex.stack);
    }

}

//TShow
//var M_CHECK   = 0x01;
var M_SHOW = 0x02;
//var M_ALARM   = 0x04;
var M_WAIT = 0x08;
//var M_PAINT   = 0x10;
var M_COMPARE = 0x20;
var M_SAVE = 0x40;
//MBox
var SCROLL = 0x00010000; //Scrolling area
var SCROLL_REG = 0x00020000; //Scrolling Region
var SCROLL_ACT = 0x00040000; //Scrolling ActiveReg
var IN_PROGRESS = 0x00080000; // box is in progress message
var BORD_AROUND = 0x80000000;
//var BORDER      = 0x08000000;
//Document long constants
/*var CHR_SCROLL =     0x0000000000010000;//Scrolling area
var CHR_SCROLL_REG = 0x0000000000020000;//Scrolling Region
var CHR_SCROLL_ACT = 0x0000000000040000;//Scrolling ActiveReg
var CHR_BORD_BOX = 0x0000000008000000;//complete rect border*/

function appxIsLocked() {
    return appx_session.locked;
}

function appxSetLocked(b) {
     appx_session.locked = b;
    if (!b) {
        while (appx_session.runOnUnlock.length) {
            appx_session.runOnUnlock.shift().call();
        }
    }
}

function appxGetCellSize() {
    return {
        "w": appx_session.colWidthPx,
        "h": appx_session.rowHeightPx
    };
}

//clamp column
function appxFixCursorCol(c) {
    if (c < 1) c = 1;
    if (c > appx_session.screencols) c = appx_session.screencols;
    if (c > 255) c = 255;
    return c;
}

//clamp line/row
function appxFixCursorRow(r) {
    if (r < 1) r = 1;
    if (r > appx_session.screenrows - 3) r = appx_session.screenrows - 3;
    if (r > 255) r = 255;
    return r;
}

/** Display.getCursorPos / Document.lookupCursorPosition
 * Get the current cursor position.
 */
function appxGetCursorPos() {
    var c = appxFixCursorCol(ab2int32(appx_session.current_show.cursorcol));
    var r = appxFixCursorRow(ab2int32(appx_session.current_show.cursorrow));
    return {
        "col": c,
        "row": r
    };
}

function appxIsInProgress(box) {
    return (Math.abs(box.bit_mask & IN_PROGRESS) != 0 && (box.widget == null || box.widget.wWidgetType != 203));
}

function appxIsEmBuild(box) {
    return (Math.abs(box.bit_mask & IN_PROGRESS) != 0 && (box.widget != null && box.widget.wWidgetType == 203));
}

function appxIsFullscreen(box) {
    try {
        return (
            (box.end_column - box.begin_column) + 1 >= appx_session.screencols &&
            (box.end_row - box.begin_row) + 1 >= (appx_session.screenrows - 3)
        );
    } catch (ex) {
        console.log("screen.appxIsFullscreen: " + ex);
        console.log(ex.stack);
    }
}

function appxIsScroll(box) {
    return (Math.abs(box.bit_mask & SCROLL) != 0);
}

function appxIsScrollAct(box) {
    return (Math.abs(box.bit_mask & SCROLL_ACT) != 0);
}

function appxIsScrollReg(box) {
    return (Math.abs(box.bit_mask & SCROLL_REG) != 0);
}

/** Display.putCursor / Document.setCursorPos
 * Puts the cursor at the specified position.
 * @param c column
 * @param r row //l line
 */
function appxSnapshotScanCursor() {
    appx_session.scan_cursorrow = appx_session.current_show.cursorrow;
    appx_session.scan_cursorcol = appx_session.current_show.cursorcol;
}
function appxGetScanCursorPos() {
    var c = appxFixCursorCol(ab2int32(appx_session.scan_cursorcol));
    var r = appxFixCursorRow(ab2int32(appx_session.scan_cursorrow));
    return {
        "col": c,
        "row": r
    };
}
function appxClearScanCursor() {
    appx_session.scan_cursorrow = -1;
    appx_session.scan_cursorcol = -1;
}
function appxPutCursor(c, r) {
    try {
        var bCurItem = false; //cursor inside field?
        if (!appxIsLocked() ) {
            var cur = appxGetCursorPos(); //prevent recursive call through focus
            if (cur.col != c || cur.row != r) {
                appx_session.current_show.cursorcol = [0, 0, 0, appxFixCursorCol(c)];
                appx_session.current_show.cursorrow = [0, 0, 0, appxFixCursorRow(r)];
                bCurItem = appxshowcursor(false); //don't call focus
            }
        }
       /* This fix was for bug #4560 but it caused bug #4712. For now remove it
       else{
            //wait a little to see if locks gets created
            setTimeout(function(){
                if (!appxIsLocked() ) {
                    var cur = appxGetCursorPos(); //prevent recursive call through focus
                    if (cur.col != c || cur.row != r) {
                        appx_session.current_show.cursorcol = [0, 0, 0, appxFixCursorCol(c)];
                        appx_session.current_show.cursorrow = [0, 0, 0, appxFixCursorRow(r)];
                        bCurItem = appxshowcursor(false); //don't call focus
                    }
                }
            },100);
        }*/
        return bCurItem;
    }
    catch (ex) {
        console.log("appxPutCursor: " + ex);
        console.log(ex.stack);
    }
}

function appxPutTabOut() {
    try {
        if (!appxIsLocked()) {
            var cur = appxGetCursorPos();
            appx_session.current_show.altcursorcol = [0, 0, 0, appxFixCursorCol(cur.col)];
            appx_session.current_show.altcursorrow = [0, 0, 0, appxFixCursorRow(cur.row)];
            appx_session.current_show.altuseroption = [0, 0, 1, 76];
        }
    }
    catch (ex) {
        console.log("appxPutTabOut: " + ex);
        console.log(ex.stack);
    }
}

function appxScrollClick($tag) {
    var col = $tag.data("col");
    var row = $tag.data("row");
    if (!col || !row) {
        return;
    }
    appxPutCursor(col, row);
    appxwidgetcallback(OPT_ENTER);
}

function appxSetStatusPIDText(str) {
    $("#appx_status_pid").html(str);
}

function appxSetStatusDbText(str) {
    $("#appx_status_db").html(str);
}

function appxSetStatusApText(str) {
    $("#appx_status_ap").html(str);
}

function appxSetStatusVerText(str) {
    $("#appx_status_ver").html(str);
}

function appxSetStatusUserText(str) {
    $("#appx_status_user").html(str);
}

function appxSetStatusKeymapText(str) {
    $("#appx_status_keymap").html(str);
}

function appxSetStatusMsgText(str) {
    appxSetStatusText(str);
}

function appxSetStatusModeText(str) {
    $("#appx_status_mode").html(str);
}

var APPX_STATE_BUSY = 0;
var APPX_STATE_READY = 1;
var APPX_STATE_DIRTY = 2;
var APPX_STATE_IMAGES = 3;
var APPX_STATE_EMS = 4;
var appx_state_last = -1;

function appxSetStatusStateText(state) {
    if (state == appx_state_last)
        return;

    appx_state_last = state;

    var $str = $("<span>");

    switch (state) {
        case APPX_STATE_BUSY:
            $("*").addClass("wait");
            $str.html("busy").addClass("appx-state-busy");
            break;
        case APPX_STATE_READY:
            $("*").removeClass("wait");
            $str.html("ready").addClass("appx-state-ready");
            break;
        case APPX_STATE_DIRTY:
            $str.html("ready+").addClass("appx-state-dirty");
            appx_session.dirtySinceSave = true;
            break;
        case APPX_STATE_IMAGES:
            $str.html("images").addClass("appx-state-images");
            break;
        case APPX_STATE_EMS:
            $str.html("compile").addClass("appx-state-ems");
            break;
    }

    $("#appx_status_stat").html($str);
}

function appxSetStatusEmbldText(str) {
    $("#appx_status_embld").html(str);
}

function appxSetStatusProgressText(str) {
    $("#appx_status_progress").html(str);
}

function appxClearStatusMsgText() {
    $("#appx-status-msg").html("");
    $("#appx-status-msg").css("background-color", "white");
}

/*
** This fuction shows messages in status bar
**      Str: is the message
**      severity: Type of message
**            valid values:  {
**                                0 : Info
**                                1 : Warning
**                                2 : Error
**                                3 : Cancel
**                            }
*/
function appxSetStatusText(str, severity) {
    str = str.trim();
    var $statusbar = $("#appx-status-msg");
    var $msghtml = $("<span>").html(str);
    $msghtml.addClass("status-msg");
    switch (severity) {
        case 0:
            $msghtml.addClass("status-msg-info");
            appxloadurlhandler( {'data':'$messagebeep:'});   // Bug#4447 - no sound on errors, warnings
            break;
        case 1:
            $msghtml.addClass("status-msg-warning");
            appxloadurlhandler( {'data':'$warningbeep:'});   // Bug#4447 - no sound on errors, warnings
            break;
        case 2:
            $msghtml.addClass("status-msg-error");
            appxloadurlhandler( {'data':'$errorbeep:'});     // Bug#4447 - no sound on errors, warnings
            break;
        case 3:
            $msghtml.addClass("status-msg-cancel");
            appxloadurlhandler( {'data':'$cancelbeep:'});    // Bug#4447 - no sound on errors, warnings
            break;
    }
    if (str != undefined && str != "") {
        if($statusbar.text().length > 0){
            $statusbar.append("<br/>");
        }
        $statusbar.append($msghtml);
    }
}

function appxstarttimeout() {
    appxstoptimeout();
    var s = appx_session.current_show;
    if ((!s) || s.timeout == null || s.timeout <= 0 || s.timeout > 60000) return;
    appx_session.interactT = setTimeout(function setTimeoutCallback() {
        appxwidgetcallback(s.useroption ? ab2int32(s.useroption) : OPT_DIR_PROC_1);
    }, (s.timeout * 1000));
}

function appxstoptimeout() {
    if (appx_session.interactT) clearTimeout(appx_session.interactT);
    appx_session.interactT = null;
}

function appxstartblurtimeout() {
    appxstopblurtimeout();
    appx_session.interactTblur = setTimeout(function setTimeoutCallback() {
        appxwidgetcallback(OPT_TAB_OUT);
    }, (1000));
}

function appxstopblurtimeout() {
    if (appx_session.interactTblur) clearTimeout(appx_session.interactTblur);
    appx_session.interactTblur = null;
}

function RowTextStruct() {
    var self = this;
    this.type = ROWTEXT_TYPE_NONE;
    this.boxid = 0;
    this.pos_row = 0;
    this.pos_col = 0;
    this.size_rows = 0;
    this.size_cols = 0;
    this.string = null;
    this.uline = false;
};

var ROWTEXT_TYPE_NONE = 0;
var ROWTEXT_TYPE_ITEM = 1;
var ROWTEXT_TYPE_WIDGET = 2;

/*Show popup for displaying about info or telling user that functionality has not
 *yet been implemented*/
function showPopup(functional) {
    if (functional) {
        var prefs =
            "<h1>About APPX</h1>" +
            "Server Connector Version: " + appx_session.getProp("serverConnectorVersionStr") + "</br>" +
            "Local Connector Version: " + appx_session.getProp("localConnectorVersionStr") + "</br>" +
            "Browser Client APPX Directory Version: " + appx_session.getProp("clientServerVersionStr") + "</br>" +
            "Browser Client Web Directory Version: " + appx_session.getProp("clientPublicVersionStr");

    } else {
        var prefs =
            "<h1>Functionality Not Currently Enabled</h1>" +
            "<p>Functionality for this option has not been enabled in this release of APPX.</p>";

    }

    var d = $("<div id='appx_popup'>")
        .css({
            "background": "rgba(50, 50, 50, 0.7)",
            "width": "100%",
            "height": "100%",
            "min-height": "220px",
            "z-index": "10000000",
            "display": "none",
            "position": "absolute",
            "top": "0px",
            "left": "0px",
            "font-family": "verdana",
            "font-size": "11px"
        })
        .appendTo("body");

    var prefwrap = $("<div style='border: 10px solid #333;'>")
        .css({
            "width": "550px",
            "height": "220px",
            "background": "#fff"
        })
        .appendTo("#appx_popup")
        .position({
            "my": "center",
            "at": "center",
            "of": window
        })
        .draggable();

    var prefsdiv = $("<div>")
        .css({
            "margin": "0px 10px",
            "width": "550px",
            "height": "220px"
        });

    var closer = $("<div>")
        .css({
            "background": "#333",
            "text-align": "right",
            "padding": "5px",
            "color": "#F5F539",
            "font-weight": "bold",
            "padding-bottom": "10px"
        })
        .append($("<span>close(X)</span>")
            .click(function $_click() {
                $("#appx_popup").hide();
                $("#appx_popup").remove();
                if (appxLocalRequired === "true") {
                    localos_session = new LOCALOS();
                }
            }));

    $(prefwrap).prepend($("<div>").append(closer));

    $(prefsdiv).append($("<div>").append(prefs));

    $(prefsdiv).appendTo(prefwrap);

    $("#appx_popup").show();
}
