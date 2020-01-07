/*********************************************************************
 **
 **   server/appx-client-keys.js - Client Keyboard/Keymap processing
 **
 **   This module contains code to process Appx key events.
 **
 *********************************************************************/

// what_str =  "@(#)Appx $Header: /src/cvs/appxHtml5/server/appx-client-keys.js,v 1.70 2018/11/08 16:48:49 pete Exp $";

//keep menu open
var stick = false;
var dtstick = false;

//http://stackoverflow.com/a/3533099
function enterAltCtrlTextBreak(ke) {
    if (ke != null && (ke.which == 10 || ke.which == 13) && ke.target.type == "textarea") {
        if ((appx_session.getProp("textReverseEnterKey") == true && !(ke.altKey || ke.ctrlKey || ke.shiftKey)) ||
            (appx_session.getProp("textReverseEnterKey") == false && (ke.altKey || ke.ctrlKey || ke.shiftKey))) {
            var txt = ke.target;
            var val = txt.value;
            if (typeof txt.selectionStart == "number" && typeof txt.selectionEnd == "number") {
                var start = txt.selectionStart;
                txt.value = val.slice(0, start) + "\n" + val.slice(txt.selectionEnd);
                txt.selectionStart = txt.selectionEnd = start + 1;
            }
            else if (document.selection && document.selection.createRange) {
                txt.focus();
                var range = document.selection.createRange();
                range.text = "\r\n";
                range.collapse(false);
                range.select();
            }
            return true;
        }
    }
    return false;
}

function fixKeyEvent(ke) {
    if (typeof (ke) == "number") {
        ke = {
            "altKey": false,
            "ctrlKey": false,
            "target.type": "",
            "which": ke
        };
    }
    else {
        if (!ke) ke = window.event;
        if (!ke) return null;
    }
    if (!typeof (ke.which) == "number") { //NS 4, NS 6+, Mozilla 0.9+, Opera
        if (typeof (ke.keyCode) == "number") {
            ke.which = ke.keyCode; //IE, NS 6+, Mozilla 0.9+
        }
        else if (typeof (ke.charCode) == "number") {
            ke.which = ke.charCode; ////also NS 6+, Mozilla 0.9+
        }
        else {
            return false;
        }
    }
    return ke;
}

//Document.fireServerInterrupt
function fireServerInterrupt() {
    appx_session.serverInterrupt = true;
    appx_session.ws.send(JSON.stringify({
        cmd: 'appxmessage',
        args: [0, 0, 0, 0, 95, 0, 0, 0],
        handler: 'fireServerInterrupt',
        data: null
    }));
}

