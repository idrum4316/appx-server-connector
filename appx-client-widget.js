/*********************************************************************
 **
 **   server/appx-client-widget.js - Client Widget processing
 **
 **   This module contains code to process Appx Widget screen elements.
 **
 *********************************************************************/

// what_str =  "@(#)Appx $Header$";

//Need to Remove the default styles and set CUSTOM.css - !!!

"use strict";

function sanitizeText( text, itemspec ) {
// itemspec: If true,  then will always be subject to HTML
//           If false, then will never be subject to HTML
//           If null,  then will defer to item content, looking for <html> prefix
    if (text == null) 
        return text;
    var div = $("<div>");
    if( itemspec ) {
        return text;
    } else if( itemspec == null ) {
        if( text.substring(0,6).toLowerCase().startsWith( "<html>" ) ) {
            return text;
        } else {
            return div.text(text).html();
        }
    } else {
        return div.text(text).html();
    }
}

function addClientId(appxId, clientId) {
    if (clientId && clientId != appxId) {
        appx_session.clientIds[appxId] = clientId;
        appx_session.clientIds[clientId] = appxId;
    }
    else {
        appx_session.clientIds[appxId] = appxId;
    }
    return appx_session.clientIds[appxId];
}

function getClientId(appxId) {
    return appx_session.clientIds[appxId];
}

function clearClientIds() {
    appx_session.clientIds = {};
}

//prevent default browser behavior on drops (e.g. navigating to contents)
function eventCatcher(e) {
    e = e || e.originalEvent || window.event;
    if (e.preventDefault) e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
    return false;
}
window.ondragover = function window_ondragover(e) {
    return eventCatcher(e);
};
window.ondrop = function window_ondrop(e) {
    return eventCatcher(e);
};


// this function is bound to a widget button's click event at the time the widget is created
function appxwidgetcallback2(option) {
    if (appx_session.mouseX) {
        var row = Math.floor(appx_session.mouseY / appx_session.rowHeightPx);
        var col = Math.floor(appx_session.mouseX / appx_session.colWidthPx);
        appxPutCursor(col, row);
    }
    appxwidgetcallback(option);
}

function appxwidgetcallback(option) {
    /*If listbox still active dont allow processing of callbacks*/
    if (appx_session.objFocus !== null) {
        return;
    }
    if (option === 274 || option === 330 || option === 304) {
        appx_session.scan = false;
        appxClearScanCursor();
    }
    /*if option is supposed to be handled by the client then change client
    **preferences and reset option to just redraw screen*/
    appx_session.lastOption = option;
    if ($(".appxtablewidget").length > 0 && $(".appxtablewidget").data("action").command === option) {
        appx_session.rowCallback = true;
    }

    /*New option override code*/
    if (typeof appx_session.optionOverride[option] === "function") {
        var exit = appx_session.optionOverride[option]();
        if (exit) {
            return;
        }
    }

    logca("appxwidgetcallback: " + option);

    //check if the html editors didn't go over the max character limit
    for (var editor in CKEDITOR.instances) {
        var $cke = $("#cke_" + editor);
        var maxLength = $("#" + editor).attr("maxLength");
        if(CKEDITOR.instances[editor].getData().length > maxLength){
            //show error message
            appxSetStatusText("Error - Html Editor has more characters than the maximum allowed characters", 2);
            return;
        }
        
    }

    for (var editor in CKEDITOR.instances) {
        var $cke = $("#cke_" + editor);
        $cke.val(CKEDITOR.instances[editor].getData());
        if (CKEDITOR.instances[editor].checkDirty()) {
            $cke.addClass("appxitem dirty");
            $cke.attr("id", editor);
        }
    };

    var data = [];
    $("#appx_main_container").focus();
    $(".dirty").each(function funcItemDirtyEach() {
            data.push(this);
    });
    if (appx_session.processhelp == true) {
        appx_session.processhelpoption = option;
        option = OPT_HELP_OPT;
    }

    sendappxshow(option, data);
}

function appxwidgetdimensions(wori, $tag, box) { //Widget or Item
    try {
        var x = 0,
            y = 0,
            w = 0,
            h = 0;
        var wx = wori, wt;
        var colW = appx_session.colWidthPx;
        var rowH = appx_session.rowHeightPx;
        var rowP, colP;

        if (wx.hasOwnProperty("widget")) {
            wt = wx.widget.wWidgetType;
        } else {
            wt = wx.wWidgetType;
        }
        if (box) { //translate items to box coordinates too
            x = box.begin_column - 1;
            y = box.begin_row;
            if (!appxIsScrollReg(box)) y--;
        }

        if (!wx.hasOwnProperty("wWidgetId")) { //Item
            if (wori.hasOwnProperty("widget") && wori.widget != null && wori.widget.wPositionX != null) {
                wx = wori.widget;
                if (wt != WIDGET_TYPE_PROGRESS_BAR && wt != WIDGET_TYPE_SLIDER) {
                    if (!wx.wSizeW) {
                        wx.wSizeW = wori.size_col || wori.size_cols; //sometimes 0
                    }
                    if (!wx.wSizeH) {
                        wx.wSizeH = wori.size_row || wori.size_rows;
                    }
                }
            }
            else {
                x = wx.pos_col * colW;
                y = wx.pos_row * rowH;
                w = (wx.size_cols || wx.size_col) * colW;
                h = (wx.size_rows || wx.size_row) * rowH;
            }
        }

        //widget positioning is relative to the parent box (appxshowhandler)
        if (wx.hasOwnProperty("wWidgetId")) { //instanceof Widget
            var offX = 0,
                offY = 0,
                offW = 0,
                offH = 0;

            // The java client truncates, not rounds, the double NOT (~~) is
            // a fast and negative value safe way to truncation a float to an int.
            if (wx.wOffsetX) offX = ~~((wx.wOffsetX * colW) / 100);
            if (wx.wOffsetY) offY = ~~((wx.wOffsetY * rowH) / 100);
            if (wx.wOffsetW) offW = ~~((wx.wOffsetW * colW) / 100);
            if (wx.wOffsetH) offH = ~~((wx.wOffsetH * rowH) / 100);

            if (wx.wPositionX != null) {
                x = (wx.wPositionX ? ((wx.wPositionX - x) * colW) + offX : 0);
                y = (wx.wPositionY ? ((wx.wPositionY - y) * rowH) + offY : 0);
                w = (wx.wSizeW ? (wx.wSizeW * colW) + offW : 0);
                h = (wx.wSizeH ? (wx.wSizeH * rowH) + offH : 0);
            }
        }


        if ($tag) {
            /*Adjust items that are positioned inside scroll regions to be placed
             **correctly.*/
            rowP = wori.pos_row;
            colP = wori.pos_col
            var top = parseInt($tag.css("top").substring(0, $tag.css("top").indexOf("p")));

            if (box && (appxIsScrollReg(box) || appxIsScroll(box))) {
                var tempTop = ((rowP - box.begin_row) * appx_session.rowHeightPx);
                var tempLeft = ((colP - box.begin_column) * appx_session.colWidthPx);
                y = tempTop;
                x = tempLeft;
                //apply micro adjustments
                if (wx.hasOwnProperty("wWidgetId")) { //instanceof Widget
                    // The java client truncates, not rounds, the double NOT (~~) is
                    // a fast and negative value safe way to truncation a float to an int.
                    if (wx.wOffsetX)
                        x += ~~((wx.wOffsetX * appx_session.colWidthPx ) / 100);
                    if (wx.wOffsetY)
                        y += ~~((wx.wOffsetY * appx_session.rowHeightPx) / 100);
                }
            }

            $tag.css({
                "position": "absolute",
                "left": x,
                "top": y
            });
            /*Lines can have h or w of 0*/
            if ((wt !== WIDGET_TYPE_LINE) && (h === 0 || w === 0)) {
                $tag.hide();
            }

            if (wt == WIDGET_TYPE_HTML_VIEWER) {
                h -= 2;
            }
            $tag.css("height", h);
            if (wt != WIDGET_TYPE_CHECK_BOX) {
                // The java client adds an extra 5 pixel to the widget of input fields
                // to make room for the decorations
                if (wt != WIDGET_TYPE_TABLE && wt != WIDGET_TYPE_BOX && wt != WIDGET_TYPE_BUTTON && wt != WIDGET_TYPE_LABEL && wt != WIDGET_TYPE_PICTURE && wt != WIDGET_TYPE_LISTBOX) {
                    w += 5;
                }
                /* html client changes the listbox to row text in inquire mode. If the original type was token,
                 we still want to add extra padding for consistency */
                if (wt == WIDGET_TYPE_LISTBOX || wx.wWidgetOriginalType == WIDGET_TYPE_LISTBOX) {
                    var pad = colW * 3.96; //Added width to accomodate drop down arrow
                    $tag.attr("data-padWidth", pad);//Attach added width to data tag
                    w += pad;
                    //if the type is raw-text remove extra 5 px that we added to the widget width
                    if (wt == WIDGET_TYPE_RAW_TEXT && wx.wWidgetOriginalType == WIDGET_TYPE_LISTBOX) {
                        w -= 5;
                    }
                }
                if ($tag.hasClass("button") && $tag.hasClass("error")) {
                    w = 315;
                }
                $tag.css("width", w);
            }
            if (wt == WIDGET_TYPE_BOX) {
                if (wx.wLabel && wx.wLabel.length > 0) {
                    $tag.css({
                        "width": w - (2 * colW) - 2 + 14,
                        "height": h - rowH + 5 + 14,
                        "left": x + 2
                    });
                }
                else {
                    $tag.css({
                        "width": w - (2 * colW) + 2 + 14,
                        "height": h - rowH + 5 + 2 + 14
                    });
                }
            }
            if ($tag.hasClass("defaultBorder") && $tag.is("button") && wx.wBorder != BORDER_NONE) {
                $tag.css({
                    "top": (dim.y + 1),
                    "left": (dim.x + 1),
                    "height": (dim.h - 2),
                    "width": (dim.w - 2)
                });
            }
        }
    }
    catch (ex) {
        console.log("appxwidgetdimensions: " + ex);
        console.log(ex.stack);
    }
    return {
        "x": x,
        "y": y,
        "w": w,
        "h": h,
        "cw": colW,
        "rh": rowH
    };
}

//Widgets Message Handler
//Display.addField(MFld)
function appxwidgetshandler(x) {
    var wdgts = x.data;
    var i = 1;
    var defaultButtonSet = false;
    while (wdgts.length > 0) {
        var wdata = wdgts.shift();
        var wx = new Widget(wdata[0], "", wdata[1], wdata[2], wdata[3]);
        var wt = parseInt(wx.wWidgetType);
        //console.log("widget row=%d, col=%d label=%s, box=%d %s",wx.wPositionY,wx.wPositionX,wx.wLabel,wdata[0],ab2str(wdata[1]));


                wx.wLabel = sanitizeText( wx.wLabel, null );

        if (wx.wDefaultButton) {
            if (defaultButtonSet)
                wx.wDefaultButton = null;
            else
                defaultButtonSet = true;
        }

        if (wt == WIDGET_TYPE_ROWTEXT) {
            var rowtxt = new RowTextStruct();
            rowtxt.type = ROWTEXT_TYPE_WIDGET;
            rowtxt.boxid = wdata[0];
            rowtxt.isTitle = wx.wInvert;
            rowtxt.pos_row = wx.wPositionY;
            rowtxt.pos_col = wx.wPositionX;
            rowtxt.size_rows = wx.wSizeH;
            rowtxt.size_cols = wx.wSizeW;
            rowtxt.string = wx.wLabel;
            appx_session.rowtext.push(rowtxt);
            continue;
        }
        var $tag = null;
        /*New widget creation code*/
        if (typeof appx_session.createWidgetTag[wt] !== "function") {
            var widgetObj = appx_session.createWidgetTag["default"](wx, $tag);
            $tag = widgetObj.tag;
            wx = widgetObj.widget;
            wt = wx.wWidgetType;
        } else {
            $tag = appx_session.createWidgetTag[wt](wx, $tag);
        }
        /*End New widget creation code*/

        $tag.data("row", wx.wPositionY);
        $tag.data("col", wx.wPositionX);
        $tag.data("parent_type", WIDGET_PRNT_TYPE_WIDGET);
        if ($tag != null) {
            appxwidgetdimensions(wx, $tag);
            appxwidgetshandlerprops(wx, $tag);
            $tag.addClass("appxwidget");

            $tag.css("z-index", (1000 + (wx.wLayer * -1)));
            appx_session.widgets.push([wx, $tag]);
        }

        i++;
    } //end while widgets
}

/**
 * This routine converts table column widget data to a widget object and a html tag
 * @param {*} wdata 
 * @return {tag:Htmltag, widget: Widget-object}
 */
function appxTableColumnWidgetHandler(wdata) {
    var wx = new Widget(0, "", wdata, null, null);
    var wt = parseInt(wx.wWidgetType);
    wx.wLabel = sanitizeText( wx.wLabel, null );
    var $tag = null;
    /*New widget creation code*/
    if (typeof appx_session.createWidgetTag[wt] !== "function") {
        var widgetObj = appx_session.createWidgetTag["default"](wx, $tag);
        $tag = widgetObj.tag;
        wx = widgetObj.widget;
        wt = wx.wWidgetType;
    } else {
        $tag = appx_session.createWidgetTag[wt](wx, $tag);
    }
    /*End New widget creation code*/

    $tag.data("parent_type", WIDGET_PRNT_TYPE_WIDGET);
    if ($tag != null) {
        wx.wPositionX = 1;
        wx.wPositionY = 1;
        appxwidgetdimensions(wx, $tag);
    }
    return({"tag":$tag, "widget":wx});
}
/**
 * This routine converts table row widget data to a widget object 
 * @param {*} wdata 
 * @return {Widget} Widget-object
 */
function appxTableRowWidgetHandler(wdata) {
    return(new Widget(0, "", wdata, null, null));
}
/**
 * This fuction applies style attributes based on the given 
 * widget object to the given table column tag
 * @param {Widget} widget object 
 * @param {*} jquey tag of the table column 
 */
function appxTableApplyColumnStyle(wx, $tag){
    //set the bg color on parent so it includes the separator tag as well
    if (wx.wColorBg) {
        $tag.parent().css("background", wx.wColorBg);
    }
    if (wx.wColorBgNL) {
        $tag.parent().css("opacity", wx.wColorBgNL);
    }
    //<rollover>
    if (wx.wColorBgRollover || wx.wColorBgRolloverNL ||
            wx.wColorFgRollover || wx.wColorFgRolloverNL ||
            wx.wIconRollover) 
    { //hover
        if (wx.wIconRollover) {
            $tag.addClass(AppxResource.load(wx.wIconRollover) + "_imgRO");
            var iconRollover = function iconRollover() {
                var src = $img.attr("src"),
                    srcRO = $tag.attr("srcRO");
                if (src != undefined && srcRO != undefined) {
                    $tag.attr("srcRO", src);
                    $img.attr("src", srcRO);
                }
            };
        }
        $tag.mouseenter(function $_mouseenter() {
            if (wx.wColorBgRollover)
                $tag.parent().css("background", wx.wColorBgRollover);
            if (wx.wColorBgRolloverNL)
                $tag.parent().css("opacity", wx.wColorBgRolloverNL);
            if (wx.wColorFgRollover)
                $tag.css("color", wx.wColorFgRollover);
            if (wx.wColorFgRolloverNL)
                $tag.css("opacity", wx.wColorFgRolloverNL);
            if (wx.wIconRollover)
                iconRollover();
        }).mouseleave(function $_mouseleave() {
            //container
            if (wx.wColorBgRollover)
                $tag.parent().css("background", (wx.wColorBg ? wx.wColorBg : ""));
            if (wx.wColorBgRolloverNL)
                $tag.parent().css("opacity", (wx.wColorBgNL ? wx.wColorBgNL : 1.0));
            //labeltext
            if (wx.wColorFgRollover)
                $tag.css("color", (wx.wColorFg ? wx.wColorFg : ""));
            if (wx.wColorFgRolloverNL)
                $tag.css("opacity", (wx.wColorFgNL ? wx.wColorFgNL : 1.0));
            if (wx.wIconRollover)
                iconRollover();
        });
    }
    //</rollover>
    if (wx.wColorFg) {
        $tag.css("color", wx.wColorFg);
        if (wx.wColorFgNL) $tag.css("opacity", wx.wColorFgNL);
    }
    //<font>
    if (wx.wFont) {
        //Remove the default font and set CUSTOM.css
        var ff = null;
        switch (wx.wFont) {
            case "helvetica": ff = (bInput ? "default-input" : "default"); break;
            case "Courier": ff = "courier"; break;
            case "Helvetica": ff = "arial"; break;
            case "TimesRoman": ff = "times-roman"; break;
            case "Dialog": ff = "fixed-sys"; break;
            case "DialogInput": ff = "terminal"; break;
            case "ZapfDingbats": ff = "wingdings"; break;
            case "SanSerif": ff = "ms-sans-serif"; break;
            case "Serif": ff = "ms-serif"; break;
            case "Monospaced": ff = "fixed-sys"; break;
        }
        if (ff != null)
            $tag.addClass("appx-font-" + ff);
        else
            $tag.css("font-family", wx.wFont);
    }
    if (wx.wFontSize) {
        $tag.css("font-size", wx.wFontSize);
        $tag.addClass("appx-fontsize-adjusted");
    }
    if (wx.wFontStyle) {
        switch (wx.wFontStyle) {
            case "bold":
                $tag.css("font-weight", "bold");
                break;
            case "italic":
                $tag.css("font-style", "italic");
                break;
            case "bolditalic":
                $tag.css({
                    "font-weight": "bold",
                    "font-style": "italic"
                });
                break;
        }
    }// </font>
    //alignment 
    if (wx.wSetHorizAlign){
        switch (wx.wSetHorizAlign) {
            case 'LEFT':
                $tag.css({ "text-align" : "left" });
                break;
            case 'RIGHT':
                $tag.css({ "text-align" : "right" });
                break;
            case 'CENTER':
                $tag.css({ "text-align" : "center" });
                break;
            default: //null,''
                break;
        }
    }
    //FIXME: This currently doesn't work
    if (wx.wSetVertAlign) {
        switch (wx.wSetVertAlign) {
            case 'BOTTOM':
                $tag.css({ "vertical-align" : "bottom" });
                break;
            case 'TOP':
                $tag.css({ "vertical-align" : "top" });
                break;
            default: //null,'','CENTER'
            $tag.css({ "vertical-align" : "middle" });
                break;
        }
    }

    if (wx.wTooltip && navigator.userAgent.indexOf("Mobile") === -1) {
        $tag.data('title', wx.wTooltip); // <-- does not support HTML tags in tooltip
        $tag.addClass("appx-tooltip");
        $tag.tooltip({
            fade: 250,
            show: { delay: 600 },
            hide: { delay: 200 },
            open: function $_tooltip_open(event, ui) {
                setTimeout(function setTimeoutCallback() {
                    $(ui.tooltip).hide('fade');
                }, 3000);
            },
            items: ".appx-tooltip",
            content: function $_tooltip_content() {
                return $(this).data('title');
            }
        }).on("focusin", function $_onFocusin() {
            $(this).tooltip("close");
        });
    }

}

