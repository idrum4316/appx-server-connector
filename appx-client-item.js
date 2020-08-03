/*********************************************************************
 **
 **   server/appx-client-item.js - Client Item processing
 **
 **   This module contains code to process Appx Item screen elements.
 **
 *********************************************************************/

// what_str =  "@(#)Appx $Header$";

"use strict";
//find the smallest container for an item
function appxitembox(pos_row, pos_col, size_rows, size_cols) {
    var ret = null, ret2 = null;
    var dim = appx_session.screencols * appx_session.screenrows;
    var boxes = appx_session.current_show.boxes;
    for (var boxIdx = 0; boxIdx < boxes.length; boxIdx++) {
        var box = boxes[boxIdx];
        if (pos_col >= box.begin_column &&
            pos_col <= box.end_column &&
            pos_row >= box.begin_row &&
            pos_row <= box.end_row) {
            ret2 = box;//fallback: some widgets can extend past frame size
            if (pos_col + size_cols - 1 <= box.end_column &&
                pos_row + size_rows - 1 <= box.end_row) {
                ret = box;
            }
        }
    }
    if (ret == null) ret = ret2;
    if (ret != null && ret.newbox >= 0) ret = boxes[ret.newbox];
    return ret;
}

function appxcreateformatitem(item, el) {
    var longdata = null;
    var $itemhtml = $("<input type='text'>");
    if (el) {
        $itemhtml = el;
    }
    var data = "";
    $itemhtml.addClass("masked");
    if (!longdata)
        longdata = parseItemLongData(item.rawdata);
    var maskstr = longdata.itemdata[1][0].replace(/\_/g, "*");
    for (var z = 0; z < longdata.itemdata[1][0].length; z++) {
        if (longdata.itemdata[1][0][z] == "X") {
            maskstr = maskstr.replace(maskstr[z], longdata.itemdata[0][0][z]);
        } else {
            data += longdata.itemdata[0][0][z];
        }

    }

    $itemhtml.inputmask(maskstr, { "placeholder": " ", insertMode: false, clearMaskOnLostFocus: false });
    $itemhtml.val(data);

    return $itemhtml;
}
/**
 * converts logic value (0/1/y/n) to alpha value (Y/N)
 * @param {*} logic_value
 */
function appxLogicToAlpha(logic){
    /*Sanatize the value of checkbox*/
    //Note: appx6 sends 4 characters ("Y   ") as the value, so we need to only check the first character until that gets resolved
    if(logic.charAt(0) == "y" || logic.charAt(0) == "Y" || logic.charAt(0) == "1"){
        return "Y";
    }
    else if(logic.charAt(0) == "n" || logic.charAt(0) == "N" || logic.charAt(0) == "0"){
        return "N";
    }
    else{
        return "";
    }
}