// handles body keydown events to a function
//window.clipboardData.getData('Text')
var digits = [];
var keyInitial = true;
var optionTriggered = 0;
if ("onhelp" in window) window.onhelp = function window_onhelp() {
    return false;
}; //IE
function sendkey(ke) {
    if (appxIsLocked()) {
        ke.preventDefault();
        ke.stopPropagation();
        return;
    }
    var ret = true; //don't prevent default action
    //If ALT key is held down, only run function once until released.
    if (ke.type == "keyup") {
        keyInitial = true;
        if (ke.which != 18) {
            return;
        }
    } else if (ke.altKey) {
        if (!keyInitial) {
            return;
        } else { 
            keyInitial = false;
        }
    }
    if ($("preferences") && (($(ke.target).length > 0) && $(ke.target).attr("id") && ($(ke.target).attr("id").indexOf("map") !== -1))) {
        $(ke.target).val(ke.which);
        switch ($(ke.target).attr("id")){
            case "mapEndKey":
                appx_session.setProp("mapEndKey", ke.which);
                break;
            case "mapOptionKey":
                appx_session.setProp("mapOptionKey", ke.which);
                break;
            case "mapTabKey":
                appx_session.setProp("mapTabKey", ke.which);
                break;
            default:
                console.log("Invalid: " + $(ke.target).attr("id"));
                break;
        }
        ke.preventDefault();
        ke.stopPropagation();
    }

    if ((($("#appx_prefs").length === 1 && $("#appx_prefs").css("display") !== "none") && (ke.which < 48 || ke.which > 57) && !(ke.which >= 65 && ke.which <= 90) && ke.which !== 9) || ($("#jqgrid-options-dialog").css("display") !== undefined )) {
        if (($("#jqgrid-options-dialog").css("display") !== "none") && ke.which == appx_session.getProp("mapEndKey")){
            $(".ui-dialog-content").dialog("close");
        }
        return;
    }
    appxstarttimeout();
    appx_session.valueTimerStart();
    try {
        if ((ke.currentTarget.activeElement !== undefined && $(ke.currentTarget.activeElement.offsetParent).parents(".searchFilter").length > 0) || ($("#cke_clone").length > 0) || 
            $(ke.currentTarget.activeElement).hasClass("ui-pg-input")) {
            return;                
        }
        ke = fixKeyEvent(ke);
        if (ke) {
            var opt = OPT_NULL; //don't send option

            //CharView.bufferAppxEvent(AWTEvent); 0x23 = VK_END
            if (ke.which == 0x23 && ke.ctrlKey && ke.altKey == false && ke.shiftKey == false)
            // && ke.getID() == KeyEvent.KEY_RELEASED )
            {
                fireServerInterrupt();
                ret = false;
            }

            if (appx_session.objFocus) { 
                if (ke.which == 10 || ke.which == 13) appxFireObjectEvent();
                return true;
            }

            if (optionTriggered > 0) { //cancel input options when key != 0-9
                if (ke.which != appx_session.getProp("mapOptionKey") && (ke.which < 48 || ke.which > 57)) {
                    optionTriggered = 0;
                    digits = [];
                }
            }

            //CharView.processArrowKey
            var moveCursor = true;
            var cur = appxGetCursorPos();
            var scrollReg = false;
            var curMoveSize = 1;
            var $parent = $(ke.target).parent();
            if (ke.which === 38 || ke.which === 40) {
                if ($parent.hasClass("appx-scroll-act")) {
                    scrollReg = true;
                    var $id = $(ke.target).attr("id");
                    var up = ke.which === 38;

                    /*Start of work on arrow keys working on multirow scroll 
                    **region(JTN)
                    
                    var move2Element = false;
                    var pos = $(ke.target).position();
                    var siblings = $(ke.target).siblings();
                    var move2Sib = null;
        
        
        
                    for (var i = 0; i < siblings.length; i++){
                    var sibPos = $(siblings[i]).position();
                    if (up && (sibPos.left === pos.left && pos.top > sibPos.top)){
                        move2Element = true;
                    }
                    if (!up && (sibPos.left === pos.left && pos.top < sibPos.top)){
                        move2Element = true;
                    }
                    if (move2Element){
                        if (move2Sib !== null){
                        m2sPos = $(move2Sib).position(); 
                        if (up){
                            if ( m2sPos.top < pos.top &&
                             m2sPos.top > sibPos.top)
                            {
                            move2Sib = siblings[i];
                            }
                        }else{
                            if ( m2sPos.top < pos.top &&
                             m2sPos.top > sibPos.top)
                            {
                            move2Sib = siblings[i];
                            }
                        }
                        curMoveSize = ((Math.abs(sibPos.top - pos.top)) / 21);
                        }else{
                        move2Sib = siblings[i];
                        curMoveSize = ((Math.abs(sibPos.top - pos.top)) / 21);
                        }
                        
                    }
                	
                    }*/

                    if (parseInt($id.substring($id.lastIndexOf("_") + 1)) !== cur.row) {
                        /*&& !move2Element){ part of above work (JTN)*/
                        curMoveSize = ($parent.height() / 21);
                    }

                    /*If scrolling past the scroll box region then we send call back
                    **to the engine to scroll the next record into view*/
                    var $scrollBox;
                    $(".appx-scroll").each(function $_each() {
                        if ($(this).css("z-index") == $parent.css("z-index")) {
                            $scrollBox = $(this);
                        }
                    });
                    var scrollCurTop = $scrollBox.position().top / 21;
                    var scrollCurBot = Math.floor($scrollBox.height() / 21) + scrollCurTop;
                    if (up) {
                        if ((cur.row - curMoveSize) < scrollCurTop) {
                            moveCursor = false;
                            appxwidgetcallback(OPT_SCROLL_DOWN);
                        }
                    } else {
                        if ((cur.row + curMoveSize) > scrollCurBot) {
                            moveCursor = false;
                            appxwidgetcallback(OPT_SCROLL_UP);
                        }
                    }

                }
            }
            if (ke.which >= 37 && ke.which <= 40) {
                if (ke.target && $(ke.target).hasClass("appxitem")) {
                    if (!scrollReg) {
                        var itemid = "appxitem_" + cur.col + "_" + cur.row;
                        if (itemid == $(ke.target).attr("id"))
                            moveCursor = false;
                    }
                }
                if (moveCursor) {
                    appx_session.showCursor = true;
                }
            }
            //check for alt key combination shortcuts
            if (ke.which >= 65 && ke.which <= 90 && ke.altKey) { //a-z
                var $btn = $(".appx-shortcut-" + ke.which);
                if ($btn.length > 0 && $btn.is("button")) {
                    $btn.click();
                    ret = false;
                }
            } else
                if (ke.altKey || (ke.which == 18)) {
                    //if alt key is pressed by itself we show access key underlines
                    ke.preventDefault();
                    if ($("body").hasClass("showaccesskeys") == true) {
                        $("body").attr("class", "");
                    } else {
                        $("body").attr("class", "showaccesskeys");
                    }
                }
            if (ret) {
                switch (ke.which) {
                    case 9: //tab
                        //@see appx-client-screen.js::appxSetTabindex
                        break;
                    case 10: //enter on win sometimes
                    case 13: //Enter = 304
                        if (!enterAltCtrlTextBreak(ke)) {
                            if ($(".default").length > 0) {
                                $(".default").click();
                                ret = false;
                            }
                            else if (ke.currentTarget.activeElement.offsetParent == null || ke.currentTarget.activeElement.offsetParent.className != "ui-search-input") {
                                opt = OPT_ENTER;
                            }
                        }
                        break;
                    case appx_session.getProp("mapEndKey"): // End key: default ESC == 27
                        ret = false;
                        if (appx_session.activeDatepicker) {
                            appx_session.activeDatepicker.datepicker('hide');
                        }
                        else {
                            if (ke.ctrlKey) opt = OPT_CAN;
                            else opt = OPT_END;
                        }
                        break;
                    case 33: //PgUp
                        opt = OPT_SCROLL_PREV;
                        break;
                    case 34: //PgDn
                        opt = OPT_SCROLL_NXT;
                        break;
                    case 37: //arrow left
                        if (moveCursor) {
                            appx_session.keyLeft = true;
                            ret = appxPutCursor(cur.col - 1, cur.row);
                            appx_session.keyLeft = false;
                        }
                        break;
                    case 38: //arrow up  
                        if (moveCursor) {
                            ret = appxPutCursor(cur.col, cur.row - curMoveSize);
                        }
                        break;
                    case 39: //arrow right
                        if (moveCursor) {
                            ret = appxPutCursor(cur.col + 1, cur.row);
                        }
                        break;
                    case 40: //arrow down
                        if (moveCursor) {
                            ret = appxPutCursor(cur.col, cur.row + curMoveSize);
                        }
                        break;
                    case 48: //0
                    case 49: //1
                    case 50: //2
                    case 51: //3
                    case 52: //4
                    case 53: //5
                    case 54: //6
                    case 55: //7
                    case 56: //8
                    case 57: //9
                        if (ke.ctrlKey) {
                            if (ke.which == 49) opt = OPT_DIR_PROC_1;
                            else if (ke.which == 50) opt = OPT_DIR_PROC_2;
                        }
                        else if (optionTriggered > 0) {
                            //pressed option key(s) followed by number(s)
                            digits.push(parseInt(String.fromCharCode(ke.which)));
                            if (--optionTriggered == 0) {
                                opt = parseInt(digits.join(''));
                                digits = [];
                            }
                            ret = false;
                        }
                        break;
                    case 77: //m
                        if (ke.ctrlKey) opt = OPT_SHOW_MSG;
                        break;
                    case 112: //F1 = 276
                        opt = OPT_HELP_ITM;
                        break;
                    case 113: //F2 = 257
                        opt = OPT_SCAN;
                        break;
                    case 114: //F3 = 259
                        opt = OPT_SLCT_KEY;
                        break;
                    case 115: //F4 = 260
                        opt = OPT_PREV_IMG;
                        break;
                    case 116: //F5 = 261
                        //should we allow a 'hard refresh'? (Ctrl+F5)
                        if (!ke.ctrlKey) opt = OPT_NXT_REC;
                        break;
                    //case 117://F6
                    //sendappxshow(266);
                    //break;
                    //case 118://F7
                    case 119: //F8 = 274
                        ret = false;
                        if (ke.ctrlKey) opt = OPT_CAN;
                        else opt = OPT_END;
                        break;
                    case 120: //F9 = 265
                        opt = OPT_ADD_MODE;
                        ret = false;
                        break;
                    case 121: //F10 = 266
                        ret = false;
                        if (ke.ctrlKey) {
                            opt = OPT_ACK_DEL;
                        } else {
                            opt = OPT_DEL_MODE;
                        }
                        break;
                    case 122: //F11 = 267
                        ret = false;
                        opt = OPT_INQ_MODE;
                        break;
                    case 123: //F12 = 268
                        ret = false;
                        opt = OPT_CHG_MODE;
                        break;
                    case appx_session.getProp("mapOptionKey"): // Option Key: default ` == 192
                        if (($("#mapOptionKey")).length === 0) {
                            optionTriggered++;
                            if (optionTriggered > 3) optionTriggered = 0;
                            ret = false;
                        }
                        break;
                    case 20102: // Show Option Numbers
                        appx_session.showoptnums = !appx_session.showoptnums;
                        opt = OPT_SHOW_OPT_NUMS;
                        break;
                } //end switch
                if (opt != OPT_NULL && (appx_state_last === APPX_STATE_READY || appx_state_last === APPX_STATE_DIRTY)) {
                    ret = false;
                    appxwidgetcallback(opt);
                }
            }
        }
        if (!ret) {
            //returning false will automatically call prevDef. and stopProp.
            ke.preventDefault();
            ke.stopPropagation();
        }
        return ret;
    }
    catch (ex) {
        console.log("sendkey: " + ex);
        console.log(ex.stack);
    }
}