/**
 * This fuction create cell attributes based on the given 
 * widget object to be added to each cell on the table
 * @param {Widget} widget object 
 * @return {*} Object jquey tag of the table column 
 */
function appxTableCreateCellAttribute(wx, isSelected){

    var styleAttr = {};
    var classes = {};
    var otherAttr = "";
    var cellAttr = "";
    var bgColor = null;
    var fgColor = null;
    var altBgColor = null;
    var altFgColor = null;
    if(wx == null){
        return styleAttr;
    }
    //add classes
    if(wx.wClasses){
        for(cls in wx.wClasses.split(" ")){
            if(cls.trim().length > 0){
                classes[cls.trim()] = 1;
            }
        }          
    }
    //set the bg color  
    if (wx.wColorBg) {
        bgColor =  wx.wColorBg;
        if (wx.wColorBgNL) {
            bgColor +=  (wx.wColorBgNL * 255).toString(16);
        }
        otherAttr += ' bgColor="'+bgColor+'"';
    }
    if(wx.wAltColorBg){
        altBgColor =  wx.wAltColorBg;
        otherAttr += ' altBgColor="'+altBgColor+'"';
    }
    //if the row is selected and we have alternate bg color, use alternate bg color for background
    if(altBgColor != null && isSelected == true){
            styleAttr["background-color"] =  altBgColor;
            classes["appx-bgcolor-adjusted"] = 1;
    }
    else if(bgColor != null){
        styleAttr["background-color"] = bgColor;
        classes["appx-bgcolor-adjusted"] = 1;
    }
    //font color
    //set the bg color  
    if (wx.wColorFg) {
        fgColor =  wx.wColorFg;
        if (wx.wColorFgNL) {
            fgColor +=  (wx.wColorFgNL * 255).toString(16);
        }
        otherAttr += ' fgColor="'+fgColor+'"';
    }
    if(wx.wAltColorFg){
        altFgColor =  wx.wAltColorFg;
        otherAttr += ' altFgColor="'+altFgColor+'"';
    }
    //if the row is selected and we have alternate font color, use alternate color for font color
    if(altFgColor != null && isSelected == true){
            styleAttr["color"] =  altFgColor;
            classes["appx-fgcolor-adjusted"] = 1;
    }
    else if(fgColor != null){
        styleAttr["color"] = fgColor;
        classes["appx-fgcolor-adjusted"] = 1;
    }
    //<font>
    if (wx.wFont) {
        //Remove the default font and set CUSTOM.css
        var ff = null;
        switch (wx.wFont) {
            case "helvetica": ff = "default"; break;
            case "Courier": ff = "courier"; break;
            case "Helvetica": ff = "arial"; break;
            case "TimesRoman": ff = "times-roman"; break;
            case "Dialog": ff = "fixed-sys"; break;
            case "DialogInput": ff = "terminal"; break;
            case "ZapfDingbats": ff = "wingdings"; break;
            case "SanSerif": ff = "ms-sans-serif"; break;
            case "Serif": ff = "ms-serif"; break;
            case "Monospaced": ff = "fixed-sys"; break;
        }
        if (ff != null){
            classes["appx-font-" + ff] = 1;
        }
        else{
            styleAttr["font-family"] = wx.wFont;
        }
        classes["appx-font-adjusted"] = 1;
    }
    if (wx.wFontSize) {
        styleAttr["font-size"] = wx.wFontSize+"px";
        classes["appx-fontsize-adjusted"] = 1;
    }
    if (wx.wFontStyle) {
        classes["appx-fontstyle-adjusted"] = 1;
        switch (wx.wFontStyle) {
            case "bold":
                styleAttr["font-weight"] = "bold";
                break;
            case "italic":
                styleAttr["font-style"] = "italic";
                break;
            case "bolditalic":
                styleAttr["font-style"] = "italic";
                styleAttr["font-weight"] = "bold";
                break;
        }
    }// </font>
    //alignment 
    if (wx.wSetHorizAlign){
        switch (wx.wSetHorizAlign) {
            case 'LEFT':
                styleAttr["text-align"] = "left";
                break;
            case 'RIGHT':
                styleAttr["text-align"] = "right";
                break;
            case 'CENTER':
                styleAttr["text-align"] = "center";
                break;
            default: //null,''
                break;
        }
        classes["appx-textalign-adjusted"] = 1;
    }
    //FIXME: This currently doesn't work
    if (wx.wSetVertAlign) {
        switch (wx.wSetVertAlign) {
            case 'BOTTOM':
                styleAttr["vertical-align"] = "bottom";
                break;
            case 'TOP':
                styleAttr["vertical-align"] = "top";
                break;
            default: //null,'','CENTER'
                styleAttr["vertical-align"] = "middle";    
        }
        classes["appx-valign-adjusted"] = 1;
    }
    //Tooltip
    if (wx.wTooltip && navigator.userAgent.indexOf("Mobile") === -1) {
        otherAttr += ' title="'+ wx.wTooltip + '"'; // <-- does not support HTML tags in tooltip
        classes["appx-tooltip"] = 1;
    }

    /* add style, classes, and other attribites in a string field and eturn */
    cellAttr = otherAttr;
    if( Object.keys(styleAttr).length > 0){
        var key = "";
        cellAttr += ' style="';
        for(key in styleAttr){
            cellAttr += key+":"+styleAttr[key]+"; ";
        }
        cellAttr += '"'
    } 
    if(Object.keys(classes).length > 0){
        cellAttr += ' class="';
        var className = "";
        for(className in classes){
            cellAttr += " "+className;
        }
        cellAttr += '"';
    }
    return cellAttr;
}

/*
**Function to attach blur event to HTML element if we have there is lost
**focus event, DLU event, or both attached to the item or widget being
**processed
**
**@param $tag: HTML element to append blur function to.
**@param mCmd: command to send to appx engine on blur
**
*/
function appxAttachBlur($tag, mCmd) {
    if ($tag.find(".appxdatevalue").length > 0) {
        $tag = $tag.find(".appxdatevalue");
    }
    $tag.blur(function $_blur() {
        if (mCmd === "block") {
            if (appxIsLocked()) {
                $(this).focus();
            }
        } else {
            appx_session.blur = true;
            if (appx_session.activeDatepicker == null && !appxIsLocked()) {
                appx_session.valueTimerStop(); //CA: key pause
                appxPutTabOut();
                logca("wx.blur");

                //without timeout tab can switch back to the current field and
                //make it hard to end the function
                setTimeout(function setTimeoutCallback(cmd) {
                    logca("CommandLostFocus to: " + cmd);
                    if (!appxIsLocked() && !appx_session.scan) {
                        appxwidgetcallback(cmd);
                    }
                    else logca("(locked)");
                }, 100, mCmd);
            }
            else {
                logca("wx.blur: locked");
            }
        }
    });
}

function appxwidgetshandlerprops(wori, $tag) {
    appxwidgetshandlerpropsex(wori, $tag, false);
}