//Items Message Handler
function appxitemshandler(x) {
    var modeFound = false;

    try {
        appx_session.items.length = 0; //clear array

        var i = 0;
        var wt = null;
        var longdata = null;
        while (x.data.length > 0) {
            wt = null;
            longdata = null;
            if (item) {
                var lastItem = item;
            }
            var item = x.data.shift();
            
            var $itemhtml = $("<div>");
            //console.log("item row=%d, col=%d special=%d wt=%d label=%s",item.pos_row,item.pos_col,item.special,(item.widget == null ? -1 : item.widget.wWidgetType),item.data);
            item.uline = appxIsUline(item);
            appxSetModifiableCapable(item, false);
            
            switch (item.type) {
                case ELEM_ALP_CONTIG:
                case ELEM_ALP_NON_CONTIG:
                case ELEM_ALP_SUBSTR:
                case ELEM_ALP_CMPRS:
                    var loInt = item.digits_right;
                    var hiInt = item.digits_left;
                    if (loInt < 0) loInt += 256;
                    if (hiInt < 0) hiInt += 256;
                    /**
                     * From release 6.1 we send maxLen from the engine as a 4 byte integer to support large fields
                     * So, if we already have value in maxLen, don't assign it based on hi and lo values
                     */
                    if(item.maxLen == undefined || item.maxLen <= 0)
                        item.maxLen = ((hiInt * 256) + loInt);
                    break;
                //date field fix
                case ELEM_ALP_JUL_DATE:
                case ELEM_ALP_GREG_DATE:
                case ELEM_BIN_JUL_DATE:
                case ELEM_BIN_GREG_DATE:
                case ELEM_PD_JUL_DATE:
                case ELEM_PD_GREG_DATE:
                case ELEM_UNIVERSAL_DATE:
                    /**
                     * From release 6.1 we send maxLen from the engine as a 4 byte integer to support large fields
                     * So, if we already have value in maxLen, don't override it
                     */
                    if(item.maxLen == undefined || item.maxLen <= 0)
                        item.maxLen = item.size_rows * item.size_cols;
                    if (!longdata) longdata = parseItemLongData(item.rawdata);
                    item.data = longdata.itemdata[0][0];
                    break;
                default:
                    /**
                     * From release 6.1 we send maxLen from the engine as a 4 byte integer to support large fields
                     * So, if we already have value in maxLen, don't override it
                     */
                    if(item.maxLen == undefined || item.maxLen <= 0)
                        item.maxLen = item.size_rows * item.size_cols;
                    break;
            }

            item.widget = new Widget(0, "", item.widget);
            wt = item.widget.wWidgetType;

			// Check and if required santize the incomming text of html (Note:  Should add widget type instead of null)
			if (wt != WIDGET_TYPE_HTML_VIEWER && wt != WIDGET_TYPE_HTML_EDITOR && appxIsModifiable(item) == false) {
				item.data = sanitizeText( item.data, null );
			}

            if (item.type == ELEM_LOG && wt == null) {
                wt = WIDGET_TYPE_CHECK_BOX;
                item.widget.wWidgetType = WIDGET_TYPE_CHECK_BOX;
            }

            if (appxIsModifiable(item) == false && appxIsModifiableCapable(item) == false && appxIsStatus(item) == false && wt == null) {
                var rowtxt = new RowTextStruct();
                rowtxt.type = ROWTEXT_TYPE_ITEM;
                rowtxt.uline = item.uline;
                rowtxt.boxid = -1;
                rowtxt.isTitle = item.widget.wInvert;
                rowtxt.pos_row = item.pos_row;
                rowtxt.pos_col = item.pos_col;
                rowtxt.size_rows = item.size_rows;
                rowtxt.size_cols = item.size_cols;
                rowtxt.string = item.data;
                rowtxt.wordWrap = appxIsWordWrap(item);
                appx_session.rowtext.unshift(rowtxt);
                appx_session.items.push([item, null, (item.pos_row * 256) + item.pos_col, rowtxt]);
                continue;
            }

            if (appxIsModifiable(item)) {
                item.data = item.data.replace(/\xB6/g, "\r\n").replace(/ *$/gm, "");; //all occurrences of paragraph markers with newline

                // found problem in scan popups with wt == null, set to input if null and modifiable
                if (wt == null && (item.special & 0x02) == 0x02) {
                    wt = WIDGET_TYPE_LISTBOX;
                    item.widget.wWidgetType = WIDGET_TYPE_LISTBOX;
                }
                if (wt == null) {
                    wt = WIDGET_TYPE_RAW_TEXT;
                    item.widget.wWidgetType = WIDGET_TYPE_RAW_TEXT;
                }
            }
            else {
                item.data = item.data.replace(/\xB6/g, "<br/>").replace(/ *$/gm, "");//all occurrences of paragraph markers with newline

                // found problem in scan popups with wt == null, set to label if null and not modifiable
                if (wt == null) {
                    wt = WIDGET_TYPE_LABEL;
                    item.widget.wWidgetType = WIDGET_TYPE_LABEL;
                }
                else if (wt == WIDGET_TYPE_FILE_CHOOSER || wt == WIDGET_TYPE_DATE_CHOOSER || wt == WIDGET_TYPE_LISTBOX) {
                    item.widget.wLabel = null;
                    item.widget.wWidgetType = WIDGET_TYPE_RAW_TEXT;
                    //save the original type somewhere for further processing
                    item.widget.wWidgetOriginalType = wt;
                    wt = WIDGET_TYPE_RAW_TEXT;
                }
            }

            /*New widget creation code*/
            if (typeof appx_session.createWidgetTag[wt] !== "function") {
                var itemObj = appx_session.createWidgetTag["default"](item.widget, $itemhtml);
                $itemhtml = itemObj.tag;
                item.widget = itemObj.widget;
                wt = item.widget.wWidgetType;
            } else if (wt === WIDGET_TYPE_DATE_CHOOSER) {
                itemObj = appx_session.createWidgetTag[wt](item.widget, $itemhtml, item, longdata);
                $itemhtml = itemObj.tag;
                longdata = itemObj.longdata;
            } else  {
                $itemhtml = appx_session.createWidgetTag[wt](item.widget, $itemhtml, item);
            }
            if (item.widget.wPositionX !== null) {
                $itemhtml.data("row", item.widget.wPositionY);
                $itemhtml.data("col", item.widget.wPositionX);
            } else {
                $itemhtml.data("row", item.pos_row);
                $itemhtml.data("col", item.pos_col);
            }
            if (item.widget.wDragAndDrop !== null) {
                $itemhtml.addClass("Drop");
            }
            $itemhtml.data("parent_type", WIDGET_PRNT_TYPE_ITEM);
            $itemhtml.addClass("item_with_widget");
            if ((item.special & 0x30) == 0x30) {
                $itemhtml.data("unicode", true);
            } else {
                $itemhtml.data("unicode", false);
            }
            // FLD_SPEC_MOD
            if (appxIsModifiable(item)) {
                // all modifiable items need input class
                $itemhtml.addClass("input");

                $itemhtml.on("input change", {
                    wx: item.widget
                }, function $_onChange(e) {
                    $(this).addClass("dirty");
                    appxSetStatusStateText(APPX_STATE_DIRTY);
                    //check if last char is not a space or else it's not saved
                    if (e.data.wx && ($(this).val().slice(-1) != ' ' || $(this).is("input[type=checkbox]"))) {
                        appx_session.valueTimerStart(e.data.wx.wCommandValueAdjusted, $(this));
                    }
                });
                // Firefox is special.  It refuses to fire a change event on a SELECT Listbox until the user 
                // tabs out of the element if they changed the list value using the keyboard.  So we have to 
                //use a key event to trigger it being dirty and to process on change triggers.
                if ($itemhtml.hasClass("appx-listbox")) {
                    $itemhtml.on("keypress", {
                        wx: item.widget
                    }, function $_onKeypress(e) {
                        $(this).addClass("dirty");
                        appxSetStatusStateText(APPX_STATE_DIRTY);

                        //check if last char is not a space or else it's not saved
                        if (e.data.wx && $(this).val().slice(-1) != ' ') {
                            appx_session.valueTimerStart(e.data.wx.wCommandValueAdjusted, $(this));
                        }
                    });
                }

                if (appxIsMasked(item)) {
                    $itemhtml.on("input keyup", {
                        wx: item.widget
                    }, function $_onKeyup(e) {
                        $(this).addClass("dirty");
                        appxSetStatusStateText(APPX_STATE_DIRTY);

                        //check if last char is not a space or else it's not saved
                        if (e.data.wx && $(this).val().slice(-1) != ' ') {
                            appx_session.valueTimerStart(e.data.wx.wCommandValueAdjusted, $(this));
                        }
                    });
                }

                $itemhtml.addClass("appx-modifiable");

                if (appxIsToken(item)) {
                    if (wt == WIDGET_TYPE_RAW_TEXT) {
                        $itemhtml.attr('maxlength', item.size_cols);
                    }
                }
                else {
                    if (item.maxLen) $itemhtml.attr('maxlength', item.maxLen);
                }

            }
            else { //ELSE !FLD_SPEC_MOD

                if (wt == WIDGET_TYPE_NONE || wt == WIDGET_TYPE_RAW_TEXT ||
                    wt == WIDGET_TYPE_LABEL) {
                    $itemhtml = $("<div>");
                    if (item.widget.wSepBefore !== null && item.widget.wSepBefore === true) {
                        $itemhtml.addClass("sepBefore");
                    }
                    if (item.widget.wSepAfter !== null && item.widget.wSepAfter === true) {
                        $itemhtml.addClass("sepAfter");
                    }

                    if (wt != WIDGET_TYPE_LABEL) {
                        $itemhtml.addClass("appx-raw-text");
                    }

                    //if the original type was listbox and changed to raw-text add class listbox
                    if(item.widget != null && item.widget.wWidgetOriginalType == WIDGET_TYPE_LISTBOX){
                        $itemhtml.addClass("appx-listbox-originally");
                    }

                    if (item.pos_row <= appx_session.screenrows - 3) {
                        if (item.size_rows > 1 || wt != WIDGET_TYPE_LABEL) { //dont mangle fonts by pre tag
                            var $pre = $("<div>");

                            if (item.size_rows > 1)
                                $pre.css("white-space", "pre-wrap");
                            else
                                $pre.css("white-space", "pre");
                            $pre.html(item.data).appendTo($itemhtml);
                        }
                        else {
                            if (item.type == ELEM_LOG) {
                                item.data = appxLogicToAlpha(item.data);
                            }
                            $itemhtml.html(item.data);
                        }
                    }
                    if (item.widget.wPositionX !== null) {
                        $itemhtml.data("row", item.widget.wPositionY);
                        $itemhtml.data("col", item.widget.wPositionX);
                    } else {
                        $itemhtml.data("row", item.pos_row);
                        $itemhtml.data("col", item.pos_col);
                    }
                    if (item.widget.wDragAndDrop !== null) {
                        $itemhtml.addClass("Drop");
                    }
                }

                if (appxIsModifiableCapable(item)) {
                    $itemhtml.addClass("appx-not-modifiable");
                }

            } //END FLD_SPEC_MOD

            if (appxIsUppercase(item))
                $itemhtml.css("text-transform", "uppercase");

            if (appxIsModifiable(item) || wt == WIDGET_TYPE_BUTTON) {
                $itemhtml.prop("disabled", false);
            } else {
                $itemhtml.prop("disabled", true);
            }

            if (appxIsNullOk(item)) {
                $itemhtml.addClass("appx-nullok");
            }
            else {
                if (!longdata) longdata = parseItemLongData(item.rawdata);
                if (longdata && longdata.itemdata[0][0] == "")
                    $itemhtml.addClass("appx-nullok");
            }

            if (appxIsMasked(item)) {
                appxcreateformatitem(item, $itemhtml);
            }

            if (wt == WIDGET_TYPE_LABEL) {
                $itemhtml.addClass("label").addClass("notranslate");
            } else {
                $itemhtml.addClass("appxitem").addClass("notranslate").addClass("appxfield").data("row", item.pos_row).data("col", item.pos_col);
            }

            if (wt != WIDGET_TYPE_BUTTON) {
                $itemhtml.attr("id", addClientId("appxitem_" + item.pos_col + "_" + item.pos_row, item.widget ? item.widget.wClientId : null)); 
            }

            $itemhtml.on("focus", function $_onFocus() {
                appx_session.valueTimerStop();
                var ida = getClientId($(this).attr("id")).split('_');
                logca("item focus: " + ida[1] + "." + ida[2]);
                appxPutCursor(ida[1], ida[2]);

                if (appx_session.lastOption && ( appx_session.lastOption === "333" || appx_session.lastOption === 333 ) && !($(this).is("input[type=checkbox]") || $(this).is(".checkbox-label")) ) {
                   this.selectionStart = this.selectionEnd = appx_session.keyPauseLastPosition;
                } else {
                    if (appx_session.getProp("autoSelect")) {
                        $(this).select();
                    }
                }
            });

            if (item.widget.wCommandLostFocus === null) {
                appxAttachBlur($itemhtml, "block");
            }

            appxwidgetdimensions(item, $itemhtml);
            appxwidgetshandlerprops(item, $itemhtml);

            //get token field data
            if (appxIsToken(item)) {
                if (appxIsModifiable(item) && (wt == WIDGET_TYPE_LISTBOX || wt == null)) {
                    var cacheid = appx_session.server.replace(/\./g, "_") + "_" + appx_session.port + "_" + item.token_cacheid + "_" + item.token_app + "_" + item.token_ap_ver + "_" + item.token_cache_sig;
                    appx_session.token_groups[item.token_group] = cacheid;
                    if (!appx_session.token_cache[cacheid]) {
                        appx_session.token_cache.length++;
                        appx_session.token_cache.keys.push(cacheid);
                        appx_session.token_cache[cacheid] = {
                            "cacheid": cacheid,
                            "data": ""
                        };
                        if (!appxtokengetitem(cacheid)) {
                            sendappxtoken(item.token_group);
                        }
                    }
                    $itemhtml.addClass(cacheid);
                }
            }

            if (item.size_rows > 1)
                $itemhtml.css({
                    "overflow": "auto"
                });
            else if (item.widget == null || item.widget.wWidgetType != WIDGET_TYPE_SLIDER)
                if (item.size_rows > 1) {
                    $itemhtml.css({
                        "overflow": "hidden",
                        "white-space": "pre-wrap"
                    });
                }
                else {
                    $itemhtml.css({
                        "overflow": "hidden",
                        "white-space": "pre"
                    });
                }

            if (item.uline) {
                if ($itemhtml) {
                    $itemhtml.addClass("appx-uline");
                }
            }

            if (item.pos_row <= appx_session.screenrows - 3)
                appx_session.items.push([item, $itemhtml, (item.pos_row * 256) + item.pos_col]);

            if (appxIsStatus(item)) {
                if (appxIsStatusDb(item)) appxSetStatusDbText(item.data);
                if (appxIsStatusAp(item)) appxSetStatusApText(item.data);
                if (appxIsStatusVer(item)) appxSetStatusVerText(item.data);
                if (appxIsStatusUser(item)) appxSetStatusUserText(item.data);
                if (appxIsStatusKeymap(item)) appxSetStatusKeymapText(item.data);
                if (appxIsStatusMode(item)) appxSetStatusModeText(item.data);
                if (appxIsStatusEmbld(item)) appxSetStatusEmbldText(item.data);
                if (appxIsStatusProgress(item)) appxSetStatusProgressText(item.data);

                if (appxIsStatusMode(item)) modeFound = true;
            }

            i++;

        } //end appxNullOk();
        if (item.widget.wPositionX !== null) {
            $itemhtml.data("row", item.widget.wPositionY);
            $itemhtml.data("col", item.widget.wPositionX);
        } else {
            $itemhtml.data("row", item.pos_row);
            $itemhtml.data("col", item.pos_col);
        }
        if ((item.special & 0x30) == 0x30) {
            $itemhtml.data("unicode", true);
        } else {
            $itemhtml.data("unicode", false);
        }
    }
    catch (ex) {
        console.log("appxitemshandler: " + ex);
        console.log(ex.stack);
    } //end try

    if (modeFound == false) appxSetStatusModeText("");
} // end function appxitemhandler()