function SoftKey(id, text, keycode) {
    this.id = id;
    this.text = text;
    this.keycode = keycode;
}

function createsoftkeys() {
    var softkeys = $("#appx-softkeys-container").hover({}, function $_hover() {
        if (!stick) {
            $(softkeys).hide("slide", {}, 500);
            $("#softkeys_showhide").show("fade", {}, 500);
        }
        return false;
    });

    var buttons = [{
        "id": "f1",
        "text": appx_session.language.buttons.help,
        "keycode": 112
    }, {
            "id": "f2",
            "text": appx_session.language.buttons.scan,
            "keycode": 113
        }, {
            "id": "f3",
            "text": appx_session.language.buttons.select,
            "keycode": 114
        }, {
            "id": "f4",
            "text": appx_session.language.buttons.prev,
            "keycode": 115
        }, {
            "id": "f5",
            "text": appx_session.language.buttons.next,
            "keycode": 116
        }, {
            "id": "f6",
            "text": "F6",
            "keycode": 117
        }, {
            "id": "f7",
            "text": "F7",
            "keycode": 118
        }, {
            "id": "f8",
            "text": appx_session.language.buttons.end,
            "keycode": 119
        }, {
            "id": "f9",
            "text": appx_session.language.buttons.add,
            "keycode": 120
        }, {
            "id": "f10",
            "text": appx_session.language.buttons.delete,
            "keycode": 121
        }, {
            "id": "f11",
            "text": appx_session.language.buttons.inquire,
            "keycode": 122
        }, {
            "id": "f12",
            "text": appx_session.language.buttons.change,
            "keycode": 123
        }, {
            "id": "enter",
            "text": appx_session.language.buttons.enter,
            "keycode": 13
        }, {
            "id": "showopt",
            "text": appx_session.language.buttons.showOptions,
            "keycode": 20102
        }];

    var b = $('<button type="button">');

    $(b).html("&lt;&lt; Stay Open");
    $(b).attr("id", "button_stick_softkeys");

    $(b).click(function $_click() {
        stick = true;
        return false;
    });

    $(softkeys).append(b);

    for (var i = 0; i < buttons.length; i++) {

        var b = $('<button type="button">');

        $(b).text(buttons[i].text);
        $(b).attr("id", "button_" + buttons[i].keycode);
        $(b).addClass("softkey");

        $(b).click(function $_click() {
            var id = this.id.replace("button_", "");
            sendkey(parseInt(id));
            return false;
        });

        $(softkeys).append(b);
    }

    var b = $('<button type="button">');

    $(b).html("&lt;&lt; Hide");
    $(b).attr("id", "button_close_softkeys");

    $(b).click(function $_click() {
        stick = false;
        $(softkeys).hide("slide", {}, 500);
        $("#softkeys_showhide").show("fade", {}, 500);
        return false;
    });

    $(softkeys).append(b);

    var b = $('<button type="button">').hide();
    $(b).addClass("rotate");
    $(b).text("Show/Hide Soft Keys");
    $(b).attr("id", "softkeys_showhide");

    $(b).hover(function $_hover() {
        $(softkeys).show("slide", {}, 500);
        $(this).hide("fade", {}, 500);
        return false;
    }, {});

    $("body").append(b);
    $(softkeys).hide();
}