function appxwidgetshandlerpropsex(wori, $tag, bTitlebar) {
    var wx = wori;
    var isWidget = true;
    if (wori.hasOwnProperty("widget")) { //Item
        if (wori.widget != null) {
            wx = wori.widget;
            isWidget = false;
        }
        else {
            if ($tag && appxIsDLUonTabOut(wori)) {
                appxAttachBlur($tag, OPT_DLU_ON_TABOUT);
            }
            return;
        }
    }

    if (wx == null || $tag == null) return;

    var wt = parseInt(wx.wWidgetType);
    var bInput = ($tag.is("input") || $tag.is("select") || $tag.is("textarea"));
    if (!bTitlebar) {

        if ($tag.html() && wt != WIDGET_TYPE_DATE_CHOOSER) {
            var itemdata = $tag.html();
 // Bug #4438: need to synth non-modifiable checkmarks, so don't remove html if this is a check box widget
            if (wt != WIDGET_TYPE_CHECK_BOX) {
                $tag.html("");
            }
        }

        switch (wt) {
            case WIDGET_TYPE_LINE:
                if (!wx.wSizeH) wx.wSizeH = wx.size_row;
                if (!wx.wSizeW) wx.wSizeW = wx.size_col;

                var bounds = { "height": wx.wSizeH, "width": wx.wSizeW, "x": wx.wPositionX, "y": wx.wPositionY };
                var offset = { "height": wx.wOffsetH, "width": wx.wOffsetW, "x": wx.wOffsetX, "y": wx.wOffsetY };
                var unitbase = appx_session.rowHeightPx;

                if (wx.wLineUnitBase) {
                    switch (wx.wLineUnitBase.toLowerCase()) {
                        case "w": unitbase = appx_session.colWidthPx; break;
                        case "h": unitbase = appx_session.rowHeightPx; break;
                        default: unitbase = parseInt(wx.wLineUnitBase);
                    }
                }

                var lineweightpct = -1;
                var lineweight = -1.0;
                if (wx.wSetLineWeight) {
                    lineweightpct = wx.wSetLineWeight;
                }
                if (lineweightpct < 0) lineweight = 0.32 * unitbase;
                if (lineweight < 0) lineweight = lineweightpct / 100.0 * unitbase;
                if (lineweight < 1) lineweight = 1.0;
                var lineweightwhole = ~~(lineweight); //~~ removes decimals

                var insets = { "top": lineweightwhole + 1, "left": lineweightwhole + 1, "bottom": lineweightwhole + 1, "right": lineweightwhole + 1 };
                var ow = bounds.width == 1 && offset.width < 0 ? (offset.width * -1) / 100 : offset.width / 100;
                var oh = bounds.height == 1 && offset.height < 0 ? (offset.height * -1) / 100 : offset.height / 100;
                var dim = {
                    "width": (Math.abs(bounds.width) * appx_session.colWidthPx) + (ow * appx_session.colWidthPx) + insets.left + insets.right - appx_session.colWidthPx,
                    "height": (Math.abs(bounds.height) * appx_session.rowHeightPx) + (oh * appx_session.rowHeightPx) + insets.top + insets.bottom - appx_session.rowHeightPx
                };
                var beg = { "x": 0, "y": 0 };
                var end = { "x": 0, "y": 0 };
                beg.x = bounds.width > 0
                    ? bounds.width == 1 && offset.width < 0 ? insets.left - offset.width : insets.left
                    : dim.width - insets.right;
                beg.y = bounds.height > 0
                    ? bounds.height == 1 && offset.height < 0 ? insets.top - offset.height : insets.top
                    : dim.height - insets.bottom;
                end.x = bounds.width > 0
                    ? bounds.width == 1 && offset.width < 0 ? insets.left : dim.width - insets.right
                    : insets.left;
                end.y = bounds.height > 0
                    ? bounds.height == 1 && offset.height < 0 ? insets.top : dim.height - insets.bottom
                    : insets.top;

                var x = bounds.width > 0 ? bounds.x : bounds.x + bounds.width + 1;
                var y = bounds.height > 0 ? bounds.y : bounds.y + bounds.height + 1;
                var ox = bounds.width > 0
                    ? bounds.width == 1 && offset.width < 0 ? offset.x + offset.width : offset.x
                    : offset.x - offset.width;
                var oy = bounds.height > 0
                    ? bounds.height == 1 && offset.height < 0 ? offset.y + offset.height : offset.y
                    : offset.y - offset.height;
                var loc = { "x": (x * appx_session.colWidthPx) + (((ox * appx_session.colWidthPx) / 100) - insets.left), "y": roundAwayFromZero((y * appx_session.rowHeightPx) + (((oy * appx_session.rowHeightPx) / 100) - insets.top)) };

                $tag.css({ "background": "transparent" });

                var $svg = $("<svg>").width("100%").height("100%");
                var $line = $("<line x1=" + beg.x + " y1=" + beg.y + " x2=" + end.x + " y2=" + end.y + " style='stroke: rgb(0,0,0); stroke-width:" + lineweightwhole + "'>");
                $tag.width(dim.width);
                $tag.height(dim.height);
                $tag.css("top", loc.y + "px");
                $tag.css("left", loc.x + "px");

                if (wx.wColorFgDisabled) {
                    $line.css({ "stroke": wx.wColorFgDisabled });
                }

                switch (wx.wEndcapType) {
                    case 2: $line.css({ "stroke-linecap": "square" }); break;
                    case 1: $line.css({ "stroke-linecap": "round" }); break;
                    case 0: $line.css({ "stroke-linecap": "none" }); break;
                    default: $line.css({ "stroke-linecap": "round" }); break;
                }

                if (wx.wStrokePattern) {
                    var adjPattern = wx.wStrokePattern.split(",");
                    var p2 = [];
                    $.each(adjPattern, function $_each(a, b) {
                        p2.push(parseInt(b) * lineweightwhole);
                    });
                    $line.css({ "stroke-dasharray": p2.toString() });
                }

                if (wx.wStrokePatternOffset) {
                    $line.css({ "stroke-dashoffset": wx.wStrokePatternOffset * lineweightwhole });
                }

                $svg.html($line[0].outerHTML);
                $tag.append($svg[0].outerHTML);
                $tag.addClass("line");
                break;
            case WIDGET_TYPE_PICTURE:
                $tag.addClass("picture");
                if (wx.wIconDisabled) {
                    $tag.addClass(AppxResource.load(wx.wIconDisabled) + "_pic");
                } else if (wx.wIconWallpaper) {
                    $tag.addClass(AppxResource.load(wx.wIconWallpaper) + "_pic");
                }
                var clsPic = appxGetClassIcon(wx, bTitlebar);
                $tag.addClass(clsPic);
                var tagCSS = "";
                if (wx.wSetImageScale) {
                    var scale = wx.wSetImageScale + "%";
                    if (wx.wSetImageScale != 100) {
                        tagCSS = scale;
                    } else if ($tag.hasClass("appx-icon-expand-fill")) {
                        tagCSS = "100% 100%";
                    } else {
                        tagCSS = "contain";
                    }
                }
                $tag.css({
                    "background-size": tagCSS,
                    "background-position": wx.wSetHorizAlign + " " + wx.wSetVertAlign
                });
                break;
            case WIDGET_TYPE_SLIDER:
                $tag.css({
                    "height": $tag.height() + 50,
                    "width": $tag.width() + 15
                });
                break;
            case WIDGET_TYPE_PROGRESS_BAR:
                break;
            case WIDGET_TYPE_LISTBOX:
                var opt = wx.wCommand;
                $tag.change(function $_change() {
                    if (opt) {
                        appxwidgetcallback(opt);
                    }
                });
                break;
            case WIDGET_TYPE_CHECK_BOX:
                break;
            case WIDGET_TYPE_PASSWORD:
                $tag.prop("type", "password");
                break;
            case WIDGET_TYPE_FILE_CHOOSER:
                var fulc = wx.fileUseLocalConnector;
                /*Only use local connector code if we tell it to use the local
                **connector*/
                $tag.on('click', function $_onClick(e) {
                    if (fulc) {
                        if (localos_session && localos_session.ws.readyState == 1) {
                            var randclass = "awaiting_filepath";
                            $(this).addClass(randclass);
                            var ms = {
                                cmd: 'file-dialog-nw',
                                args: [],
                                handler: '',
                                data: {
                                    dbg: false, //show devtools, don't close window
                                    wDnD: wx.wDragAndDrop,
                                    wgtid: randclass,
                                    wPosX: wx.wPositionX + 1,
                                    wPosY: wx.wPositionY + 1
                                },
                                authToken: localStorage.authToken
                            };
                            localos_session.ws.send(JSON.stringify(ms));
                            return false;
                        }
                    } else {
                        $("#fileChooser").click();
                    }
                });
                break;
            case WIDGET_TYPE_TABLE:
/* APPXTABLE */
                wx.tableHashKey = AppxTable.updateTableFromWidget( wx );
/*
                if (wx.widgetExtraData.widget_extra_reuse == true) {
                    var tablespecs = appx_session.gridcache[wx.tableHashKey];
                }
                else {
                    var tablespecs = wx.widgetExtraData.widget_extra_data;
                    if (wx.tableShowRowNumbers !== null) {
                        tablespecs.showRowNumbers = wx.tableShowRowNumbers;
                    }
                    if (wx.tableShowFooterBar !== null) {
                        tablespecs.showFooterBar = wx.tableShowFooterBar;
                    }
                    appx_session.gridcache[wx.tableHashKey] = tablespecs;
                    if (appx_session.gridpropscache && appx_session.gridpropscache[wx.tableHashKey]) {
                        var gridprops = appx_session.gridpropscache[wx.tableHashKey];
                                    gridprops.selectedKeys = tablespecs.selectedKeys;
                    }
                    tablespecs.enabled = wx.wEnabled != false;
                }
                appx_session.currenttabledata[getClientId("appxitem_" + wx.wPositionX + "_" + wx.wPositionY)] = tablespecs;
*/
/* APPXTABLE (end) */
                $tag.data("tableHashKey", wx.tableHashKey);
                break;
        }
    }

    if (wx.wBorder) {
        $tag.addClass("appx-border");
        switch (wx.wBorder) {
            case BORDER_NONE:
                $tag.addClass("appx-border-none");
                break;
            case BORDER_BEVEL_RAISED:
                $tag.addClass("appx-border-bevel-raised");
                break;
            case BORDER_SOFT_BEVEL_RAISED:
                $tag.addClass("appx-border-soft-bevel-raised");
                break;
            case BORDER_BEVEL_SUNKEN:
                $tag.addClass("appx-border-bevel-sunken");
                break;
            case BORDER_SOFT_BEVEL_SUNKEN:
                $tag.addClass("appx-border-soft-bevel-sunken");
                break;
            case BORDER_ETCHED_SUNKEN:
                $tag.addClass("appx-border-etched-sunken");
                break;
            case BORDER_ETCHED_RAISED:
                $tag.addClass("appx-border-etched-raised");
                break;
            case BORDER_IMAGE_EDITOR:
                $tag.addClass("appx-border-image-editor");
                break;
            case BORDER_SIMPLE_LINE:
                $tag.addClass("appx-border-simple-line");
                break;
            case BORDER_SIMPLE_LINE_WIDER:
                $tag.addClass("appx-border-simple-line-wider");
                break;
        }
        // because of styling on input[type=text], !important flags are needed on border classes and this inline style
        if (wx.wColorFgDisabled) {
            $tag.attr('style', $tag.attr('style') + ';' + 'border-color:' + wx.wColorFgDisabled + ' !important');
        }
    } else {
        if ($tag.is("fieldset")) {
            $tag.addClass("appx-border-etched-sunken");
        }
        //if html viewer with null border, default the border to bevel sunken to match the java client
        if($tag.is(".appx-html-viewer")){
            $tag.addClass("appx-border appx-border-bevel-sunken");
        }
    }
    if (wx.wColorBgWallpaper && !bTitlebar) {
        if (wt !== WIDGET_TYPE_ERROR) {
            $tag.css("background-color", wx.wColorBgWallpaper);
            if (wx.wColorBgWallpaperNL) $tag.css("opacity", wx.wColorBgWallpaperNL);
        }
        if (wx.wContentAreaFilled !== null && wx.wContentAreaFilled == false) {
            $tag.css("background-color", "transparent");
        }
    }
    else {

        if ((wx.wContentAreaFilled === null && wt === WIDGET_TYPE_LABEL) ||
            (wx.wContentAreaFilled != null && (!wx.wContentAreaFilled) &&
                (!bTitlebar)) && wt !== WIDGET_TYPE_ERROR) {
            wx.wColorBg = "transparent";
        }
        if ($tag.hasClass("appx-title")) {
            if (wx.wColorBg) {
                $tag.css("background-color", wx.wColorBg);
            }
            if (wx.wColorBgNL) {
                $tag.css("opacity", wx.wColorBgNL);
            }
        } else {

            if ($tag.attr("id") && $tag.attr("id").indexOf("box") > -1) {
                if (wx.wColorBgWallpaper) {
                    $tag.css("background-color", wx.wColorBgWallpaper);
                }
                if (wx.wColorBgWallpaperNL) {
                    $tag.css("opacity", wx.wColorBgWallpaperNL);
                }
                if (wx.wContentAreaFilled !== null && wx.wContentAreaFilled == false) {
                    $tag.css("background-color", "transparent");
                }
            } else {
                if (wx.wColorBg) {
                    $tag.css("background-color", wx.wColorBg);
                }
                if (wx.wColorBgNL) {
                    $tag.css("opacity", wx.wColorBgNL);
                }
            }
        }
    }

    if (wx.wColorFg) {
        //only attach foreground color if item hasn't been disabled
        if (!((!bInput) && (wx.wEnabled != null && wx.wEnabled == false) && wx.wColorBgDisabled && wt === WIDGET_TYPE_ERROR)) {
            if (!$tag.hasClass("error")) {
                $tag.css("color", wx.wColorFg);
                if (wx.wColorFgNL) $tag.css("opacity", wx.wColorFgNL);
            }

        }
    }
    if ((!bInput) && (wx.wEnabled != null && wx.wEnabled == false) && wx.wColorBgDisabled) {
        $tag.css("background-color", wx.wColorBgDisabled);
        $tag.css("-webkit-filter", "grayscale(0%)"); //remove grayscale if item has disabled bg color
    }

    if (appx_session.getProp("showOptionNumbers") && wx.wCommand && wx.wCommand < 256) {
        $("<span>").addClass("appx-option").html(wx.wCommand).appendTo($tag);
    }

    if (wx.wCommandGotFocus) {
        if ($tag.find(".appxdatevalue").length > 0) {
            $tag.find(".appxdatevalue").focus(function $_focus() {
                appx_session.valueTimerStop();
                if (!appxIsLocked()) {
                    logca("wx.focus " + wx.wCommandGotFocus);
                    appxwidgetcallback(wx.wCommandGotFocus);
                }
                else {
                    logca("wx.focus: locked");
                }

            });
        } else {
            $tag.focus(function $_focus() { //AppxField.focusGained
                if (appx_session.lastOption && appx_session.lastOption !== "333") {
                    this.selectionStart = this.selectionEnd = this.value.length;
                }
                appx_session.valueTimerStop();
                if (!appxIsLocked() && !appx_session.scan) {
                    logca("wx.focus " + wx.wCommandGotFocus);
                    appxwidgetcallback(wx.wCommandGotFocus);
                }
                else {
                    logca("wx.focus: locked");
                }
            });
        }
    }

    if (wx.wCommand >= 20101 && wx.wCommand <= 20106) {
        appxWidgetCheckSelected(wx);
    }

    if (wx.wLocalList && $tag.is("select")) {
        var delim = wx.wLocalList.charAt(0);
        var st2 = wx.wLocalList.split(delim);
        var arrayLength = st2.length;
        if ($tag.hasClass("appx-nullok"))
            $tag.append("<option></option>");
        for (var i = 1; i < arrayLength; i++) {
            var frag = $('<option></option>').val(st2[i]).html(st2[i]);
            $tag.append(frag);
        }
        $tag.val($tag.attr("data"));
        $tag.addClass("appx-local-list");
    }

    if (wx.wCommandLostFocus || ((!isWidget) && appxIsDLUonTabOut(wori))) {
        if (wx.wCommandLostFocus && ((!isWidget) && appxIsDLUonTabOut(wori))) {
            appxAttachBlur($tag, OPT_DLU_AND_TABOUT);
        } else if (wx.wCommandLostFocus) {
            appxAttachBlur($tag, OPT_TAB_OUT);
        } else if ((!isWidget) && appxIsDLUonTabOut(wori)) {
            appxAttachBlur($tag, OPT_DLU_ON_TABOUT);
        } else {
            appxAttachBlur($tag, "block");
        }
    }

    //bind Enter keydown to default button
    if (wx.wDefaultButton && wt == WIDGET_TYPE_BUTTON) {
        $tag.addClass("default");
        if (wx.wBorder != BORDER_NONE) {
            $tag.addClass("defaultBorder")
        }
    }

    //<dnd>
    if (wx.wDragAndDrop) {
        //click has screenX/Y, drag events don't, nw has position: mouse
        //don't need dragover/leave/drop, processed by nw popup
        $tag.on('dragenter', function $_onDragenter(event) {
            event.dataTransfer = event.originalEvent.dataTransfer;
            /*If using local connector use old code, else use new code that uses
            **browser functionality to handle drag events*/
            if (wx.fileUseLocalConnector === true) {
                if (localos_session && localos_session.ws.readyState == 1) {
                    eventCatcher(event);
                    var ms = {
                        cmd: 'dnd',
                        args: [],
                        handler: '',
                        data: {
                            dbg: false, //show devtools, don't close window
                            wDnD: wx.wDragAndDrop,
                            wPrnt: WIDGET_PRNT_TYPE_WIDGET,
                            wPosX: wx.wPositionX + 1,
                            wPosY: wx.wPositionY + 1,
                        },
                        authToken: localStorage.authToken
                    };
                    localos_session.ws.send(JSON.stringify(ms));
                    return false;
                }
            } else {
                var tagTop = $tag.position().top;
                var tagLeft = $tag.position().left;
                var tagHeight = $tag.height();
                var offsetLeft = $tag.offset().left;
                var mouseLeft = event.pageX;
                var dndWidth = ($tag.width() - (mouseLeft - offsetLeft));
                var $parent = $tag.parent();
                var $fileTag = $tag;
                var $dndDiv;

                /*Create drag and drop div. Currently drag and drop doesn't support
                **directories, but I added a webkitdirectory div in case that
                **browsers support that functionality in the future.*/
                if (wx.wDragAndDrop === "dir") {
                    $dndDiv = $("<div class='DnD' id='DnD' webkitdirectory>");
                } else {
                    $dndDiv = $("<div class='DnD' id='DnD'>");
                }
                $dndDiv.css({
                    "top": ((tagTop - (tagHeight / 2)) + "px"),
                    "left": (tagLeft + "px"),
                    "height": ((tagHeight * 2) + "px"),
                    "width": ($tag.width() + "px"),
                    "border": "2px dashed grey",
                    "position": "absolute",
                    "display": "flex",
                    "text-indent": ((($tag.width() / 2) - 30) + "px"),
                    "color": "grey",
                    "align-items": "center",
                    "z-index": 99999
                }).text("Drop Here").appendTo($parent);

                /*On dragleave remove drag & drop element*/
                $dndDiv.on('dragleave', function $_onDragleave() {
                    $(this).remove();
                });

                /*On drag over change effect to copy instead of move*/
                $dndDiv.on("dragover", function $_onDragover(event) {
                    event.stopPropagation();
                    event.preventDefault();
                    event.dataTransfer = event.originalEvent.dataTransfer;
                    event.dataTransfer.dropEffect = "copy";
                });

                /*On droping files block main screen until upload is finished and
                **setup files to be transferred*/
                $dndDiv.on("drop", function $_onDrop(event) {
                    event.dataTransfer = event.originalEvent.dataTransfer;
                    event.stopPropagation();
                    event.preventDefault();
                    appx_session.dropEvent = event;
                    var length = event.dataTransfer.files.length;
                    if (length >= 1) {
                        /*If more than one file is selected then we change the
                        **value to let the user know that multiple files were
                        **selected in a directory, else we use the file name*/
                        if (length > 1) {
                            $fileTag.val("Directory with " + length + " files.");
                        } else {
                            $fileTag.val(event.dataTransfer.files[0].name.replace(/\ /g, "_"));
                        }
                        $(this).data("#Files", length);
                        $fileTag.addClass("dirty");
                        appxReadBlob($(this).attr("id"), function appxReadBlob_callback() {
                            appxwidgetcallback(OPT_DROP);
                        });
                        /*If tag didn't get assigned appxfilewrapper class
                        **upon creation, we assign it here. */
                        if (!$fileTag.hasClass("appxfilewrapper")) {
                            $fileTag.addClass("appxfilewrapper");
                        }
                        /*Add classes to help process drag & drop items*/
                        if ($fileTag.hasClass("DnD")) {
                            $fileTag.addClass("Dropped");
                        } else {
                            $fileTag.addClass("DnD Dropped");
                        }
                    } else {
                        /*If dragged item was folder then internet explorer/edge will
                        **not populate the files object*/
                        fileUploadError("The file you chose");
                    }


                    $(this).hide();
                });
            }
        });

    }
    //</dnd>
    if (wx.wEnabled != null && wx.wEnabled == false) {
        $tag.prop("disabled", true);
        if (!(wx.wColorBgDisabled != null || wx.wContentAreaFilled == false)) {
            $tag.addClass("no-disabled-data");
        }
    }

    //<font>
    if (!wx.wFont && wx.wWidgetType == WIDGET_TYPE_LABEL) wx.wFont = "helvetica";
    if (wx.wFont) {
        //Remove the default font and set CUSTOM.css
        var ff = null;
        switch (wx.wFont) {
            case "helvetica": ff = (bInput ? "default-input" : "default"); break;
            case "Courier": ff = "courier"; break;
            case "Helvetica": ff = "arial"; break;
            case "TimesRoman": ff = "times-roman"; break;
            case "Dialog": ff = "fixed-sys"; break;
            case "DialogInput": ff = "terminal"; break;
            case "ZapfDingbats": ff = "wingdings"; break;
            case "SanSerif": ff = "ms-sans-serif"; break;
            case "Serif": ff = "ms-serif"; break;
            case "Monospaced": ff = "fixed-sys"; break;
        }
        if (ff != null)
            $tag.addClass("appx-font-" + ff);
        else
            $tag.css("font-family", wx.wFont);

    }

    if (wt == WIDGET_TYPE_TABLE) {
        if (wx.wFontSize) {
            $tag.css("line-height", (wx.wFontSize * 1.67) + "px");
        }
        else {
            $tag.css("line-height", (appx_session.basefontsize * 1.5) + "px");
        }
    }

    if (wx.wFontSize && !wx.isBox) {
        $tag.css("font-size", wx.wFontSize);
    } else if (wt == WIDGET_TYPE_BUTTON || wt == WIDGET_TYPE_TABLE || bTitlebar) {
        $tag.css("font-size", (appx_session.colWidthPx * 1.50));
    } else { //CA20140328: made size smaller to fit full process names in design and also fit rowtext under buttons
        $tag.css("font-size", (appx_session.colWidthPx * 1.67));
    }

    if (wx.wFontStyle) {
        switch (wx.wFontStyle) {
            case "bold":
                $tag.css("font-weight", "bold");
                break;
            case "italic":
                $tag.css("font-style", "italic");
                break;
            case "bolditalic":
                $tag.css({
                    "font-weight": "bold",
                    "font-style": "italic"
                });
                break;
        }
    }
    //</font>

    if (wx.wWidgetType == WIDGET_TYPE_LABEL) {
        if (wx.wSizeH < 2) {
            $tag.css("white-space", "pre");
            if (wx.wFontSizePercent) {
                var tagHeight = parseInt($tag.css("height").substring(0, $tag.css("height").indexOf("px")));
                $tag.css("line-height", (wx.wFontSizePercent * .01 * tagHeight) + "px");
            } else {
                $tag.css("line-height", $tag.css("height"));
            }
        } else {
            if (checkBrowser() == "IE") {
                $tag.css("line-height", "normal");
            } else {
                $tag.css("line-height", "initial");
            }
        }
    }

    if (wx.wHtmlViewerType == "autoedit") {
        $tag.addClass("ckeditor"); //add class to call in applystyles()
    }

    //<icons> further processing below
    var $img = null;
    var clsIconProp = null;

    if ((wx.wIconEnabled || wx.wIconDisabled || wx.IconRollover) && !wx.isBox && wt != WIDGET_TYPE_PICTURE) {
        $img = $("<img>");

        if ((wx.wEnabled == null || wx.wEnabled == true || wx.wIconDisabled == null) && wx.wIconEnabled) {

            clsIconProp = AppxResource.load(wx.wIconEnabled);
            $img.addClass(clsIconProp + "_img");

        }

        else if (wx.wEnabled == false && wx.wIconDisabled) {
            $img.addClass(AppxResource.load(wx.wIconDisabled) + "_img");
        }
        else if (wx.wIconWallpaper) {
            $img.addClass(AppxResource.load(wx.wIconWallpaper) + "_img");
        }
    }
    //if (wx.wIconRollover)//:BELOW
    if ((wx.wIconWallpaper && wt != WIDGET_TYPE_PICTURE) && !bTitlebar && !$tag.is("button")) {
        $tag.addClass(AppxResource.load(wx.wIconWallpaper));
        if (!wx.wTilingMode) wx.wTilingMode = MODE_TILE;
        else if (wx.wTilingMode != MODE_TILE) $tag.css("background-repeat", "no-repeat no-repeat");
        switch (wx.wTilingMode) {
            case MODE_TILE:
                $tag.css("background-repeat", "repeat repeat");
                break;
            case MODE_EXPAND:
                $tag.css("background-size", "100% 100%");
                break;
            case MODE_CENTER:
                $tag.css("background-position", "center center");
                break;
            case MODE_N:
                $tag.css("background-position", "center top");
                break;
            case MODE_E:
                $tag.css("background-position", "right center");
                break;
            case MODE_S:
                $tag.css("background-position", "center bottom");
                break;
            case MODE_W:
                $tag.css("background-position", "left center");
                break;
            case MODE_NE:
                $tag.css("background-position", "right top");
                break;
            case MODE_NW:
                $tag.css("background-position", "left top");
                break;
            case MODE_SE:
                $tag.css("background-position", "right bottom");
                break;
            case MODE_SW:
                $tag.css("background-position", "left bottom");
                break;
        }
    }
    //</icons>

    if (wx.wJscript) {
        $tag.bind(wx.wJevent, function $_bind() {
            eval(wx.wJscript);
        });
    }

    var cel = appxGetCellSize();
    if (wx.wMarginB)
        $tag.css("padding-bottom", ((wx.wMarginB * cel.h) / 100));
    if (wx.wMarginL)
        $tag.css("padding-left", ((wx.wMarginL * cel.w) / 100));
    if (wx.wMarginR)
        $tag.css("padding-right", ((wx.wMarginR * cel.w) / 100));
    if (!wx.wMarginT && wt == WIDGET_TYPE_TEXT_AREA) wx.wMarginT = 10;
    if (wx.wMarginT)
        $tag.css("padding-top", ((wx.wMarginT * cel.h) / 100));

    if (wx.wSetDropShadow) {
        //default values in parseAndSetShadow
        var factor = .01 * ((appx_session.rowHeightPx + appx_session.colWidthPx) / 2);
        var distance = wx.wSetDropShadowDistance * factor;
        var size = Math.round(wx.wSetDropShadowSize * factor);
        var angle = wx.wSetDropShadowAngle * ((Math.PI) / 180);
        var opacity = wx.wSetDropShadowOpacity;
        var color = appxColorXlate(wx.wSetDropShadowColor, opacity);

        var horx = Math.round(distance * Math.cos(angle));
        var very = Math.round(distance * Math.sin(angle));
        var blur = size;
        var spread = size / 100;
        if ((wx.wContentAreaFilled != null && !wx.wContentAreaFilled) || $tag.hasClass("label") || $tag.hasClass("line")) {
            var shade = horx + 'px ' + very + 'px ' + blur + 'px ' + color;
            if ($tag.hasClass("line")) {
                $tag.children("svg").css({
                    "-webkit-filter": "drop-shadow(" + shade + ")",
                    "filter": "drop-shadow(" + shade + ")"
                });
            } else {
                $tag.css("text-shadow", shade);
            }
        }
        else {
            var shade = horx + 'px ' + very + 'px ' + blur + 'px ' + spread + 'px ' + color;
            $tag.css("box-shadow", shade);
        }
    }

    //alignment usually handled by container classes :BELOW
    if (wx.wSetHorizTextPos && bInput) {
        switch (wx.wSetHorizTextPos) {
            case "CENTER":
                $tag.css("text-align", "center");
                break;
            case "LEFT":
                $tag.css("text-align", "left");
                break;
            case "RIGHT":
                $tag.css("text-align", "right");
                break;
        }
    }

    if (wx.wTooltip && navigator.userAgent.indexOf("Mobile") === -1) {
        $tag.data('title', wx.wTooltip); // <-- does not support HTML tags in tooltip
        $tag.addClass("appx-tooltip");
        $tag.tooltip({
            fade: 250,
            show: { delay: 600 },
            hide: { delay: 200 },
            open: function $_tooltip_open(event, ui) {
                setTimeout(function setTimeoutCallback() {
                    $(ui.tooltip).hide('fade');
                }, 3000);
            },
            items: ".appx-tooltip",
            content: function $_tooltip_content() {
                return $(this).data('title');
            }
        }).on("focusin", function $_onFocusin() {
            $(this).tooltip("close");
        });
    }

    if (wx.wVisible != null && wx.wVisible == false) {
        $tag.css("display", "none");
    }

    /*==============================================================================
      :BELOW - Start building our label/icon container and rollover events
      ------------------------------------------------------------------------------*/

    //<boxLabelIcon>
    if (bInput || wt == WIDGET_TYPE_ROWTEXT) {
        if (wx.wLabel && wt != WIDGET_TYPE_FILE_CHOOSER) {
            if (bInput) {
                $tag.val(wx.wLabel); //input or textarea without child elements
            }
            else {
                $tag.html(wx.wLabel); //has <pre> tag, don't surround with container
            }
        }
        else {
            if (itemdata) {
                $tag.html(itemdata); //has <pre> tag, don't surround with container
            }
        }
    } else if (wt === WIDGET_TYPE_BOX && wx.wLabel !== null ) {
        var classes;
        var align = 'left';
        if (wx.wSetVertAlign === null || wx.wSetVertAlign === "TOP") {
            if (wx.wSetHorizAlign === null || wx.wSetHorizAlign === "LEFT") {
                classes = "legend-top-left";
            } else if (wx.wSetHorizAlign === "CENTER") {
                align = 'center';
                classes = "legend-top-center";
            } else if (wx.wSetHorizAlign === "RIGHT") {
                align = 'right';
                classes = "legend-top-right";
            }
        } else {
            /*There is a bug in Chrome on Windows which prevents us from using rotateX, so we have to use rotateZ
            **which means that we need to switch the text aligns. For the bottom we use left align for the right
            **and right align for the left to achieve the correct positioning while using rotateZ*/
            if (wx.wSetHorizAlign === null || wx.wSetHorizAlign === "LEFT") {
                align = 'right';
                classes = "legend-bottom-left";
            } else if (wx.wSetHorizAlign === "CENTER") {
                align = 'center';
                classes = "legend-bottom-center";
            } else if (wx.wSetHorizAlign === "RIGHT") {
                align = 'left';
                classes = "legend-bottom-right";
            }
            $tag.addClass('fieldset-bottom');
        }
        $tag.html("<legend align='" + align + "' class='" + classes + "'>" + wx.wLabel + "</legend>");
 // } else {
 // if checked and non-modifiable, then synthesize a checkbox to distinguish it from modifiable checkboxes per Bug #4438
    } else if (wt != WIDGET_TYPE_CHECK_BOX ) {
        var $box = $("<div>").addClass("appx--box"); //container
        $box.css({
            "width": "100%"
        });

        /*Do not attach box to element if item is a menu item*/
        if (!$tag.hasClass("appx-menu-item")) {
            // If this is a real Appx region box then don't apply justification.
            if (wori.isBox && $tag.hasClass("appxbox")) {
                $box.appendTo($tag);
            }
            else {
                var clsText = appxGetClassText(wx);
                $box.addClass(clsText).appendTo($tag);
            }
        }
        var $div = $("<div>").addClass("appx-data");
        //keyboard shortcut combinations (Alt+char) wt == WIDGET_TYPE_BUTTON
        if (wx.wLabel != null && wx.wLabel.substr(0, 6).toLowerCase() == "<html>") {
            wx.wLabel = wx.wLabel.substr(6);
        }
        if (wx.wShortcut && $tag.is("button")) {
            var sc = wx.wShortcut.toUpperCase(); //keyhandler sees uppercase
            if (sc != "D" && sc != "C") { //these don't work nicely (IE)
                $tag.addClass("appx-shortcut-" + sc.charCodeAt(0));
                if (wx.wLabel) {
                    if (wx.wLabel.indexOf("<") == -1) {
                        $div.attr("accesskey", sc);
                        var lbl = wx.wLabel;
                        var pos = lbl.indexOf(sc);
                        if (pos == -1) pos = lbl.indexOf(sc.toLowerCase());
                        if (pos != -1) {
                            wx.wLabel = (
                                lbl.substr(0, pos) + '<span class="accesskeyunderline">' +
                                lbl.substr(pos, 1) + "</span>" +
                                lbl.substr(pos + 1)
                            );
                        }
                    }
                }
            }
        }
        if (wt === WIDGET_TYPE_PROGRESS_BAR) {
            if (wx.wColorBg !== null) {
                $div.css({
                    "background-color": wx.wColorBg
                });
            }
        }

        if ((wx.wLabel && !wx.isBox) && wt != WIDGET_TYPE_LINE) {
            if (wt === WIDGET_TYPE_LABEL || itemdata === "" || itemdata === undefined) {
                $div.html(wx.wLabel);
            } else {
                $div.html(itemdata);
            }

            if (bTitlebar)
                $div.width("100%");
        } else {
            if (itemdata) {
                $div.html(itemdata);
            }
        }
        if ($img == null) {
            if ((wx.wLabel || itemdata) && !$tag.hasClass("appxdatefield")) $box.append($div);
        } else {
            $box.addClass(ICON);

            if (wx.wSetImageScale && wx.wTilingMode != MODE_EXPAND && wx.wTilingMode != MODE_TILE) { //CharView.loadImage > scaleImage
                var height;
                if (wx.wFontSize) {
                    height = (wx.wFontSize * (wx.wSetImageScale / 100)) * .66;
                } else {
                    height = (basefontsize * (wx.wSetImageScale / 100)) * .66;
                }
                $img.height(height);
            }
            var clsIcon = appxGetClassIcon(wx, bTitlebar);
            $box.addClass(clsIcon);
            /*Only append $img tag if we are not using expand proportional,
            **else we add class to attach image to background of main div
            **and use css for sizing and placement*/
            if (clsIcon != "appx-icon-expand-prop") {
                if (clsIcon == ICON_ABOVE_TEXT) {
                    $box.append($img);
                    $box.append($div);
                }
                else if (clsIcon.indexOf("leading") != -1) {
                    $box.addClass(ICON_LEADING);
                    $box.append($img);
                    $box.append($div);
                }
                else {
                    if (clsIcon.indexOf("trailing") != -1)
                        $box.addClass(ICON_TRAILING);
                    else if (clsIcon == ICON_BEHIND_TEXT)
                        $div.css("text-align", "center");
                    $box.append($div);
                    $box.append($img);
                }
            } else {
                $box.append($div);
                $box.addClass(clsIconProp + "_ico");
                var bgPos = "center";
                if (wx.wSetHorizAlign != null && wx.wSetVertAlign != null) {
                    bgPos = wx.wSetHorizAlign + " " + wx.wSetVertAlign
                } else if (wx.wSetHorizAlign != null) {
                    bgPos = wx.wSetHorizAlign + " center";

                } else if (wx.wSetVertAlign != null) {
                    bgPos = "center " + wx.wSetVertAlign;
                }
                $box.css({
                    "background-size": "contain",
                    "background-position": bgPos,
                    "background-repeat": "no-repeat"
                });
            }
        }
    }
    //</boxLabelIcon>

    //<rollover>
    if (
        (wx.wColorBgRollover || wx.wColorBgRolloverNL ||
            wx.wColorFgRollover || wx.wColorFgRolloverNL ||
            wx.wIconRollover) && $tag.prop("disabled") === false
    ) { //hover
        if (wx.wIconRollover) {
            $tag.addClass(AppxResource.load(wx.wIconRollover) + "_imgRO");
            var iconRollover = function iconRollover() {
                var src = $img.attr("src"),
                    srcRO = $tag.attr("srcRO");
                if (src != undefined && srcRO != undefined) {
                    $tag.attr("srcRO", src);
                    $img.attr("src", srcRO);
                }
            };
        }
        $tag.mouseenter(function $_mouseenter() {
            if (wx.wColorBgRollover)
                $tag.css("background-color", wx.wColorBgRollover);
            if (wx.wColorBgRolloverNL)
                $tag.css("opacity", wx.wColorBgRolloverNL);
            if (wx.wColorFgRollover)
                $div.css("color", wx.wColorFgRollover);
            if (wx.wColorFgRolloverNL)
                $div.css("opacity", wx.wColorFgRolloverNL);
            if (wx.wIconRollover)
                iconRollover();
        }).mouseleave(function $_mouseleave() {
            //container
            if (wx.wColorBgRollover)
                $tag.css("background-color", (wx.wColorBg ? wx.wColorBg : ""));
            if (wx.wColorBgRolloverNL)
                $tag.css("opacity", (wx.wColorBgNL ? wx.wColorBgNL : 1.0));
            //labeltext
            if (wx.wColorFgRollover)
                $div.css("color", (wx.wColorFg ? wx.wColorFg : ""));
            if (wx.wColorFgRolloverNL)
                $div.css("opacity", (wx.wColorFgNL ? wx.wColorFgNL : 1.0));
            if (wx.wIconRollover)
                iconRollover();
        });
    }
    //</rollover>

    //<titlebarButtons> had to move this down here
    if (bTitlebar) {
        var $boxTitle = $("<span>").addClass("appx-title-buttons").appendTo($tag);
        if (checkBrowser() !== "Firefox" && checkBrowser() !== "IE") {
            $boxTitle.addClass("right-padding-only");
        }
        var titleBarButton = function titleBarButton(opt) {
            var $btnTitle = $("<button type='button'>").css({ //addClass titlebutton
                "font-size": ~~((appx_session.colWidthPx) * 1.40) + "px",
                "height": (appx_session.rowHeightPx - 4) + "px",
                "width": (appx_session.rowHeightPx - 4) + "px"
            });
            switch (opt) {
                case OPT_END:
                    $btnTitle.addClass("appx-title-button-close").html("X");
                    break;
                case OPT_ENTER:
                    $btnTitle.addClass("appx-title-button-ok").html("&#10004;");
                    break;
                case OPT_WHATS_THIS:
                    $btnTitle.addClass("appx-title-button-help").html("?");
                    break;
            }
            $btnTitle.appendTo($boxTitle);
        };
        if (wx.wShowHelp == null || wx.wShowHelp == true) {
            titleBarButton(OPT_WHATS_THIS);
        }
        if (wx.wShowOk == null || wx.wShowOk == true) {
            titleBarButton(OPT_ENTER);
        }
        if (wx.wShowClose == null || wx.wShowClose == true) {
            titleBarButton(OPT_END);
        }
    }
    //</titlebarButtons>
    if (wx.wClasses) {
        $tag.addClass(wx.wClasses);
    }

    if (wx.wExtraAttrs) {
        for (var i = 0; i < wx.wExtraAttrs.length; i++) {
            if (wx.wExtraAttrs[i].length == 2) {
                $tag.attr(wx.wExtraAttrs[i][0], wx.wExtraAttrs[i][1]);
            }
        }
    }

    if ($tag.hasClass("ckeditor") && wx.wEditorConfig != null) {
        if (!appx_session.editorConfigs.hasOwnProperty(wx.wEditorConfig)) {
            var temp = wx.wEditorConfig.split(".");
            var cacheid = cleanClassName(appx_session.server + "_" + appx_session.port + "_" + temp[0].substring(1) + "_" + temp[1] + "_" + temp[2]);
            appx_session.editorConfigs[cacheid] = null;
            AppxResource.load(wx.wEditorConfig);
        }
        $tag.data("editorConfig", cacheid);
    }

    if (!$tag.is(":input")) {
        $tag.addClass("context-selector");
    }

    /*Add label text if item is a menu item*/
    if ($tag.hasClass("appx-menu-item")) {
        $tag.text(wx.wLabel);
    }
}