function appxIsMasked(item) {
    return ((item.options & FLD_OPT_MASK) != 0);
}

function appxIsUline(item) {
    return ((item.special & FLD_SPEC_ULINE) != 0);
}

function appxIsModifiable(item) {
    return ((item.special & FLD_SPEC_MOD) == FLD_SPEC_MOD);
}

function appxIsModifiableCapable(item) {
    return ((item.special & FLD_SPEC_MOD_ABLE) == FLD_SPEC_MOD_ABLE);
}

function appxSetModifiableCapable(item, val) {
    if (val == true)
        item.special |= FLD_SPEC_MOD_ABLE;
    else
        item.special &= ~FLD_SPEC_MOD_ABLE;
}

function appxIsDLUonTabOut(item) {
    return (appxIsModifiable(item) && appxIsScannable(item) && ((item.special & FLD_SPEC_DLU_TABOUT) != 0));
}
function appxIsScannable(item) {
    return (appxIsModifiable(item) && ((item.options & FLD_OPT_SCAN) != 0));
}

function appxIsStatus(item) {
    return ((item.options & FLD_OPT_STAT_BITS) != 0);
}

function appxIsStatusDb(item) {
    return ((item.options & FLD_OPT_STAT_BITS) == FLD_OPT_STAT_DB);
}