function createappxdefaulttools() {
    if (appxStaticTools == "true")
        return;

    var defaulttools = $("#appx-defaulttools-container").hover({}, function $_hover() {
        if (!dtstick) {
            $(defaulttools).hide("slide", {
                "direction": "right"
            }, 500);
            $("#defaulttools_showhide").show("fade", {}, 500);
        }
        return false;
    });

    var b = $('<button type="button">');

    $(b).html("&lt;&lt; Stay Open");
    $(b).attr("id", "button_stick_defaulttools");

    $(b).click(function $_click() {
        dtstick = true;
        return false;
    });

    $(defaulttools).append(b);


    var b = $('<button type="button">');

    $(b).html("&lt;&lt; Hide");
    $(b).attr("id", "button_close_defaulttools");

    $(b).click(function $_click() {
        dtstick = false;
        $(defaulttools).hide("slide", {
            "direction": "right"
        }, 500);
        $("#defaulttools_showhide").show("fade", {}, 500);
        return false;
    });

    $(defaulttools).append(b);

    var b = $('<button type="button">').hide();
    $(b).addClass("rotate");
    $(b).text("Show/Hide Tools");
    $(b).attr("id", "defaulttools_showhide");

    $(b).hover(function $_click() {
        $(defaulttools).show("slide", {
            "direction": "right"
        }, 500);
        $(this).hide("fade", {}, 500);
        return false;
    }, {});

    $("body").append(b);
    $(defaulttools).hide();
}