function GridCacheProps() {
    var self = this;
    self.lastSortName = null;
    self.lastSortOrder = null;

    self.scrollLeft = null;
    self.selrows = [];
}

//MWidget Object
Widget.prototype.self = null;

function appxWidgetCheckSelected(wx) {
    var propName = null;
    var propValue = null;
    switch (wx.wCommand) {
        case 20101:
            /*  ##DELETEUSERPREFS##
            propName = "guiInterface";
            propValue = appx_session.getProp(propName);*/
            break;
        case 20102:
            propName = "showOptionNumbers";
            propValue = appx_session.getProp(propName);
            break;
        case 20103:
            propName = "autoTabOut";
            propValue = appx_session.getProp(propName);
            break;
        case 20104:
            propName = "autoSelect";
            propValue = appx_session.getProp(propName);
            break;
        case 20105:
            /*  ##DELETEUSERPREFS##
            propName = "dockingScrollbar";
            propValue = appx_session.getProp(propName);*/
            break;
        case 20106:
    }
    wx.wSelected = propValue;
}

function Widget(boxid, html, widgetData, widgetExtraData, fullWidget) {

    //current object alias
    var self = this;

    self.boxid = boxid;
    self.html = html;

    self.forceAntiAlias = -1;
    self.forceMultiLine = -1;
    self.forceMovable = -1;

    self.wClientId = null;
    self.wWidgetId = null;
    self.wLayer = null;
    self.wLabel = null;
    self.wShortLabel = null;
    self.wTooltip = null;
    self.wGroupName = null;
    self.wShortcut = null;
    self.wMovableCommand = null;
    self.wCommand = null;
    self.wCommand2 = null;
    self.wCommandGotFocus = null; //OPT_NULL
    self.wCommandLostFocus = null; //OPT_NULL
    self.wCommandValueAdjusted = null; //OPT_NULL
    self.wLocalList = null;
    self.wEnabled = null;
    self.wUsageMenu = false;
    self.wUsageToolbar = false;
    self.wUsagePopup = false;
    self.wSepBefore = null;
    self.wSepAfter = null;
    self.wRolloverEnabled = null;
    self.wBorderPainted = null;
    self.wContentAreaFilled = null;
    self.wSelected = null;
    self.wFocusPainted = null;
    self.wVisible = null;
    self.wRequiresSelection = null;
    self.wInvert = null;
    self.wPaintTicks = null;
    self.wPaintTickLabels = null;
    self.wSnapToTicks = null;
    self.wShowHelp = null;
    self.wShowClose = null;
    self.wShowOk = null;
    self.wShowMax = null;
    self.wShowMin = null;
    self.wMovable = null;
    self.wSetMoveCursor = false;
    self.wResizable = null;
    self.wDockable = null;
    self.wDefaultButton = null;
    self.wTabable = null;
    self.wColorFg = null;
    self.wColorFgNL = null;
    self.wColorBg = null;
    self.wColorBgNL = null;
    self.wColorFgDisabled = null;
    self.wColorFgDisabledNL = null;
    self.wColorBgDisabled = null;
    self.wColorBgDisabledNL = null;
    self.wColorFgRollover = null;
    self.wColorFgRolloverNL = null;
    self.wColorBgRollover = null;
    self.wColorBgRolloverNL = null;
    self.wColorBgWallpaper = null;
    self.wColorBgWallpaperNL = null;
    self.wFileFilter = null;
    // <---

    // not implemented yet.

    self.wMinValue = null;
    self.wMaxValue = null;
    self.wTickMajor = null;
    self.wTickMinor = null;
    self.wTilingMode = null;
    self.wBorder = null;
    self.wWidgetType = null;
    self.wWidgetOriginalType = null;
    self.wMarginT = null;
    self.wMarginB = null;
    self.wMarginL = null;
    self.wMarginR = null;
    self.wPositionX = null;
    self.wPositionY = null;
    self.wSizeW = null;
    self.wSizeH = null;
    self.wOffsetX = null;
    self.wOffsetY = null;
    self.wOffsetW = null;
    self.wOffsetH = null;
    self.wTabGroup = null;
    self.wFileChooserMode = null;
    self.wEndcapType = null;

    //    var  wPictureLocation = null;

    self.wBoxNumber = null;
    self.wTabSubGroupId = null;
    self.wIconEnabled = null;
    self.wIconDisabled = null;
    self.wIconPressed = null;
    self.wIconSelected = null;
    self.wIconRollover = null;
    self.wIconRolloverSelected = null;
    self.wIconWallpaper = null;
    self.wSetHorizTextPos = null;
    self.wSetVertTextPos = null;
    self.wSetHorizAlign = null;
    self.wSetVertAlign = null;
    self.wOrientation = null;
    self.wFont = null;
    //added these two instead of wFont = {name}-{style}-{size}
    self.wFontSize = null;
    self.wFontSizePercent = null;
    self.wFontStyle = null;
    self.wSetFormSize = null;
    self.wSetProcessType = null;
    self.wSetFrameClass = null;
    self.wSetImageScale = null;
    self.wSetLineWeight = null;
    self.wSetStrokeWeight = null;
    self.wSetBorderArc = null;
    self.wSetAntiAlias = null;
    self.wSetDropShadow = null;
    self.wSetDropShadowSize = null;
    self.wSetDropShadowOpacity = null;
    self.wSetDropShadowColor = null;
    self.wSetDropShadowDistance = null;
    self.wSetDropShadowAngle = null;
    self.wSetScroller = null;
    self.wSignature = null;
    self.wForceWidget = null;
    self.wStrokePattern = null;
    self.wStrokePatternOffset = null;
    self.wLineUnitBase = null;
    self.wHtmlViewerType = null;
    self.wDragAndDrop = null;
    self.wResFont = null;
    self.wResBundle = null;
    self.wEditorConfig = null;
    self.wPcbId = null;
    self.wFrameImageKey = null;
    self.wHashSig = null;
    self.wMenuNo = null; //MMenu()
    self.wMenuUse = null; //MMenu()

    self.delimiter = '\t';
    self.delimiterStr = "" + self.delimiter;
    self.widgetLen = 0;
    self.widgetData = widgetData; //null;
    self.widgetExtraData = widgetExtraData;
    self.widgetExtraLen = 0;
    self.wJscript = null;
    self.wJevent = null;
    self.bytesInCount = 0;
    self.tableHashKey = null;
    self.tableShowRowNumbers = true;
    self.tableShowFooterBar = true;
    self.tableShowHeading = true;
    self.tableCaseSort = false;
    self.tableShowCsvOption = true;
    self.tableShowPageOption = true;
    self.tableShowColChooser = true;
    self.tableShowLayoutSave = true;
    self.tableShowTableRefresh = true;
    self.tableShowTableSearch = true;
    self.tableShowTableReset = true;
    self.tableColumnSortable = null;
    self.tableColumnSortType = null;
    self.tableColumnResizable = null;
    self.tableColumnSearchable = true;
    self.tableColumnDateFormat = null;
    self.tableMovableColumn = true;
    self.wAltColorFg = null;
    self.wAltColorFg = null;
    if ($("meta[name=appx-upload-without-local]").attr("content") !== undefined && ($("meta[name=appx-upload-without-local]").attr("content") === "true")) {
        self.fileUseLocalConnector = false;

    } else {
        self.fileUseLocalConnector = true;
    }
    self.specialHorizontalLocation = null;
    self.specialVerticalLocation = null;

    if (fullWidget) {
        self.size_row = fullWidget.size_row;
        self.size_col = fullWidget.size_col;
    }

    self.parseData();
}