function appxIsStatusAp(item) {
    return ((item.options & FLD_OPT_STAT_BITS) == FLD_OPT_STAT_AP);
}

function appxIsStatusVer(item) {
    return ((item.options & FLD_OPT_STAT_BITS) == FLD_OPT_STAT_VER);
}

function appxIsStatusUser(item) {
    return ((item.options & FLD_OPT_STAT_BITS) == FLD_OPT_STAT_USER);
}

function appxIsStatusKeymap(item) {
    return ((item.options & FLD_OPT_STAT_BITS) == FLD_OPT_STAT_KEYMAP);
}

function appxIsStatusMsg(item) {
    return ((item.options & FLD_OPT_STAT_BITS) == FLD_OPT_STAT_MSG);
}

function appxIsStatusMode(item) {
    return ((item.options & FLD_OPT_STAT_BITS) == FLD_OPT_STAT_MODE);
}

function appxIsStatusEmbld(item) {
    return ((item.options & FLD_OPT_STAT_BITS) == FLD_OPT_STAT_EMBLD);
}

function appxIsStatusProgress(item) {
    return ((item.options & FLD_OPT_STAT_BITS) == FLD_OPT_STAT_PROGRESS);
}

function appxIsDate(item) {
    return (item.type == ELEM_ALP_JUL_DATE ||
        item.type == ELEM_ALP_GREG_DATE ||
        item.type == ELEM_BIN_JUL_DATE ||
        item.type == ELEM_BIN_GREG_DATE ||
        item.type == ELEM_PD_JUL_DATE ||
        item.type == ELEM_PD_GREG_DATE ||
        item.type == ELEM_UNIVERSAL_DATE);
}