createappxdefaulttools();
createsoftkeys();

//Document
/*
 * Data entry keys - pad with comments since js-beautify removed the whitespace
 */
var OPT_BASE /*         */ = 256;
var OPT_SCAN /*         */ = (OPT_BASE + 1); //Scan Mode
var OPT_SLCT_KEY /*     */ = (OPT_BASE + 3); //Select Access
var OPT_PREV_IMG /*     */ = (OPT_BASE + 4); //Previous window
var OPT_NXT_REC /*      */ = (OPT_BASE + 5); //Next record
//var OPT_REDISPLAY        = (OPT_BASE + 6); //Redisplay text
//var OPT_SPLIT            = (OPT_BASE + 7); //Split Text
//var OPT_END_PARAG        = (OPT_BASE + 8); //End Paragraph
var OPT_ADD_MODE /*     */ = (OPT_BASE + 9); //Add Mode
var OPT_DEL_MODE /*     */ = (OPT_BASE + 10); //Delete Mode
var OPT_INQ_MODE /*     */ = (OPT_BASE + 11); //Inquire Mode
var OPT_CHG_MODE /*     */ = (OPT_BASE + 12); //Change Mode
var OPT_REDSPL_TXT /*   */ = (OPT_BASE + 13); //Redisplay screen
var OPT_KEY_ENTRY /*    */ = (OPT_BASE + 14);
//var OPT_SET_ATR          = (OPT_BASE + 15); //Set Item Attr
var OPT_DIR_PROC_1 /*   */ = (OPT_BASE + 16); //Direct Proc 1
var OPT_DIR_PROC_2 /*   */ = (OPT_BASE + 17); //Direct Proc 2
var OPT_END /*          */ = (OPT_BASE + 18); //End
var OPT_HELP_ITM /*     */ = (OPT_BASE + 20); //Explain Item
//var OPT_PRT_SCR          = (OPT_BASE + 21); //Print screen
var OPT_CAN /*          */ = (OPT_BASE + 22); //Cancel
var OPT_SHOW_MSG /*     */ = (OPT_BASE + 23); //Show All Msgs
var OPT_HELP_OPT /*     */ = (OPT_BASE + 24); //Explain option
var OPT_ENTER /*        */ = (OPT_BASE + 48); //Enter key
var OPT_ACK_DEL /*      */ = (OPT_BASE + 49); //Delete Record
var OPT_SCROLL_FIRST /* */ = (OPT_BASE + 64); //Scroll First
var OPT_SCROLL_LAST /*  */ = (OPT_BASE + 65); //Scroll Last
var OPT_SCROLL_PREV /*  */ = (OPT_BASE + 66); //Scroll Prev
var OPT_SCROLL_NXT /*   */ = (OPT_BASE + 67); //Scroll Next
var OPT_SCROLL_UP /*    */ = (OPT_BASE + 68); //Scroll Up
var OPT_SCROLL_DOWN /*  */ = (OPT_BASE + 69); //Scroll Down
//var OPT_JOIN             = (OPT_BASE + 73); //Split text
//var OPT_TIMEOUT          = (OPT_BASE + 74); //Timeout
var OPT_TAB_IN /*       */ = (OPT_BASE + 75); //Tab In
var OPT_TAB_OUT /*      */ = (OPT_BASE + 76); //Tab Out
var OPT_VALUE_CHANGED /**/ = (OPT_BASE + 77); //Value Changed
//var OPT_CHANGED_TABOUT   = (OPT_BASE + 78); //Value Change / Tab Out combo
var OPT_DROP /*         */ = (OPT_BASE + 79); //ca_20120706_R83_DragAndDrop
var OPT_DLU_ON_TABOUT = (OPT_BASE + 80);
var OPT_DLU_AND_TABOUT = (OPT_BASE + 81);
//var OPT_DLU_CHG_TABOUT   = (OPT_BASE + 82);
//var OPT_DLU_AND_VALCHG   = (OPT_BASE + 83);
//var OPT_COMM_TIMEOUT     = (OPT_BASE + 84);