/* <position> icon & text */

//icon align [sub 0ad widget(extend)(button)]
//TH = WIDGET TEXT POS HORIZ
//TV = WIDGET TEXT POS VERT
//TM = WIDGET TILING MODE

// ICON_NULL             0 TH = _   & TV = _   & TM = _
// ICON_BEHIND_TEXT      1 TH = C   & TV = _|C
// ICON_ABOVE_TEXT       2 TH = C   & TV = B
// ICON_TRAILING_TEXT    3 TH = L   & TV = _|C
// ICON_BELOW_TEXT       4 TH = C   & TV = T
// ICON_LEADING_TEXT     5 TH = _|R & TV = _|C
// ICON_TRAILING_BOTTOM  6 TH = L   & TV = B
// ICON_LEADING_BOTTOM   7 TH = _|R & TV = B
// ICON_TRAILING_TOP     8 TH = L   & TV = T
// ICON_LEADING_TOP      9 TH = _|R & TV = T
// ICON_EXPAND_FILL     10 TH = _   & TV = _   & TM = EXPAND
// ICON_EXPAND_PROP     11 TH = _   & TV = _   & TM = TILE

var ICON = "appx-icon";
var ICON_LEADING = "appx-icon-leading"; //extra class for all leading forms
var ICON_TRAILING = "appx-icon-trailing"; //extra class for all trailing forms
var ICON_NULL = "appx-icon-null";
var ICON_BEHIND_TEXT = "appx-icon-behind-text";
var ICON_ABOVE_TEXT = "appx-icon-above-text";
var ICON_TRAILING_TEXT = "appx-icon-trailing-text";
var ICON_BELOW_TEXT = "appx-icon-below-text";
var ICON_LEADING_TEXT = "appx-icon-leading-text";
var ICON_TRAILING_BOTTOM = "appx-icon-trailing-bottom";
var ICON_LEADING_BOTTOM = "appx-icon-leading-bottom";
var ICON_TRAILING_TOP = "appx-icon-trailing-top";
var ICON_LEADING_TOP = "appx-icon-leading-top";
var ICON_EXPAND_FILL = "appx-icon-expand-fill";
var ICON_EXPAND_PROP = "appx-icon-expand-prop";

var appxGetClassIcon = function appxGetClassIcon(wx, mTitlebar) {
    var wt = parseInt(wx.wWidgetType);
    var cls = wt == WIDGET_TYPE_LABEL ? ICON_TRAILING_TEXT : ICON_LEADING_TEXT;
    if ((wx.wTilingMode == MODE_EXPAND || wx.wTilingMode == MODE_TILE) && !mTitlebar) {
        switch (wx.wTilingMode) {
            case MODE_EXPAND:
                cls = ICON_EXPAND_FILL;
                break;
            case MODE_TILE:
                cls = ICON_EXPAND_PROP;
                break;
            default:
                console.log("appxGetClassIcon: unhandled tiling " + wx.wTilingMode);
        }
    }
    else {
        switch (wx.wSetHorizTextPos) {
            case 'LEFT':
                switch (wx.wSetVertTextPos) {
                    case 'BOTTOM':
                        cls = ICON_TRAILING_BOTTOM;
                        break;
                    case 'TOP':
                        cls = ICON_TRAILING_TOP;
                        break;
                    default: //null,'','CENTER'
                        cls = ICON_TRAILING_TEXT;
                        break;
                }
                break;
            case 'CENTER':
                switch (wx.wSetVertTextPos) {
                    case 'BOTTOM':
                        cls = ICON_ABOVE_TEXT;
                        break;
                    case 'TOP':
                        cls = ICON_BELOW_TEXT;
                        break;
                    default: //null,'','CENTER'
                        cls = ICON_BEHIND_TEXT;
                        break;
                }
                break;
            default: //null,'','RIGHT'
                switch (wx.wSetVertTextPos) {
                    case 'BOTTOM':
                        cls = ICON_LEADING_BOTTOM;
                        break;
                    case 'TOP':
                        cls = ICON_LEADING_TOP;
                        break;
                    default: //null,'','CENTER'
                        cls = ICON_LEADING_TEXT;
                        break;
                }
                break;
        }
    }
    return cls;
};

//widget text align
//AH = WIDGET ALIGN HORIZ
//AV = WIDGET ALIGN VERT
// TEXT_NULL          0 AH = _   & AV = _
// TEXT_CENTER        1 AH = _|C & AV = _|C
// TEXT_TOP           2 AH = _|C & AV = T
// TEXT_RIGHT         3 AH = R   & AV = _|C
// TEXT_BOTTOM        4 AH = _|C & AV = B
// TEXT_LEFT          5 AH = L   & AV = _|C
// TEXT_UPPER_RIGHT   6 AH = R   & AV = T
// TEXT_UPPER_LEFT    7 AH = L   & AV = T
// TEXT_LOWER_RIGHT   8 AH = R   & AV = B
// TEXT_LOWER_LEFT    9 AH = L   & AV = B

var TEXT_NULL = "appx-text-null";
var TEXT_CENTER = "appx-text-center";
var TEXT_TOP = "appx-text-top";
var TEXT_RIGHT = "appx-text-right";
var TEXT_BOTTOM = "appx-text-bottom";
var TEXT_LEFT = "appx-text-left";
var TEXT_UPPER_RIGHT = "appx-text-upper-right";
var TEXT_UPPER_LEFT = "appx-text-upper-left";
var TEXT_LOWER_RIGHT = "appx-text-lower-right";
var TEXT_LOWER_LEFT = "appx-text-lower-left";

var appxGetClassText = function appxGetClassText(wx) {
    var cls = TEXT_LEFT; //TEXT_NULL

    if (wx.wSizeH && wx.wSizeH > 1) {
        if (wx.wWidgetType == WIDGET_TYPE_RAW_TEXT)
            cls = TEXT_UPPER_LEFT;
        else
            cls = TEXT_LEFT;
    }

    if (wx.wWidgetType == WIDGET_TYPE_HTML_VIEWER)
        cls = TEXT_UPPER_LEFT;

    if (wx.wWidgetType == WIDGET_TYPE_BUTTON)
        cls = TEXT_CENTER;

    if ((wx.wWidgetType == WIDGET_TYPE_LABEL) && (wx.wSizeH > 1)) {
        var browser = checkBrowser();
        if (browser == "Edge" || browser == "IE") {
            cls = TEXT_NULL;
        }
    }

    if (wx.wSetHorizAlign || wx.wSetVertAlign) {
        switch (wx.wSetHorizAlign) {
            case 'LEFT':
                switch (wx.wSetVertAlign) {
                    case 'BOTTOM':
                        cls = TEXT_LOWER_LEFT;
                        break;
                    case 'TOP':
                        cls = TEXT_UPPER_LEFT;
                        break;
                    default: //null,'','CENTER'
                        cls = TEXT_LEFT;
                        break;
                }
                break;
            case 'RIGHT':
                switch (wx.wSetVertAlign) {
                    case 'BOTTOM':
                        cls = TEXT_LOWER_RIGHT;
                        break;
                    case 'TOP':
                        cls = TEXT_UPPER_RIGHT;
                        break;
                    default: //null,'','CENTER'
                        cls = TEXT_RIGHT;
                        break;
                }
                break;
            default: //null,'','CENTER'
                switch (wx.wSetVertAlign) {
                    case 'BOTTOM':
                        cls = TEXT_BOTTOM;
                        break;
                    case 'TOP':
                        cls = TEXT_TOP;
                        break;
                    default: //null,'','CENTER'
                        cls = TEXT_CENTER;
                        break;
                }
                break;
        }
    }
    return cls;
};
/* </position> */

//comm.msg.MWidget
//Set Drop Shadow - @SDS={visible},{distance},{size},{angle},{opacity},{color}
//SDS: T,250,500,50,45,green
Widget.prototype.parseAndSetShadow = function Widget_prototype_parseAndSetShadow(token) {
    try {
        var tokens = token.split(",");
        if (tokens.length > 0 && tokens[0].toUpperCase() == "F")
            this.wSetDropShadow = false;
        else
            this.wSetDropShadow = true;

        if (tokens.length > 1 && tokens[1].length > 0)
            this.wSetDropShadowDistance = parseInt(tokens[1]);
        else
            this.wSetDropShadowDistance = 25;

        if (tokens.length > 2 && tokens[2].length > 0)
            this.wSetDropShadowSize = parseInt(tokens[2]);
        else
            this.wSetDropShadowSize = this.wSetDropShadowDistance;

        if (tokens.length > 3 && tokens[3].length > 0)
            this.wSetDropShadowAngle = parseInt(tokens[3]);
        else
            this.wSetDropShadowAngle = 45.0;

        if (tokens.length > 4 && tokens[4].length > 0)
            this.wSetDropShadowOpacity = parseInt(tokens[4]) * .01;
        else
            this.wSetDropShadowOpacity = 0.5;

        if (tokens.length > 5 && tokens[5].length > 0)
            this.wSetDropShadowColor = tokens[5];
        else
            this.wSetDropShadowColor = "#000000";
    }
    catch (e) {
        console.log("MWidget - bad setDropShadow " + e + "," + token);
        console.log(e.stack);
    }
}