function appxIsToken(item) {
    return ((item.special & FLD_SPEC_TOKEN) == FLD_SPEC_TOKEN);
}

function appxIsWordWrap(item) {
    return ((item.special & FLD_SPEC_WORD_WRAP) == FLD_SPEC_WORD_WRAP);
}

function appxIsUppercase(item) {
    return ((item.options & FLD_OPT_UCASE) != 0);
}

function appxIsNullOk(item) {
    return ((item.options & FLD_OPT_NULLOK) != 0);
}

function parseItemDateData(i) {
    try {
        var maskstr = i.itemdata[1][0].replace(/\_/g, "*");

        for (var z = 0; z < i.itemdata[1][0].length; z++) {
            if (i.itemdata[1][0][z] == "X") {
                maskstr = maskstr.replace(maskstr[z], i.itemdata[0][0][z]);
            }
        }

        var pickstr = "";
        var datemsk = "";
        var timemsk = "";
        var part = "";
        var hasDate = true;

        for (var z = 0;
            (z * 2) < i.itemdata[2][0].length; z++) {
            part = i.itemdata[2][0].substring(z * 2, (z * 2) + 2);

            if (part != "--") {
                switch (z) {
                    case 0: // Century
                        pickstr += part;
                        datemsk += "yy";
                        break;
                    case 1: // Year
                        pickstr += part;
                        if (datemsk.length == 0) // If there is no century then we add the mask for year only
                            datemsk += "y";
                        break;
                    case 2: // Month
                        pickstr += part;
                        datemsk += "mm";
                        break;
                    case 3: // Day
                        pickstr += part;
                        datemsk += "dd";
                        break;
                    case 4: // Hour
                        if (datemsk.length > 0) // If there is a date part then we add a space separator to the string
                            pickstr += " ";
                        pickstr += part;
                        timemsk += "HH";
                        break;
                    case 5: // Minute
                        if (timemsk.length > 0) { // If there are hours we add the colon separator
                            pickstr += ":";
                            timemsk += ":";
                        }
                        pickstr += part;
                        timemsk += "mm";
                        break;
                    case 6: // Second
                        if (timemsk.length > 0) { // If the are minutes we add the colon separator
                            pickstr += ":";
                            timemsk += ":";
                        }
                        pickstr += part;
                        timemsk += "ss";
                        break;
                    case 7: // Thousands
                        if (timemsk.length > 0) { // If there are seconds we add the period separator
                            pickstr += ".";
                            timemsk += ".";
                        }
                        pickstr += part + "0"; // Appx does thousands, not milliseconds so we add the third digit
                        timemsk += "l";
                        break;
                }
            }
        }
        if (datemsk == "") {
            hasDate = false;
        }
        var pickval = '{"value":"' + pickstr + '","datemsk":"' + datemsk + '","timemsk":"' + timemsk + '"}';
        var dv = $("<input class='appxdatevalue appxitem' type='text' style='width: 100%; height: 100%'>");
        var df = $("<input class='appxdatepicker' type='hidden'>").val(pickval);

        dv.inputmask(maskstr, { insertMode: false });
        dv.val(i.itemdata[0]);
    } catch (ex) {
        console.log("parseItemDateData: " + ex);
        console.log(ex.stack);
    }

    return {
        "data": i.itemdata[0][0],
        "hasDate": hasDate,
        "df": df,
        "dv": dv
    };
}