/* Panning Options */
/*var OPT_PAN_BASE        = 10000;
var OPT_PAN_TOP         = (OPT_PAN_BASE +  0);
var OPT_PAN_BOT         = (OPT_PAN_BASE +  1);
var OPT_PAN_L_MARGIN    = (OPT_PAN_BASE +  2);
var OPT_PAN_R_MARGIN    = (OPT_PAN_BASE +  3);
var OPT_PAN_UP_1        = (OPT_PAN_BASE +  4);
var OPT_PAN_UP_SCR      = (OPT_PAN_BASE +  5);
var OPT_PAN_DOWN_1      = (OPT_PAN_BASE +  6);
var OPT_PAN_DOWN_SCR    = (OPT_PAN_BASE +  7);
var OPT_PAN_L_1         = (OPT_PAN_BASE +  8);
var OPT_PAN_L_SCR       = (OPT_PAN_BASE +  9);
var OPT_PAN_R_1         = (OPT_PAN_BASE + 10);
var OPT_PAN_R_SCR       = (OPT_PAN_BASE + 11);
var OPT_FIND_PATTERN    = (OPT_PAN_BASE + 12);
var OPT_PAN_MAX         = (OPT_PAN_BASE + 12);*/

/*
 * Optional System Dependent Options (Optional Options?)
 */