Widget.prototype.parseData = function Widget_prototype_parseData() { //CreateFromJSON(widgetparams)
    try {
        if (this.widgetData) {
            var st2 = null;
            var widgetparams = this.parseDataIntoPairs();
            for (var ct = 0; ct < widgetparams.length; ct++) {
                var key = widgetparams[ct].key;
                var val = widgetparams[ct].value.replace(/ *$/, "").replace(/##\'\'##/g, '\"');
                switch (key) {
                    case "XA":
                        var attrs = val.split(";");
                        var p2 = [];
                        $.each(attrs, function $_each(idx, obj) {
                            var p1 = obj.split(":");
                            p2.push(p1);
                        });
                        this.wExtraAttrs = p2;
                        break;
                    case "CLSS":
                        this.wClasses = val;
                        break;
                    case "CLID":
                        this.wClientId = val;
                        break;
                    case "FULC":
                        if (this.fileUseLocalConnector === true) {
                            this.fileUseLocalConnector = (val == 'T');
                        }
                        break
                    case "SAA": // Set Anti Aliasing, not needed
                        break;
                    case "SAC":
                        this.wCommand = parseInt(val);
                        break;
                    case "SAC2":
                        this.wCommand2 = parseInt(val);
                        break;
                    case "SGFC":
                        this.wCommandGotFocus = parseInt(val);
                        break;
                    case "SLFC":
                        this.wCommandLostFocus = parseInt(val);
                        break;
                    case "SB":
                        this.wBorder = parseInt(val);
                        break;
                    //?case "SBF": break;
                    case "SBN":
                        this.wBoxNumber = parseInt(val);
                        break;
                    case "SBP":
                        if (val == 'F') this.wBorder = BORDER_NONE;
                        break;
                    case "SCAF":
                        this.wContentAreaFilled = (val != 'F');
                        break;
                    case "SCT":
                        this.wEndcapType = parseInt(val);
                        break;
                    case "SDB":
                        this.wDefaultButton = (val != 'F');
                        break;
                    case "SDBC":
                        if (val.length > 7) {
                            this.wColorBgDisabled = val.substr(0, 7);
                            this.wColorBgDisabledNL = parseInt("0x" + val.substr(7)) / 255;
                        }
                        else {
                            this.wColorBgDisabled = val;
                        }
                        break;
                    case "SDFC":
                        if (val.length > 7) {
                            this.wColorFgDisabled = val.substr(0, 7);
                            this.wColorFgDisabledNL = parseInt("0x" + val.substr(7)) / 255;
                        }
                        else {
                            this.wColorFgDisabled = val;
                        }
                        break;
                    case "SDI":
                        this.wIconDisabled = val;
                        break;
                    case "SDND":
                        this.wDragAndDrop = val;
                        break;
                    case "SDS":
                        this.parseAndSetShadow(val);
                        break;
                    case "SE":
                        this.wEnabled = (val != 'F');
                        break;
                    case "SEBC":
                    case "SBC":
                        if (val.length > 7) {
                            this.wColorBg = val.substr(0, 7);
                            this.wColorBgNL = parseInt("0x" + val.substr(7)) / 255;
                        }
                        else {
                            this.wColorBg = val;
                            this.wColorBgNL = null;
                        }
                        break;
                    case "SEFC":
                    case "SFC":
                        if (val.length > 7) {
                            this.wColorFg = val.substr(0, 7);
                            this.wColorFgNL = parseInt("0x" + val.substr(7)) / 255;
                        }
                        else {
                            this.wColorFg = val;
                            this.wColorFgNL = null;
                        }
                        break;
                    case "SF":
                        st2 = val.split(",");
                        if (st2.length > 0) {
                            this.wFont = st2[0];
                        }
                        if (st2.length > 1) {
                            this.wFontStyle = st2[1].toLowerCase();
                            if (this.wFontStyle == "bold+italic" || this.wFontStyle == "bold + italic")
                                this.wFontStyle = "bolditalic";
                        }
                        if (st2.length > 2) {
                            this.wFontSize = parseInt(st2[2]);
                            // Sanity Check
                            if (this.wFontSize >= presetFontSizes.length)
                                this.wFontSize = 0;
                            // Convert to percentage from preset list
                            this.wFontSize = presetFontSizes[this.wFontSize];
                            this.wFontSizePercent = this.wFontSize;
                            // Convert percentage to real size
                            if (this.wWidgetType == WIDGET_TYPE_TABLE) {
                                this.wFontSize = (this.wFontSize * .01 * (appx_session.colWidthPx) * 1.50) + parseInt(appx_session.getProp("widgetFontAdjust"));
                            } else {
                                this.wFontSize = (this.wFontSize * .01 * (appx_session.colWidthPx) * 1.70) + parseInt(appx_session.getProp("widgetFontAdjust"));
                            }
                        }
                        break;
                    case "SFCM":
                        this.wFileChooserMode = val;
                        break;
                    case "SFIK":
                        this.wFrameImageKey = val;
                        break;
                    case "SGN":
                        this.wGroupName = val;
                        break;
                    case "SHA":
                        this.wSetHorizAlign = val;
                        break;
                    case "SHCL":
                        this.wShowClose = (val != 'F');
                        break;
                    case "SHHL":
                        this.wShowHelp = (val != 'F');
                        break;
                    case "SHL":
                        this.specialHorizontalLocation = val;
                        break;
                    case "SHOK":
                        this.wShowOk = (val != 'F');
                        break;
                    case "SHS":
                        this.wHashSig = parseInt(val);
                        break;
                    case "SHTM":
                        this.wHtmlViewerType = val;
                        break;
                    case "SHTP":
                        this.wSetHorizTextPos = val;
                        break;
                    case "SI":
                        this.wIconEnabled = val;
                        break;
                    case "SIG":
                        this.wSignature = (val != 'F');
                        break;
                    case "SINV":
                        this.wInvert = (val != 'F');
                        break;
                    case "SIS":
                        var iSize = parseInt(val);
                        if (iSize >= presetFontSizes.length) iSize = 0;
                        // Convert to percentage from preset list
                        if (iSize > 0)
                            this.wSetImageScale = parseInt(presetFontSizes[iSize]);
                        else
                            console.log("MWidget.parseData() Invalid Widget Image Scale = " + val + "for widget = " + this.widgetData.toString());
                        break;
                    case "SJE":
                        this.wJevent = val;
                        break;
                    case "SJS":
                        this.wJscript = val;
                        break;
                    case "SL":
                        st2 = val.split(",");
                        this.wPositionY = parseInt(st2[1]);
                        this.wPositionX = parseInt(st2[0]);
                        break;
                    case "SLL":
                        this.wLocalList = val;
                        break;
                    case "SLN":
                        this.wLayer = parseInt(val);
                        break;
                    case "SLUB":
                        this.wLineUnitBase = val;
                        break;
                    case "SLW":
                        this.wSetLineWeight = parseInt(val);
                        break;
                    case "SM":
                        st2 = val.split(",");
                        if (st2.length > 0) this.wMarginT = parseInt(st2[0]);
                        if (st2.length > 1) this.wMarginL = parseInt(st2[1]);
                        if (st2.length > 2) this.wMarginB = parseInt(st2[2]);
                        if (st2.length > 3) this.wMarginR = parseInt(st2[3]);
                        break;
                    case "SMATS":
                        this.wTickMajor = parseInt(val);
                        break;;
                    case "SMAX":
                        this.wMaxValue = parseInt(val);
                        break;
                    case "SMIN":
                        this.wMinValue = parseInt(val);
                        break;
                    case "SMITS":
                        this.wTickMinor = parseInt(val);
                        break;
                    case "SMN": //MMenu()
                        this.wShortcut = val;
                        break;
                    case "SMT": //MMenu()
                        this.wMenuNo = parseInt(val);
                        break;
                    case "SMV":
                        this.wMovable = true;
                        this.wMovableCommand = val;
                        break;
                    case "SMVC":
                        this.wSetMoveCursor = true;
                        break;
                    case "SO":
                        if (val === "VERTICAL") {
                            this.wOrientation = "vertical";
                        } else {
                            this.wOrientation = "horizontal";
                        }
                        break;
                    case "SOFF": //micro positioning (percentages)
                        st2 = val.split(",");
                        if (st2.length > 0) {
                            this.wOffsetY = parseInt(st2[0]);
                            if (this.wOffsetY > 127) {
                                this.wOffsetY = this.wOffsetY - 256;
                            }
                        }
                        if (st2.length > 1) {
                            this.wOffsetX = parseInt(st2[1]);
                            if (this.wOffsetX > 127) {
                                this.wOffsetX = this.wOffsetX - 256;
                            }
                        }
                        if (st2.length > 2) {
                            this.wOffsetW = parseInt(st2[2]);
                            if (this.wOffsetW > 127) {
                                this.wOffsetW = this.wOffsetW - 256;
                            }
                        }
                        if (st2.length > 3) {
                            this.wOffsetH = parseInt(st2[3]);
                            if (this.wOffsetH > 127) {
                                this.wOffsetH = this.wOffsetH - 256;
                            }
                        }
                        break;
                    case "SPCB":
                        /*Keep the pcbId as string so we don't lose precision when we convert to number in js*/ 
                        /*this.wPcbId = parseInt(val);*/
                        this.wPcbId = val;
                        break;
                    case "SPT":
                        this.wPaintTicks = (val != 'F');
                        break;
                    case "SPTL":
                        this.wPaintTickLabels = (val != 'F');
                        break;
                    case "SRBC":
                        //turn on alpha color bit
                        //check length of string
                        //if greater 6, last two is alpha
                        //use rgbs(0,0,0,0)
                        //20140328 chris@praclox.nl: aye
                        if (val.length > 7) {
                            this.wColorBgRollover = val.substr(0, 7);
                            this.wColorBgRolloverNL = parseInt("0x" + val.substr(7)) / 255;
                        }
                        else {
                            this.wColorBgRollover = val;
                        }
                        break;
                    case "SRE":
                        this.wRolloverEnabled = (val != 'F');
                        break;
                    case "SREC":
                        this.wEditorConfig = val;
                        break;
                    case "SRFC":
                        if (val.length > 7) {
                            this.wColorFgRollover = val.substr(0, 7);
                            this.wColorFgRolloverNL = parseInt("0x" + val.substr(7)) / 255;
                        }
                        else {
                            this.wColorFgRollover = val;
                        }
                        break;
                    case "SRI":
                        this.wIconRollover = val;
                        break;
                    case "SSP":
                        this.wStrokePattern = val;
                        break;
                    case "SSPO":
                        this.wStrokePatternOffset = val;
                        break;
                    case "SST":
                        this.wShortLabel = val;
                        break;
                    case "SSTT":
                        this.wSnapToTicks = (val != 'F');
                        break;
                    case "SSU":
                        var mask = parseInt(val);
                        if ((mask & WIDGET_SEP_BEFORE) == WIDGET_SEP_BEFORE)
                            this.wSepBefore = true;
                        if ((mask & WIDGET_SEP_AFTER) == WIDGET_SEP_AFTER)
                            this.wSepAfter = true;
                        break;
                    case "SSZ":
                        st2 = val.split(",");
                        this.wSizeW = parseInt(st2[0]);
                        this.wSizeH = parseInt(st2[1]);
                        break;
                    case "ST": //MMenu()
                        this.wLabel = val;
                        break;
                    case "STG": //MMenu()
                        this.wTabGroup = parseInt(val);
                        break;
                    case "STM":
                        this.wTilingMode = parseInt(val);
                        break;
                    case "STSG":
                        this.wTabSubGroupId = val;
                        break;
                    case "STTT":
                        this.wTooltip = val;
                        break;
                    case "SV":
                        this.wVisible = (val != 'F');
                        break;
                    case "SVA":
                        this.wSetVertAlign = val;
                        break;
                    case "SVAC":
                        //for listbox change event
                        //CA20141118:#3183 Key pause
                        this.wCommandValueAdjusted = parseInt(val);
                        break;
                    case "SVL":
                        this.specialVerticalLocation = val;
                        break;
                    case "SVTP":
                        this.wSetVertTextPos = val;
                        break;
                    case "SWBC":
                        if (val.length > 7) {
                            this.wColorBgWallpaper = val.substr(0, 7);
                            this.wColorBgWallpaperNL = parseInt("0x" + val.substr(7)) / 255;
                        }
                        else {
                            this.wColorBgWallpaper = val;
                        }
                        break;
                    case "SWI":
                        this.wIconWallpaper = val;
                        break;
                    case "SWID":
                        this.wWidgetId = val;
                        break;
                    case "SWT":
                        this.wWidgetType = parseInt(val);
                        break;
                    case "SWU":
                        var mask = parseInt(val);
                        if ((mask & WIDGET_USAGE_MENU) == WIDGET_USAGE_MENU)
                            this.wUsageMenu = true;
                        if ((mask & WIDGET_USAGE_TOOLBAR) == WIDGET_USAGE_TOOLBAR)
                            this.wUsageToolbar = true;
                        if ((mask & WIDGET_USAGE_POPUP) == WIDGET_USAGE_POPUP)
                            this.wUsagePopup = true;
                        break;
                    case "TSRN": //Table Show Row Numbers
                        this.tableShowRowNumbers = (val != 'F');
                        break;
                    case "TSFB": //Table Show Footer Bar
                        this.tableShowFooterBar = (val != 'F');
                        break;
                    case "TSHB": //Table Show Header Bar
                        this.tableShowHeading = (val != 'F');
                        break;
                    case "TCSS":
                        this.tableCaseSort = (val == 'T');
                        break;
                    case "TCSV": //Table Show CSV Download Option
                        this.tableShowCsvOption = (val == 'T');
                        break;
                    case "TSPO": //Table Show Paging Option
                        this.tableShowPageOption = (val == 'T');
                        break;
                    case "TSCC": //Table Show Column Chooser
                        this.tableShowColChooser = (val == 'T');
                        break;
                    case "TSLS": //Table Show Layout Save
                        this.tableShowLayoutSave = (val == 'T');
                        break;
                    case "TSTR": //Table Show Table Reset to Default
                        this.tableShowTableReset = (val == 'T');
                        break;
                    case "TSTRF": //Table Show Table Refresh
                        this.tableShowTableRefresh = (val == 'T');
                        break;
                    case "TSTS": //Table Show Table Refresh
                        this.tableShowTableSearch = (val == 'T');
                        break;
                    case "USE": //MMenu()
                        this.wMenuUse = (val == 'T');
                        break;
                    case "TCS": //Table Column Sortable
                        this.tableColumnSortable = (val != 'F');
                        break;
                    case "TCST": //Table Column Sort Type
                        switch (val) {
                            case "INT":
                                this.tableColumnSortType = "int";
                                break;
                            case "FLOAT":
                                this.tableColumnSortType = "float";
                                break;
                            case "DATE":
                                this.tableColumnSortType = "date";
                                break;
                            case "TEXT":
                                this.tableColumnSortType = "text";
                                break;
                            default:
                                break;
                        }
                        break;
                    case "TCR": //Table Column Resizable
                        this.tableColumnResizable = (val != 'F');
                        break;
                    case "TCSE": //Table Column Searchable
                        this.tableColumnSearchable = (val != 'F');
                        break;
                    case "TCDF": //Table Column Date Format
                        /*Currently "/", "-", and "." are supported as date separators. Valid formats are:
                                                                                y,Y,yyyy for four digits year
                                                                                YY, yy for two digits year
                                                                                m,mm for months
                                                                                d,dd for days. */
                        this.tableColumnDateFormat = val;
                        break;
                    case "TSMC":
                            this.tableMovableColumn = (val != 'F'); /*make the columns of table movable by mouse drag*/
                            break;
                    case "ALTFC":
                            this.wAltColorFg = val; /*alternate bg color - currently used on table cells for when a row is selected. It can include opacity #RRGGBBAA*/
                            break;
                    case "ALTBC":
                            this.wAltColorBg = val; /*alternate fg color - currently used on table cells for when a row is slected. It can include opacity #RRGGBBAA*/
                            break;
                    default:
                        console.log("WP: unhandled " + key + "=" + val);
                        break;
                }
            }
        }

        if (this.wWidgetType == WIDGET_TYPE_TABLE)
            this.tableHashKey = "pcb" + this.wPcbId + "fik" + this.wFrameImageKey + "sig" + this.wHashSig + "r" + this.wPositionY + "c" + this.wPositionX + "h" + this.wSizeH + "w" + this.wSizeW;

        if (this.wLayer == null) {
            this.wLayer = 10;
            if (this.wWidgetType != null) {
                switch (parseInt(this.wWidgetType)) {
                    case WIDGET_TYPE_LABEL:
                    case WIDGET_TYPE_PICTURE:
                    case WIDGET_TYPE_LINE:
                        this.wLayer = 20; //button overlay issues, off for now
                        break;
                    case WIDGET_TYPE_TABLE:
                        this.wLayer = 9; //button overlay issues, off for now
                        break;
                    case WIDGET_TYPE_BOX:
                        this.wLayer = 30; //button overlay issues, off for now
                        break;
                    case WIDGET_TYPE_ROWTEXT:
                        this.wLayer = 25; //put beneath buttons
                        break;
                }
            }
        }
    }
    catch (ex) {
        console.log("Widget.parseData: " + ex);
        console.log(ex.stack);
    }
};

/***
 * parseDataIntoPairs()
 * We need to parse the @AAA=Bbbb@CCC=Dddd data into an array.  We do this by stripping
 * any cr/lf/tab characters then replace the @ with a lf and = with a tab using a regular
 * expression so we don't accidentally replace @ or = as part od the data.  This makes it
 * easy to pull apart using split() functions to build up the array.
 */

Widget.prototype.parseDataIntoPairs = function Widget_prototype_parseDataIntoPairs() {
    var widgetparams = [];

    if( this.widgetData != undefined && this.widgetData.length > 0 ) {
        this.widgetData.replace(/[\n\r\t]/g, "")
                       .replace( /[@]([^@=a-z]*)[=]/g, "\n$1\t" )
                       .split("\n")
                       .forEach( function(macro) {
                               if( macro.length > 0 ) {
                                   var pair = macro.split("\t");
                                   if( pair.length === 2 ) {
                                       widgetparams.push({ "key": pair[0], "value": pair[1] });
                                   } else {
                                       console.log("Widget.parseDataIntoPairs() ERROR in macro: " + macro);
                                   }
                               }
                           });
    }

    return widgetparams;
}

function scrollSwitch(gridName, pagerName, coldata, elid) {
    $("#" + gridName).jqGrid('GridUnload');
    $('#' + pagerName).remove();
    $('#' + gridName).remove();
    var tableID = $("#" + elid).data("tableID");
    var tableHash = $("#" + elid).data("tableHashKey");
    var scroll;
    if (coldata.virtualScroll !== undefined) {
        coldata.virtualScroll = !coldata.virtualScroll;
    } else {
        if (appx_session.gridpropscache[tableHash] === undefined || appx_session.gridpropscache[tableHash].virtualScroll === undefined) {
            scroll = appx_session.getProp("gridVirtualScroll");
        } else {
            scroll = appx_session.gridpropscache[tableHash].virtualScroll
        }
        coldata.virtualScroll = !scroll;
    }
    createGridMongo(coldata, elid);
}

/*
**Function to reset table to default parameters
**
**@param gridName: Element ID of grid
**@param pagerName: Element ID of pager
**@param coldata: Column Data
**@param elid: Element ID of actual table widget
*/
function gridSetDefaults(gridName, pagerName, coldata, elid) {
    $("#" + gridName).jqGrid('GridUnload');
    $('#' + pagerName).remove();
    $('#' + gridName).remove();
    var tableID = $("#" + elid).data("tableID");
    coldata.colModel = appx_session.tableDefaults[tableID].colModel;
    coldata.scrollPosition = null;
    coldata.virtualScroll = appx_session.getProp("gridVirtualScroll");
    delete coldata.lastSortColumns;
    delete coldata.lastSortName;
    delete coldata.lastSortOrder;
    delete coldata.selectedKeys;
    delete coldata.colMapNames;
    createGridMongo(coldata, elid);
}

/*
**Function to create pop-up dialog box with table option
**buttons.
**
**@param coldata: Column Data
**@param elid: Element ID of actual table widget
**@param gridName: Element ID of grid
**@param pagerName: Element ID of pager
*/
appx_session.tableOptions = function (coldata, elid, gridName, pagerName, tableID) {
    var el = $("#" + elid);
    var table = $("#" + gridName);
    var buttons;
    var $btnDiv = $("<div title='" + appx_session.language.tooltips.tableOptions + "'>");
    $("<div id='table-buttons-message-div'>").append("<span id='table-buttons-message-span'>").appendTo($btnDiv)
    $btnDiv.appendTo(el);
    if (coldata.TSPO == true) {
        $("<button id='table-paging' class='table-buttons' title='" + appx_session.language.tooltips.tablePaging + "'>").click(function $_click() {
            scrollSwitch(gridName, pagerName, coldata, elid);
        }).append($("<span class='table-buttons-span ui-icon ui-icon-newwin'>")).appendTo($btnDiv);
    }
    if (coldata.TSTR == true) {
        $("<button id='table-reset' class='table-buttons' title='" + appx_session.language.tooltips.tableReset + "'>").click(function $_click() {
            gridSetDefaults(gridName, pagerName, coldata, elid);
        }).append($("<span class='table-buttons-span ui-icon ui-icon-arrowreturn-1-s'>")).appendTo($btnDiv);
    }
    if (coldata.TSCC == true) {
        $("<button id='table-column-chooser' class='table-buttons' title='" + appx_session.language.tooltips.tableColumns + "'>").click(function $_click() {
            $("#" + gridName).jqGrid('columnChooser');
        }).append($("<span class='table-buttons-span ui-icon ui-icon-grid'>")).appendTo($btnDiv);
    }
    if (coldata.TSLS == true) {
        $("<button id='table-save' class='table-buttons' title='" + appx_session.language.tooltips.tableSave + "'>").click(function $_click() {
            var tableData = {};
            var colModel = table.getGridParam("colModel");
            var colMap = table.getGridParam("remapColumns");
            if (colModel[0].name === "rn") {
                tableData.colModel = colModel.slice(2);
                tableData.colMap = colMap.slice(0, colMap.length - 2);
            } else {
                tableData.colModel = colModel.slice(1);
                tableData.colMap = colMap.slice(0, colMap.length - 1);
            }
            tableData.filters = table.getGridParam("postData").filters;
            tableData.lastSortName = table.getGridParam("postData").lastSortName;
            tableData.lastSortOrder = table.getGridParam("postData").lastSortOrder;
            tableData.selected = table.getGridParam("selarrrow");
            tableData.virtualScroll = table.getGridParam("scroll");
            tableData.scrollTop = table.closest(".ui-jqgrid-bdiv").scrollTop();
            tableData.tableID = el.data("tableID");
            tableData.tableHash = el.data("tableHashKey");
            tableToMongo(tableData, true);
            $("#table-buttons-message-span").text(appx_session.language.tooltips.tableSaved);
        }).append($("<span class='table-buttons-span ui-icon ui-icon-disk'>")).appendTo($btnDiv);
    }
    $btnDiv.dialog({
        open: function $_dialog_open(event, ui) {
            $(this).parent().css({
                "z-index": 19999,
                "width": "325px"

            });
            $(this).css({
                "z-index": 19999,
                "width": "98%"
            });
            $(".ui-dialog :button").blur();
        },
        close: function $_dialog_close() {
            $(this).dialog("destroy").remove();
            $("#table_options_button").blur();
        },
        buttons: {
            Finished: function (coldata) {
                var elid = $("table.ui-jqgrid-btable").attr("id").substring($("table.ui-jqgrid-btable").attr("id").indexOf("_") + 1);
                var colModel = $($("table.ui-jqgrid-btable")).getGridParam("colModel");
                var colMap = $($("table.ui-jqgrid-btable")).getGridParam("remapColumns");
                if (colModel[0].name === "rn") {
                    appx_session.currenttabledata[elid].colModel = colModel.slice(2);
                    appx_session.currenttabledata[elid].colMap = colMap.slice(0, colMap.length - 2);
                } else {
                    appx_session.currenttabledata[elid].colModel = colModel.slice(1);
                    appx_session.currenttabledata[elid].colMap = colMap.slice(0, colMap.length - 1);
                }
                $(this).dialog("close");
            }
        }
    });
}


function createGridMongo(coldata, elid) {
    AppxTable.createGridMongo( elid );
}

function createWidgetTagObject() {
    appx_session.createWidgetTag[WIDGET_TYPE_BUTTON] = function widget_button(widget, $tag, item) {
        var command = widget.wCommand;
        if (command === null && widget.wCommandValueAdjusted !== null) {
            command = widget.wCommandValueAdjusted;
        }

        $tag = $("<button type='button'>").css({
            "margin": "0",
            "padding": "0"
        });

        $tag.addClass("button")
            .data("row", widget.wPositionY)
            .data("col", widget.wPositionX);
        if (arguments.length > 2) {
            if (widget.wLabel == null && item.data != null) {
                widget.wLabel = item.data;
            }
        }
        if (command != null) {

            if (command === OPT_WHATS_THIS) {
                $tag.addClass("appx-title-button-help");
            }
            else {
                $tag.attr("id", addClientId("widget_sac_" + command, widget.wClientId));
                $tag.click(function $_click() {
                    var opt = parseInt(getClientId(this.id).substring(11));
                    if ((opt >= 250 && opt <= 255) || $(this).hasClass("setMoveCursor")) {
                        var col = $(this).data("col");
                        var row = $(this).data("row");
                        if (col && row) {
                            appxPutCursor(col, row);
                        }
                    }
                    appxwidgetcallback(getClientId(this.id).substring(11));
                });
            }
        }
        if (widget.wSetMoveCursor) {
            $tag.addClass("setMoveCursor");
        }
        if (!widget.wBorder) widget.wBorder = BORDER_BEVEL_RAISED;
        return $tag;
    }
    appx_session.createWidgetTag[WIDGET_TYPE_COLOR_CHOOSER] = function widget_color(widget, $tag, item) {
        $tag = $("<div>");
        $tag.addClass("appxcolorpickerwrapper");
        var cp = $("<input type='text' class='appxitem'>");
        $(cp).addClass("appxcolorpicker");
        var ic = $("<img src='" + appxClientRoot + "/images/colorpicker.jpg' />").css({
            "position": "absolute",
            "right": "0px",
            "top": "2px",
            "z-index": 100000
        });
        $tag.append(cp);
        $tag.append(ic);
        return $tag;
    }
    appx_session.createWidgetTag[WIDGET_TYPE_LABEL] = function widget_label(widget, $tag) {
        $tag = $("<div>");
        $tag.addClass("label");
        $tag.attr("id", addClientId("widget_sac_" + widget.wPositionX + "_" + widget.wPositionY, widget.wClientId));
        return $tag;
    }
    appx_session.createWidgetTag[WIDGET_TYPE_CHECK_BOX] = function widget_checkbox(widget, $tag, item) {
        /* Bug #4415: Sanitize the value of checkbox*/
        //Note: appx6 sends 4 characters ("Y   ") as the value, so we need to only check the first character until that gets resolved
        if(item.data.charAt(0) == "y" || item.data.charAt(0) == "Y" || item.data.charAt(0) == "1"){
            item.data = "1";
        }
        else if(item.data.charAt(0) == "n" || item.data.charAt(0) == "N" || item.data.charAt(0) == "0"){
            item.data = "0";
        }
// We hide the actual checkbox and overlay it with a span element that looks like a checkbox so the checkbox style could be controlled across all browsers
        if(!appxIsModifiable( item )){
            var indeterminateCheckbox = false;
            var $CheckboxTag;
            var disabledCheckbox = "<input disabled='true' type='checkbox' ";
            if (item.data == "0" ) {
                disabledCheckbox += "value='0' ";
            }
            else if(item.data == "1"){
                disabledCheckbox += "value='1' checked='checked' ";
            }
            else{
                indeterminateCheckbox = true;
            }
            disabledCheckbox += "class='item_with_widget appxitem notranslate appxfield disabled' style='position: absolute; top: 3px; height: 10px; font-size: 13.36px; overflow: hidden; white-space: pre;' >";
            var $CheckboxTag = $(disabledCheckbox);
            if(indeterminateCheckbox == true){
                $CheckboxTag.prop('indeterminate', true);
            }
            $tag = $("<label class='checkbox-label disabled' ></label>");
            $tag.append($CheckboxTag);
            $tag.append("<span class='checkbox-custom rectangular' ></span> ");
        } 
        else {
            //$tag = $("<input type='checkbox'>");

            var enabledCheckbox = "<input type='checkbox' ";
            if (item.data == "0" ) {
                enabledCheckbox += "value='0' ";
            }
            else if(item.data == "1"){
                enabledCheckbox += "value='1' checked='checked' ";
            }
            else{
                indeterminateCheckbox = true;
            }
            enabledCheckbox += "class='item_with_widget appxitem notranslate appxfield' style='position: absolute; top: 3px; height: 10px; font-size: 13.36px; overflow: hidden; white-space: pre;' >";
            $CheckboxTag = $(enabledCheckbox);
            if(indeterminateCheckbox == true){
                $CheckboxTag.prop('indeterminate', true);
            }
            $tag = $("<label class='checkbox-label' ></label>");
            $tag.append($CheckboxTag);
            $tag.append("<span class='checkbox-custom rectangular' ></span> ");

        }
        if (item.data == "1") {
            $tag.prop("checked", true);
            $tag.data("checked", 2);
            $CheckboxTag.prop("checked", true);
            $CheckboxTag.data("checked", 2);

        }
        else if (item.data == "0") {
            $tag.prop("checked", false);
            $tag.data("checked", 0);
            $CheckboxTag.prop("checked", false);
            $CheckboxTag.data("checked", 0);
        }
        else {
            $tag.prop("indeterminate", true);
            $tag.data("checked", 1);
            $CheckboxTag.prop("indeterminate", true);
            $CheckboxTag.data("checked", 1);
        }

        $tag.val(item.data);
        return $tag;
    }
    appx_session.createWidgetTag[WIDGET_TYPE_LISTBOX] = function widget_listbox(widget, $tag, item) {
        return $("<select data='" + item.data + "'>").val(item.data).addClass("appx-listbox");
    }
    appx_session.createWidgetTag[WIDGET_TYPE_PICTURE] = function widget_picture(widget, $tag) {
        return $("<div>");
    }
    appx_session.createWidgetTag[WIDGET_TYPE_BOX] = function widget_box(widget, $tag) {
        return $("<fieldset>").css({
            "margin": "0",
            "text-align": "left"
        });
    }
    appx_session.createWidgetTag[WIDGET_TYPE_LINE] = function widget_line(widget, $tag) {
        return $("<div>");
    }
    appx_session.createWidgetTag[WIDGET_TYPE_PROGRESS_BAR] = function widget_bar(widget, $tag, item) {
        $tag = $("<div>").progressbar({
            value: parseInt(item.data)
        });
        $tag.find(".ui-progressbar-value").height(item.size_rows * appx_session.rowHeightPx);
        $tag.find(".ui-progressbar-value").css({
            "background": "none",
            "background-color": widget.wColorFg
        });
        return $tag;
    }
    appx_session.createWidgetTag[WIDGET_TYPE_PASSWORD] = function widget_password(widget, $tag, item) {
        return $("<input type='password'>").val(item.data);
    }
    appx_session.createWidgetTag[WIDGET_TYPE_HTML_EDITOR] = function widget_editor(widget, $tag) {
        $tag = $("<div>").css({
            "padding": "0"
        }); //remove extra width
        $tag.html(item.data);
        $tag.addClass("ckeditor");
        return $tag;
    }
    appx_session.createWidgetTag[WIDGET_TYPE_HTML_VIEWER] = function widget_viewer(widget, $tag, item) {
        $tag = $("<div>").css("padding", "0"); //remove extra width
        $tag.html(item.data);
        $tag.addClass("appx-html-viewer");
        switch (widget.wHtmlViewerType) {
            case "flash":
                $tag = $("<object data='" + item.data + "'></object>");
                break;
            case "media":
                $tag = $("<embed src='" + item.data + "'></embed>");
                break;
            case "view":
            case "browse":
                if (item.data.indexOf("http") == 0) {
                    $tag = $("<iframe src='" + item.data + "'></iframe>");
                } else {
                    $tag = $("<iframe src='" + item.data + "' srcdoc='" + item.data + "'></iframe>");
                }
                break;
            case "edit":
            case "inline":
            case "autoedit":
                $tag = $("<textarea>");
                $tag.val(item.data);
                $tag.addClass("ckeditor");
                if(widget.wHtmlViewerType == "inline"){
                    $tag.attr("decoration","no");
                }
                else{
                    $tag.attr("decoration","yes");
                }
                break;
        }
        return $tag
    }
    appx_session.createWidgetTag[WIDGET_TYPE_FLASH_PLAYER] = function widget_flash(widget, $tag) {
        //can also use <embed></embed> see http://www.w3schools.com/html/html_object.asp
        return $("<object data='http://www.w3schools.com/html/bookmark.swf'></object>");
    }
    appx_session.createWidgetTag[WIDGET_TYPE_MEDIA_PLAYER] = function widget_media(widget, $tag) {
        if (widget.type == "video") {
            $tag = $('<video><source src="http://www.w3schools.com/tags/movie.mp4" type="video/mp4">Your browser does not support the video tag.</video>');
        }
        if (widget.type == "audio") {
            $tag = $('<audio controls><source src="http://www.w3schools.com/tags/horse.mp3" type="audio/mpeg">Your browser does not support the audio element.</audio>');
        }
        return $tag;
    }
    appx_session.createWidgetTag[WIDGET_TYPE_DATE_CHOOSER] = function widget_date(widget, $tag, item, longdata) {
        $tag = $("<div>").addClass("appxdatefield");

        /*Make sure we have data before trying to process it*/
        if (item.rawdata.length > 0) {
            if (!longdata) {
                longdata = parseItemLongData(item.rawdata);
            }
            var i = parseItemDateData(longdata);
            item.data = i.data;
            $(i.dv[0]).attr("id", "appxitem_" + item.pos_col + "_" + item.pos_row);
            $(i.dv[0]).on("focus", function $_onFocus() {
                var ida = getClientId($(this).attr("id")).split('_');
                logca("item focus: " + ida[1] + "." + ida[2]);
                appxPutCursor(ida[1], ida[2]);
                $(this).select();
            });
            $tag.append(i.dv);
            $tag.append(i.df);
        }
        return { tag: $tag, longdata: longdata };
    }
    appx_session.createWidgetTag[WIDGET_TYPE_TABLE] = function widget_table(widget, $tag) {
//        widget.wSizeH -= 1;
        var widgetData = widget.widgetData.split("@");
        var widgetSHS;
        var widgetSFIK;
        var widgetSPCB = "";
        var widgetRowCol = widget.wPositionY + "_" + widget.wPositionX;
        for (var i = 0; i < widgetData.length; i++) {
            if (widgetData[i].indexOf("SHS=") !== -1) {
                widgetSHS = widgetData[i].substring(4);
            }
            if (widgetData[i].indexOf("SFIK=") !== -1) {
                widgetSFIK = widgetData[i].substring(5);
            }
            if (widgetData[i].indexOf("SPCB=") !== -1) {
                widgetSPCB = widgetData[i].substring(5);
            }
        }

        var tableID = widgetSHS + "_" + widgetSFIK + "_" + widgetRowCol;
        $tag = $("<div>")
            .addClass("appxtablewidget")
            .attr("id", addClientId("appxitem_" + widget.wPositionX + "_" + widget.wPositionY + "_" + widgetSHS + "_" + widgetSPCB, widget.wClientId))
            .data("action", {
                "command": widget.wCommand,
                "command2": widget.wCommand2
            })
            .data("row", widget.wPositionY)
            .data("col", widget.wPositionX)
            .data("tableID", tableID)
            .data("TCSV", widget.tableShowCsvOption)
            .data("TSPO", widget.tableShowPageOption)
            .data("TSCC", widget.tableShowColChooser)
            .data("TSLS", widget.tableShowLayoutSave)
            .data("TSTR", widget.tableShowTableReset)
            .data("TSTRF", widget.tableShowTableRefresh)
            .data("TSTS", widget.tableShowTableSearch);

        return $tag;
    }
    appx_session.createWidgetTag[WIDGET_TYPE_TEXT_AREA] = function widget_textarea(widget, $tag, item) {
        //remove extra width
        $tag = $("<textarea>").css("padding", "0");
        appxSetModifiableCapable(item, true);

        /*When placing data into element replace html <br> tags
        **with valid line breaks*/
        $tag.val(item.data.replace(/\<br \/\>|\<br\>|\<br\/\>/gi, "\r\n"));
        return $tag;
    }
    appx_session.createWidgetTag[WIDGET_TYPE_RAW_TEXT] = function widget_rawtext(widget, $tag, item) {

        if (appxIsDate(item) && appxIsModifiable(item)) {
            $tag = appxcreateformatitem(item);
        }
        else {
            if (item.size_rows > 1) {
                $tag = $("<textarea>").css("padding", "0"); //remove extra width
                if (!appxIsWordWrap(item)) {
                    $tag.addClass("appx-alpha-field");
                }
            } else {
                $tag = $("<input type='text'>");
            }
            appxSetModifiableCapable(item, true);
            if (item.type == ELEM_LOG) {
                item.data = appxLogicToAlpha(item.data);
            }

            if (!appxIsMasked(item)) {
                $tag.val(item.data.replace("\n", " \n"));
            }

        }
        return $tag;
    }
    appx_session.createWidgetTag[WIDGET_TYPE_ROWTEXT] = function widget_rowtext(widget, $tag) {
        if (widget.wPositionY > 1) {
            widget.wLabel = "<pre>" + widget.wLabel + "</pre>";
            widget.wColorFg = "black";
            widget.wFont = "Dialog";
            $tag = $("<div>");
            $tag.addClass("rowtext");
            if (widget.wLabel.length > 1 && widget.wLabel[0] == '=')
                $tag.addClass("ColHdgSep");
            $tag.attr("id", addClientId("widget_sac_" + widget.wPositionX + "_" + widget.wPositionY, widget.wClientId));
        }
        return $tag;
    }
    appx_session.createWidgetTag[WIDGET_TYPE_SLIDER] = function widget_slider(widget, $tag, item) {
        $tag = $("<div>");
        $tag.addClass("noUiSlider");
        //need some padding for the slider
        var paddedbox = $("<div>").css({
            "padding": "10px"
        });

        //create the slider
        var mslider = $("<div>").addClass('slider');

        /*adding element attributes that are accessed when processing
        **element in apply styles to actually create slider*/
        mslider.attr("data-value", parseInt(item.data));
        mslider.attr("data-min", widget.wMinValue);
        mslider.attr("data-max", widget.wMaxValue);
        mslider.attr("data-tickMajor", widget.wTickMajor);
        mslider.attr("data-tickMinor", widget.wTickMinor);
        mslider.attr("data-tickShow", widget.wPaintTicks);
        mslider.attr("data-tickLabels", widget.wPaintTickLabels);
        mslider.attr("data-tickSnap", widget.wSnapToTicks);
        mslider.attr("data-invert", widget.wInvert);
        mslider.attr("data-modifiable", appxIsModifiable(item));
        mslider.attr("data-orientation", widget.wOrientation);

        $(paddedbox).append(mslider);
        $tag.append(paddedbox);
        return $tag;
    }
    appx_session.createWidgetTag[WIDGET_TYPE_FILE_CHOOSER] = function widget_filechooser(widget, $tag, item) {
        var backGrnd = appxClientRoot + "/images/folder.png";
        $tag = $("<input>");
        if (appx_session.localConnectorRunning === false &&
            widget.fileUseLocalConnector === true) {
            backGrnd = "";
            $tag.attr("placeholder", "File chooser disabled, please type in file path/name.");
        }
        $tag.css({
            "background": "#fff url(" + backGrnd + ") no-repeat",
            "overflow": "hidden",
            "background-position": "99% 50%",
            "border": "double 1px #555",
            "padding-right": "5px"
        });
        $tag.addClass("appxfilewrapper");
        $tag.val(item.data);
        /*If programmer wants to use the browser to upload files instead
        **of the local connector, then we create the hidden file chooser*/
        if (widget.fileUseLocalConnector === false) {
            $("#fileChooser").remove();
            $tag.addClass("DULC");
            var $hiddenChooser;

            /*File input element can either take directories or single
            **file. Same element can't do both. We use the drag & drop
            **widget property to decide which one we need to create*/
            if (widget.wDragAndDrop === "dir") {
                $hiddenChooser = $("<input type='file' webkitdirectory hidden>").css({
                    "border": "double 1px #555"
                });
            } else {
                $hiddenChooser = $("<input type='file' hidden>").css({
                    "border": "double 1px #555"
                });
            }
            $hiddenChooser.attr("id", "fileChooser");
            var $fileTarget = $tag
            $hiddenChooser.change(function $_change(e) {
                $(this).parent("form").attr("action", $(this).parent("form").attr("action") + this.files[0].name);
                var length = $(this)[0].files.length;
                /*If more than one file is selected then we change the
                **value to let the user know that multiple files were
                **selected in a directory, else we use the file name*/
                if (length > 1) {
                    $fileTarget.val("Directory with " + length + " files.");
                } else {
                    $fileTarget.val($(this)[0].files[0].name.replace(/\ /g, "_"));
                }
                $fileTarget.addClass("dirty");
                /*Block the screen with message while uploading files*/
                $("#main").block({
                    message: "<h1>Uploading file to temporary storage, please wait...</h1>",
                    baseZ: 999999,
                    fadeIn: 0,
                });
                appxReadBlob($(this).attr("id"));
            });
            $hiddenChooser.appendTo($("#main"));
        }
        return $tag;
    }
    appx_session.createWidgetTag[WIDGET_TYPE_TOGGLE_BUTTON] = function widget_togglebutton(widget, $tag, item) {
        $tag = $("<a>").addClass("togglebutton");
        if (item.data == "1") {
            $tag.addClass("down");
        }
        $tag.click(function () {
            if ($("#appx_status_mode").text() === "Chg") {
                $(this).toggleClass("down");
                $(this).addClass("dirty");
            }
        });
        return $tag;
    }
    appx_session.createWidgetTag["default"] = function widget_default(widget, $tag) {
        $tag = $("<button type='button'>").css({
            "margin": "0",
            "padding": "0"
        });

        $tag.addClass("button")
            .data("row", widget.wPositionY)
            .data("col", widget.wPositionX);
        widget.wLabel = "ERROR: No Widget Type Defined for " + widget.wLabel;
        widget.wWidgetType = WIDGET_TYPE_ERROR;
        widget.wBorder = BORDER_BEVEL_RAISED
        if (widget.size_col < 40) {
            widget.size_col = 40;
            widget.wSizeW = 40;
        }
        widget.size_row = 3;
        widget.wSizeH = 3;
        $tag.val(widget.wLabel);
        $tag.addClass("error");
        return { tag: $tag, widget: widget }
    }
}

function createOptionOverride() {
    appx_session.optionOverride["20101"] = function () {
        /*propName = "guiInterface";
          propValue = !appx_session.getProp(propName);
          appx_session.setProp(propName, propValue.toString());*/
        showPopup(false);
        return true;
    }

    appx_session.optionOverride["20102"] = function () {
        propName = "showOptionNumbers";
        propValue = !appx_session.getProp(propName);
        appx_session.setProp(propName, propValue.toString());
        return false;
    }

    appx_session.optionOverride["20103"] = function () {
        propName = "autoTabOut";
        propValue = !appx_session.getProp(propName);
        appx_session.setProp(propName, propValue.toString());
        return false;
    }

    appx_session.optionOverride["20104"] = function () {
        propName = "autoSelect";
        propValue = !appx_session.getProp(propName);
        appx_session.setProp(propName, propValue.toString());
        return false;
    }

    appx_session.optionOverride["20105"] = function () {
        /*propName = "dockingScrollbar"; ##DELETEUSERPREFS##
        propValue = !appx_session.getProp(propName);
        appx_session.setProp(propName, propValue.toString());
        */
        return false;
    }

    appx_session.optionOverride["20106"] = function () {
        showPopup(false);
        return true;
    }

    appx_session.optionOverride["20030"] = function () {
        //print setup
        showPopup(false);
        return true;
    }

    appx_session.optionOverride["20031"] = function () {
        //about
        showPopup(true);
        return true;
    }

    appx_session.optionOverride["20032"] = function () {
        appx_session.showPreferences(false);
        return true;
    }

    appx_session.optionOverride["21005"] = function () {
        var sessionflags = {};
        sendappxnewsession(appx_session.host, appx_session.port, appx_session.user, appx_session.password, appx_session.screenrows, appx_session.screencols, sessionflags);
        return true;
    }
}

const presetFontSizes = [100, 25, 33, 50, 66, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 140, 150, 175, 200, 300, 400, 500, 600, 700, 800, 900, 1000];

//Document
const BORDER_NONE = 5;
const BORDER_SIMPLE_LINE = 10;
const BORDER_SIMPLE_LINE_WIDER = 20;
const BORDER_ETCHED_SUNKEN = 30;
const BORDER_ETCHED_RAISED = 40;
const BORDER_BEVEL_SUNKEN = 50;
const BORDER_BEVEL_RAISED = 60;
const BORDER_SOFT_BEVEL_SUNKEN = 70;
const BORDER_SOFT_BEVEL_RAISED = 80;
const BORDER_IMAGE_EDITOR = 90;
const BORDER_MAX = BORDER_IMAGE_EDITOR;

//CharView
const MODE_TILE = 1;
const MODE_EXPAND = 2;
const MODE_CENTER = 3;
const MODE_N = 4;
const MODE_E = 5;
const MODE_S = 6;
const MODE_W = 7;
const MODE_NE = 8;
const MODE_NW = 9;
const MODE_SE = 10;
const MODE_SW = 11;
/*const MODE_EXPAND_PROP         = 12;
  const MODE_MENU_ITEM           = 13;
  const MODE_TOOL_BUTTON         = 14;
  const MODE_WINDOW_TITLE        = 15;*/

const TOKENIZE_WIDGET_TYPE_BUTTON = 1;
const TOKENIZE_WIDGET_TYPE_MENU = 2;
const TOKENIZE_WIDGET_TYPE_MENUHDR = 3;
const TOKENIZE_WIDGET_TYPE_BOX = 4;
const TOKENIZE_WIDGET_TYPE_ITM = 5;

const WIDGET_PRNT_TYPE_FRAME = 2;
const WIDGET_PRNT_TYPE_IMAGE = 3;
const WIDGET_PRNT_TYPE_ITEM = 5;
const WIDGET_PRNT_TYPE_WIDGET = 6;
const WIDGET_PRNT_TYPE_CHILD = 8;

const WIDGET_SEP_BEFORE = 1;
const WIDGET_SEP_AFTER = 2;

const WIDGET_TYPE_NONE = 0;
const WIDGET_TYPE_BUTTON = 1;
const WIDGET_TYPE_LABEL = 2;
const WIDGET_TYPE_PICTURE = 3;
const WIDGET_TYPE_BOX = 4;
const WIDGET_TYPE_LINE = 5;
const WIDGET_TYPE_RAW_TEXT = 20;
const X_WIDGET_TYPE_SPINNER = 30;
const WIDGET_TYPE_SLIDER = 31;
const X_WIDGET_TYPE_RADIO_DIAL = 32;
const WIDGET_TYPE_PROGRESS_BAR = 33;
const X_WIDGET_TYPE_SCROLL_BAR = 34;
const WIDGET_TYPE_CHECK_BOX = 40;
const X_WIDGET_TYPE_RADIO_BUTTON = 41;
const WIDGET_TYPE_LISTBOX = 42;
const WIDGET_TYPE_TOGGLE_BUTTON = 43;
const WIDGET_TYPE_PASSWORD = 50;
const WIDGET_TYPE_FILE_CHOOSER = 51;
const WIDGET_TYPE_COLOR_CHOOSER = 52;
const WIDGET_TYPE_TEXT_AREA = 59;
const WIDGET_TYPE_HTML_VIEWER = 60;
const X_WIDGET_TYPE_RTF_VIEWER = 61;
const X_WIDGET_TYPE_CODE_VIEWER = 62;
const WIDGET_TYPE_HTML_EDITOR = 63;
const WIDGET_TYPE_FLASH_PLAYER = 64;
const WIDGET_TYPE_MEDIA_PLAYER = 65;
const X_WIDGET_TYPE_WEB_BROWSER = 66;
const X_WIDGET_TYPE_BUTTON_GROUP = 70;
const WIDGET_TYPE_DATE_CHOOSER = 80;
const WIDGET_TYPE_TABLE = 90;
const WIDGET_TYPE_ROWTEXT = 91;
const WIDGET_TYPE_IMG_EDITOR_FRAME = 200;
const WIDGET_TYPE_ILF_EDITOR_FRAME = 201;
const WIDGET_TYPE_PRT_ON_SCR_FRAME = 202;
/*Widget type specifically for use showing errors in the HTML Client */
const WIDGET_TYPE_ERROR = 8899;

const WIDGET_USAGE_MENU = 1;
const WIDGET_USAGE_TOOLBAR = 2;
const WIDGET_USAGE_POPUP = 4;

createWidgetTagObject();
createOptionOverride();