function parseItemLongData(itemdata) {
    // Convert buffer to string
    var newarray = [];
    try {
        newarray.push(91); // [
        newarray.push(34); // "
        for (var i = 0; i < itemdata.length; i++) {
            if (itemdata[i] == 0x02 || itemdata[i] == 0x01) {
                if (itemdata[i] == 0x02) {
                    newarray.push(34); // "
                    newarray.push(44); // ,
                    newarray.push(34); // "
                }
                if (itemdata[i] == 0x01) {
                    newarray.push(34); // "
                    newarray.push(93); // ]
                    newarray.push(44); // ,
                    newarray.push(91); // [
                    newarray.push(34); // "
                }
            }
            else {
                if (itemdata[i] === 0) {
                    newarray.push(32); //replace null with space
                } else if (itemdata[i] === 0x22) {
                    newarray.push(92); //escape double quotes
                    newarray.push(itemdata[i]);
                } else {
                    newarray.push(itemdata[i]);
                }
            }
        }
        newarray.push(34); // "
        newarray.push(93); // ]
        return JSON.parse('{"itemdata": [' + (ab2str(newarray)).replace(/\n/g, "\\\\n").replace(/\r/g, "\\\\r") + ']}');
    }
    catch (ex) {
        console.log("parseItemLongData: " + ex);
        console.log("parseItemLongData: data=" + newarray);
        console.log(ex.stack);
        newarray = [91, 34, 34, 93];
        return JSON.parse('{"itemdata": [' + ab2str(newarray) + ']}');
    }

}