var OPT_SYS_BASE = 20000;
/*var OPT_TAB             = (OPT_SYS_BASE +  0);  //TAB
var OPT_BACK_TAB        = (OPT_SYS_BASE +  1);  //Back Tab
var OPT_UP              = (OPT_SYS_BASE +  2);  //Cursr Up
var OPT_DOWN            = (OPT_SYS_BASE +  3);  //Cursr Down
var OPT_L               = (OPT_SYS_BASE +  4);  //Cursr Left
var OPT_R               = (OPT_SYS_BASE +  5);  //Cursr Right
var OPT_INSERT          = (OPT_SYS_BASE +  6);  //Insert Here
var OPT_DEL_PREV_C      = (OPT_SYS_BASE +  7);  //Del prev
var OPT_DEL_BEG_ITM     = (OPT_SYS_BASE +  8);  //Del to Strt
var OPT_DEL_END_ITM     = (OPT_SYS_BASE +  9);  //Del to end
var OPT_MOVE_BEG_ITM    = (OPT_SYS_BASE + 10);  //Move to Beg
var OPT_MOVE_END_ITM    = (OPT_SYS_BASE + 11);  //Move to End
var OPT_REDRAW_LINE     = (OPT_SYS_BASE + 12);  //Redraw Line
var OPT_REDRAW_SCR      = (OPT_SYS_BASE + 13);  //Redraw Scrn
var OPT_DEL_CUR_C       = (OPT_SYS_BASE + 14);  //Del Char
var OPT_CUT             = (OPT_SYS_BASE + 15);  //Pickup Item
var OPT_PASTE           = (OPT_SYS_BASE + 16);  //Putdown Itm
var OPT_GO_ADD          = (OPT_SYS_BASE + 17);
var OPT_GO_INQ          = (OPT_SYS_BASE + 18);
var OPT_GO_CHG          = (OPT_SYS_BASE + 19);
var OPT_MACRO           = (OPT_SYS_BASE + 20);  //Macro rec
var OPT_HOME            = (OPT_SYS_BASE + 25);  //Home
var OPT_NXT_LINE        = (OPT_SYS_BASE + 26);  //Next Line

var OPT_COPY            = (OPT_SYS_BASE + 27);
var OPT_SELECT          = (OPT_SYS_BASE + 28);
var OPT_SELECT_ALL      = (OPT_SYS_BASE + 29);
var OPT_PRINT_SETUP     = (OPT_SYS_BASE + 30);
var OPT_ABOUT           = (OPT_SYS_BASE + 31);
var OPT_SESSION_PROPS   = (OPT_SYS_BASE + 32); */
var OPT_WHATS_THIS /**/ = (OPT_SYS_BASE + 33);
/*var OPT_DELETE          = (OPT_SYS_BASE + 34);

var OPT_ARROW_TOOL      = (OPT_SYS_BASE + 40);
var OPT_BUTTON_TOOL     = (OPT_SYS_BASE + 41);
var OPT_LABEL_TOOL      = (OPT_SYS_BASE + 42);
var OPT_PICTURE_TOOL    = (OPT_SYS_BASE + 43);
var OPT_BOX_TOOL        = (OPT_SYS_BASE + 44);
var OPT_LINE_TOOL       = (OPT_SYS_BASE + 45);
var OPT_TABLE_TOOL      = (OPT_SYS_BASE + 46);

var OPT_SHOW_BOUNDS     = (OPT_SYS_BASE + 60);
var OPT_DATA_PALETTE    = (OPT_SYS_BASE + 61);
var OPT_OBJECT_PROPS    = (OPT_SYS_BASE + 62);
var OPT_WINDOW_PROPS    = (OPT_SYS_BASE + 63);
var OPT_ALIGN_TOP       = (OPT_SYS_BASE + 64);
var OPT_ALIGN_BOTTOM    = (OPT_SYS_BASE + 65);
var OPT_ALIGN_LEFT      = (OPT_SYS_BASE + 66);
var OPT_ALIGN_RIGHT     = (OPT_SYS_BASE + 67);
var OPT_SAME_SIZE_VERT  = (OPT_SYS_BASE + 68);
var OPT_SAME_SIZE_HORIZ = (OPT_SYS_BASE + 69);
var OPT_NEW_GUIDE_VERT  = (OPT_SYS_BASE + 70);
var OPT_NEW_GUIDE_HORIZ = (OPT_SYS_BASE + 71);
var OPT_SPREAD_HORIZ = (OPT_SYS_BASE + 72);
var OPT_SPREAD_VERT = (OPT_SYS_BASE + 73);

var OPT_GUI_INTERFACE   = (OPT_SYS_BASE + 101);
*/
var OPT_SHOW_OPT_NUMS = (OPT_SYS_BASE + 102);
/*
var OPT_AUTO_TAB_OUT    = (OPT_SYS_BASE + 103);
var OPT_AUTO_SELECT     = (OPT_SYS_BASE + 104);
var OPT_DOCKING_SCROLLB = (OPT_SYS_BASE + 105);
var OPT_SHOW_GRIDLINES  = (OPT_SYS_BASE + 106);*/

/*
 * Optional GUI Client Dependent Options (Optional Options?)
 */
/*var OPT_GUI_BASE      = 21000;
var OPT_DATE_CHOOSER  = (OPT_GUI_BASE +  0);  //Date Chooser
var OPT_COLOR_CHOOSER = (OPT_GUI_BASE +  1);  //Color Chooser
var OPT_FILE_CHOOSER  = (OPT_GUI_BASE +  2);  //File Chooser
var OPT_KEY_ENTRY     = (OPT_GUI_BASE +  3);  //Key Entry trigger
var OPT_PACK_DISPLAY  = (OPT_GUI_BASE +  4);  //Key Entry trigger
var OPT_NEW_INSTANCE  = (OPT_GUI_BASE +  5);  //Launch new instance
*/
var OPT_NULL = 65535;