var FLD_OPT_NULLOK = 0x01;
var FLD_OPT_UCASE = 0x02;
var FLD_OPT_MASK = 0x04;
var FLD_OPT_SCAN = 0x08;

var FLD_OPT_STAT_BITS = 0xF0;
var FLD_OPT_STAT_DB = 0x10;
var FLD_OPT_STAT_AP = 0x20;
var FLD_OPT_STAT_VER = 0x30;
var FLD_OPT_STAT_USER = 0x40;
var FLD_OPT_STAT_DATE = 0x50;
var FLD_OPT_STAT_KEYMAP = 0x60;
var FLD_OPT_STAT_MSG = 0x70;
var FLD_OPT_STAT_MODE = 0x80;
var FLD_OPT_STAT_EMBLD = 0x90;
var FLD_OPT_STAT_PROGRESS = 0xA0;

//MFld
//var FLD_SPEC_NONE       = 0x00;
//var FLD_SPEC_PICTURE    = 0x01;
var FLD_SPEC_TOKEN = 0x02;
var FLD_SPEC_WORD_WRAP = 0x04;
var FLD_SPEC_MOD_ABLE = 0x08;
var FLD_SPEC_ULINE = 0x08;
//var FLD_SPEC_ENCODING   = 0x30;
var FLD_SPEC_DLU_TABOUT = 0x40;
var FLD_SPEC_MOD = 0x80;

var ELEM_NONE = 0;
var ELEM_ALP_CONTIG = 1;
var ELEM_ALP_NON_CONTIG = 2;
var ELEM_ALP_JUL_DATE = 3;
var ELEM_ALP_GREG_DATE = 4;
var ELEM_BIN = 5;
var ELEM_BIN_JUL_DATE = 6;
var ELEM_BIN_GREG_DATE = 7;
var ELEM_PD_FIX = 8;
var ELEM_PD_JUL_DATE = 9;
var ELEM_PD_GREG_DATE = 10;
var ELEM_LOG = 11;
var ELEM_PD_VAR = 12;
var ELEM_ALP_SUBSTR = 13;
var ELEM_ALP_CMPRS = 14;
var ELEM_UNIVERSAL_DATE = 15;
