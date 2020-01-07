/*********************************************************************
 **
 **   server/appx-client-table.js - Everthing needed for table processing
 **
 **   This module contains code used to process a table object.
 **
 *********************************************************************/
/**
 * AppxTablePrefs - These are user preferences for the a table that are stored
 * persistently.  They are used any time in the future when this table is
 * displayed.  We don't always actually save these setting perminently.  We only
 * save them to persistnet storage if the user asks to save them.  Otherwise they
 * just exist during the life of this table in the Appx process stack.
 */
var AppxTablePrefs = /** @class */ (function () {
    function AppxTablePrefs() {
    }
    return AppxTablePrefs;
}());
/**
 * AppxTableTransient - These are temporary attributes of a table that is currently
 * being displayed.  We need to remember these settings as long as this instance of
 * this table exists in the Appx session.  That way if the user navigates to a child
 * process and returns back we can draw the table exacly like the user saw it last.
 */
var AppxTableTransient = /** @class */ (function () {
    function AppxTableTransient() {
    }
    return AppxTableTransient;
}());
// ****************************************************************************************************
// *
// *    M a i n   C l a s s   D e f i n i t i o n  
// *
// ****************************************************************************************************
/**
 * AppxTable - This class contains everything needed to interface Appx Table widgets
 * with the jqGrid table code.  It automatically takes care of:
 *
 *  --  Creating and caching instances of itself
 *  --  Managing server data, widget data, user prefs, and transient data
 *  --  Storing persistent user data to the server
 *  --  Cleaning up old instances when they go out of scope
 */
var AppxTable = /** @class */ (function () {
    function AppxTable(tableHashKey) {
        this._pulledFromSrv = false;
        this._tableHashKey = tableHashKey;
        this._init();
        this._prefsSrvSnap = JSON.stringify(this._prefsData);
    }
    AppxTable.prototype._init = function () {
        this._prefsData = new AppxTablePrefs();
        this._transData = new AppxTableTransient();
        this._transData.pendingXHR = 0;
    };
    // ============================================================
    // Protected Static Methods
    // ============================================================
    AppxTable.pad = function (data, len) {
        // @ts-ignore - TS does not like .repeat() on a string constant
        var pad = " ".repeat(len);
        return ("" + data + pad).substring(0, len);
    };
    AppxTable.dlog = function (msg, appxTable) {
        var pad = AppxTable.pad;
        if (appxTable) {
            console.log(pad(appxTable._appxElemId, 20) +
                " - " + pad(msg, 40) +
                " - pendingTables=" + pad(appx_session.pendingTables, 2) +
                ", pendingXHRs=" + pad(appxTable._transData.pendingXHR, 2) +
                ", tableLoaded=" + pad(appxTable._transData.tableLoaded, 5) +
                ", changed=" + pad(appxTable._transData.changed, 5) +
                ", screenflipped=" + pad(screenflipped, 5) +
                ", scrollPosition=" + pad(appxTable._transData.scrollPosition, 6) +
                ", lastPage=" + pad(appxTable._transData.lastPage, 4) +
                ", reuse=" + pad(appxTable._transData.reuse, 5));
        }
        else {
            console.log(msg);
        }
    };
    //  ============================================================================
    //  Manage additional grid options added to grid footer and options popup window
    //  ============================================================================
    AppxTable._addButtonsToFooter = function (appxTable, id) {
        if (appxTable._widgetData.tableShowCsvOption === undefined || appxTable._widgetData.tableShowCsvOption === true) {
            $("#newtablewidget_" + id).jqGrid('navButtonAdd', "#" + appxTable._pagerElemId, {
                caption: "",
                buttonicon: "ui-icon-document",
                onClickButton: function $_jqGrid_onClickButton() {
                    appxTable._tableToCsv();
                },
                position: "last",
                title: appx_session.language.tooltips.tableCsv,
                cursor: "pointer",
                id: "table_csv_button"
            });
        }
        if (AppxTable._haveOptionsToShow(appxTable)) {
            $("#newtablewidget_" + id).jqGrid('navButtonAdd', "#" + appxTable._pagerElemId, {
                caption: "",
                buttonicon: "ui-icon-gear",
                onClickButton: function $_jqGrid_onClickButton() {
                    AppxTable._showOptions(appxTable);
                },
                position: "last",
                title: appx_session.language.tooltips.tableOptions,
                cursor: "pointer",
                id: appxTable._optionElemId
            });
        }
        appxTable._adjustGridIconColors();
    };
    AppxTable._haveOptionsToShow = function (appxTable) {
        //        if ( appxTable._widgetData.tableShowCsvOption === undefined || appxTable._widgetData.tableShowCsvOption === true ) {
        //            return true;
        //        }
        if (appxTable._widgetData.tableShowPageOption === undefined || appxTable._widgetData.tableShowPageOption === true) {
            return true;
        }
        if (appxTable._widgetData.tableShowTableRefresh === undefined || appxTable._widgetData.tableShowTableRefresh === true) {
            return true;
        }
        if (appxTable._widgetData.tableShowColChooser === undefined || appxTable._widgetData.tableShowColChooser === true) {
            return true;
        }
        if (appxTable._widgetData.tableShowLayoutSave === undefined || appxTable._widgetData.tableShowLayoutSave === true) {
            return true;
        }
        return false;
    };
    AppxTable._showOptions = function (appxTable) {
        var el = $("#" + appxTable._appxElemId);
        var table = $("#" + appxTable._gridElemId);
        var dWidth = 30;
        var btnWidth = 73;
        var buttons;
        var $btnDiv = $("<div id='jqgrid-options-dialog' title='" + appx_session.language.tooltips.tableOptions + "'>");
        $btnDiv.appendTo(el);
        //        if ( appxTable._widgetData.tableShowCsvOption === undefined || appxTable._widgetData.tableShowCsvOption === true ) {
        //            dWidth += btnWidth;
        //            $("<button id='table-csv' class='table-buttons' title='" + appx_session.language.tooltips.tableCsv + "'>").click(function $_click() {
        //                appxTable._tableToCsv();
        //            }).append($("<span class='table-buttons-span ui-icon ui-icon-document'>")).appendTo($btnDiv);
        //        }
        if (appxTable._widgetData.tableShowPageOption === undefined || appxTable._widgetData.tableShowPageOption === true) {
            dWidth += btnWidth;
            $("<button id='table-paging' class='table-buttons' title='" + appx_session.language.tooltips.tablePaging + "'>").click(function $_click() {
                appxTable._scrollSwitch();
            }).append($("<span class='table-buttons-span ui-icon ui-icon-newwin'>")).appendTo($btnDiv);
        }
        if (appxTable._widgetData.tableShowTableRefresh === undefined || appxTable._widgetData.tableShowTableRefresh === true) {
            dWidth += btnWidth;
            $("<button id='table-reset' class='table-buttons' title='" + appx_session.language.tooltips.tableReset + "'>").click(function $_click() {
                appxTable._resetToDefaults();
            }).append($("<span class='table-buttons-span ui-icon ui-icon-arrowreturn-1-s'>")).appendTo($btnDiv);
        }
        if (appxTable._widgetData.tableShowColChooser === undefined || appxTable._widgetData.tableShowColChooser === true) {
            dWidth += btnWidth;
            $("<button id='table-column-chooser' class='table-buttons' title='" + appx_session.language.tooltips.tableColumns + "'>").click(function $_click() {
                $("#" + appxTable._gridElemId).jqGrid('columnChooser');
            }).append($("<span class='table-buttons-span ui-icon ui-icon-grid'>")).appendTo($btnDiv);
        }
        if (appxTable._widgetData.tableShowLayoutSave === undefined || appxTable._widgetData.tableShowLayoutSave === true) {
            dWidth += btnWidth;
            $("<button id='table-save' class='table-buttons' title='" + appx_session.language.tooltips.tableSave + "'>").click(function $_click() {
                appxTable._pushTablePref();
                $("#table-buttons-message-span").text(appx_session.language.tooltips.tableSaved);
            }).append($("<span class='table-buttons-span ui-icon ui-icon-disk'>")).appendTo($btnDiv);
        }
        $btnDiv.dialog({
            open: function $_dialog_open(event, ui) {
                var $msg = $("<div id='table-buttons-message-div'>").append("<span id='table-buttons-message-span'>");
                $(".ui-dialog-buttonpane").append($msg);
                appxTable._adjustGridIconColors();
                $(this).parent().css({
                    "z-index": 19999,
                    "width": Math.max(174, dWidth) + "px"
                });
                $(this).css({
                    "z-index": 19999,
                    "width": "98%"
                });
                $(".ui-dialog :button").blur();
            },
            close: function $_dialog_close() {
                $(this).dialog("destroy").remove();
                $("#" + appxTable._optionElemId).blur();
            },
            buttons: {
                Finished: function () {
                    $(this).dialog("close");
                }
            }
        });
    };
    /**
     * _getAppxSession - Return the global APPX() object instance as a properly types value.
     */
    AppxTable._getAppxSession = function () {
        return appx_session;
    };
    /**
     * _computeTableHashKey - Compute a hash key for a table based on it's widget specs.
     *
     * @param widget - The Widget instance to compute the table has key from.
     */
    AppxTable._computeTableHashKey = function (widget) {
        var tableHashKey = "pcb" + widget.wPcbId +
            "fik" + widget.wFrameImageKey +
            "sig" + widget.wHashSig +
            "r" + widget.wPositionY +
            "c" + widget.wPositionX +
            "h" + widget.wSizeH +
            "w" + widget.wSizeW;
        return tableHashKey;
    };
    AppxTable._computeTableID = function (widget) {
        var tableID = widget.wHashSig + "_" +
            widget.wFrameImageKey + "_" +
            widget.wPositionY + "_" +
            widget.wPositionX;
        return tableID;
    };
    /**
     * _getPropVirtualScroll - This will determine is the user property for virtual scrolling is turned on.
     */
    AppxTable._getPropVirtualScroll = function () {
        return AppxTable._getAppxSession().getProp("gridVirtualScroll") === true ? 1 : 0;
    };
    // ============================================================
    // Public Static Methods
    // ============================================================
    /**
     * getAppxTable - Get the instance of the AppxTable for this table hash key from our table cache.  If
     * the instance we are looking for is not in our cache then we need to create a new instance and add it
     * to the cache.
     *
     * @param tableHashKey - Table hash key of the instance we are looking for.
     */
    AppxTable.getAppxTable = function (tableHashKey) {
        if (this._initialized === false) {
            this._initialized = true;
            // We need to find out what the padding and border sizes are for table columns to use later in computing
            // the exact width for a flaot column.
            var el1 = $("<th    id='el1' class='ui-th-column ui-th-ltr ui-state-default' style='width: 40px'>");
            var el2 = $("<tr    id='el2' class='ui-jqgrid-labels ui-sortable'>").append(el1);
            var el3 = $("<thead id='el3'>").append(el2);
            var el4 = $("<table id='el4' class='ui-jqgrid-htable ui-common-table'>").append(el3);
            var el5 = $("<div   id='el5' class='ui-jqgrid-hbox'>").append(el4);
            var el6 = $("<div   id='el6' class='ui-jqgrid-hdiv ui-state-default ui-corner-top'>").append(el5);
            var el7 = $("<div   id='el7' class='ui-jqgrid-view'>").append(el6);
            var el8 = $("<div   id='el8' class='ui-jqgrid ui-widget ui-widget-content ui-corner-all' style='visibility: hidden'>").append(el7);
            $("#main").append(el8);
            AppxTable._colAddedWidthPx = 0 +
                parseInt($(el1).css("border-left-width")) +
                parseInt($(el1).css("border-right-width")) +
                parseInt($(el1).css("padding-left")) +
                parseInt($(el1).css("padding-right"));
            $(el8).remove();
        }
        var appxSession = AppxTable._getAppxSession();
        var appxTable = appxSession.appxTableList[tableHashKey];
        if (appxTable === undefined) {
            appxTable = new AppxTable(tableHashKey);
            appxSession.appxTableList[tableHashKey] = appxTable;
        }
        return appxTable;
    };
    /**
     * updateTableFromWidget - Locate and update the tables associated with this widget with new
     * widget specs.  If the AppxTable is new then it will be created automatically.
     *
     * @param widget - The Widget object for the table we want to update.
     */
    AppxTable.updateTableFromWidget = function (widget) {
        var widgetExtraData = widget.widgetExtraData;
        var tableHashKey = AppxTable._computeTableHashKey(widget);
        var tableID = AppxTable._computeTableID(widget);
        var appxTable = AppxTable.getAppxTable(tableHashKey);
        appxTable._widgetData = widget;
        appx_session.pendingTables++;
        if (widgetExtraData.widget_extra_reuse === true) {
            appxTable._transData.reuse = true;
            appxTable._transData.changed = false;
        }
        else {
            var newData = widgetExtraData.widget_extra_data;
            appxTable._transData.changed = false;
            if (JSON.stringify(newData.selectedKeys) !== JSON.stringify(appxTable._transData.selectedKeys)) {
                appxTable._transData.changed = true;
            }
            else if (newData.rowCount != appxTable._tableData.rowCount) {
                appxTable._transData.changed = true;
            }
            appxTable._tableData = newData;
            appxTable._transData.reuse = false;
            appxTable._transData.selectedKeys = undefined;
            appxTable._tableData.colMap = [];
            for (var j = 0; j < appxTable._tableData.colModel.length; j++) {
                appxTable._tableData.colMap.push(j);
            }
            appxTable._tableID = tableID;
            if (!appxTable._pulledFromSrv) {
                appxTable._pullTablePref();
                appxTable._pulledFromSrv = true;
            }
        }
        return tableHashKey;
    };
    /**
     *
     * @param id
     */
    AppxTable.updateTableFromGrid = function (id) {
        var elem = $("#" + id);
        AppxTable.getAppxTable($(elem).data("tableHashKey"))._updateTableFromGrid(elem);
    };
    AppxTable.getSelections = function (id) {
        var elem = $("#" + id);
        return AppxTable.getAppxTable($(elem).data("tableHashKey"))._getSelections();
    };
    /**
     * createGridMongo - Create (or re-create) the jqGrid instance for this table.  When the
     * placeholder div was added to the page it received a data value with the table hash key
     * of the AppxTable object that defines this table.  We use that to associate an AppxTable
     * with a div placeholder for a table in the page.
     *
     * @param id - The HTML ID of the placeholder div we want to create a jqGrid for.
     */
    AppxTable.createGridMongo = function (id) {
        setTimeout(function () {
            var elem = $("#" + id);
            AppxTable.getAppxTable($(elem).data("tableHashKey"))._createGridMongo(elem);
        }, 0);
    };
    AppxTable.prototype._reloadGrid = function () {
        var appxTable = this;
        var elem = $("#" + appxTable._appxElemId);
        var grid = $("#" + appxTable._gridElemId);
        var pager = $("#" + appxTable._pagerElemId);
        // @ts-ignore - $.jgrid does exist
        $.jgrid.gridUnload("#" + appxTable._gridElemId);
        pager.remove();
        grid.remove();
        appxTable._createGridMongo(elem);
    };
    // ============================================================
    // Protected Class Methods
    // ============================================================
    AppxTable.prototype._resetToDefaults = function () {
        var appxTable = this;
        appxTable._init();
        appxTable._reloadGrid();
    };
    AppxTable.prototype._scrollSwitch = function () {
        var appxTable = this;
        appxTable._toggleVirtualScroll();
        appxTable._reloadGrid();
    };
    AppxTable.prototype._pullTablePref = function () {
        var appxTable = this;
        var table = $("#" + appxTable._appxElemId);
        var appxSession = AppxTable._getAppxSession();
        // Setup the request to create an extract of data to a CVS file on the server
        var url = AppxTable._getAppxSession().appxDataCacheUrl.replace(/getGridData$/, "getUserPrefs");
        var xhr = new XMLHttpRequest;
        xhr.open("POST", url);
        xhr.setRequestHeader('Content-type', 'application/json');
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4 && xhr.status === 200) {
                // CSV extract is done, now let's download the results to the desktop
                var newPrefs = JSON.parse(xhr.responseText).prefData;
                appxTable._prefsSrvSnap = newPrefs;
                appxTable._adjustGridIconColors();
                if (newPrefs !== "{}") {
                    appxTable._prefsData = JSON.parse(newPrefs);
                }
            }
        };
        var postData = {
            prefType: appxSession.user + "_" + appxSession.host + "_tablePrefs",
            prefKey: appxTable._tableID
        };
        // Send the request to get everything rolling along
        xhr.send(JSON.stringify(postData));
    };
    AppxTable.prototype._adjustGridIconColors = function () {
        var appxTable = this;
        if (appxTable._prefsSrvSnap === "{}") {
            $("#" + appxTable._optionElemId).removeClass("jqgrid-options-highlight");
            $("#table-save").removeClass("jqgrid-options-highlight");
        }
        else {
            $("#" + appxTable._optionElemId).addClass("jqgrid-options-highlight");
            $("#table-save").addClass("jqgrid-options-highlight");
        }
    };
    AppxTable.prototype._pushTablePref = function () {
        var appxTable = this;
        var table = $("#" + appxTable._appxElemId);
        var appxSession = AppxTable._getAppxSession();
        appxTable._updateTableFromGrid(table);
        // Setup the request to create an extract of data to a CVS file on the server
        var url = AppxTable._getAppxSession().appxDataCacheUrl.replace(/getGridData$/, "setUserPrefs");
        var xhr = new XMLHttpRequest;
        xhr.open("POST", url);
        xhr.setRequestHeader('Content-type', 'application/json');
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4 && xhr.status === 200) {
            }
        };
        appxTable._prefsSrvSnap = JSON.stringify(appxTable._prefsData);
        appxTable._adjustGridIconColors();
        var postData = {
            prefType: appxSession.user + "_" + appxSession.host + "_tablePrefs",
            prefKey: appxTable._tableID,
            prefData: appxTable._prefsSrvSnap
        };
        // Send the request to get everything rolling along
        xhr.send(JSON.stringify(postData));
    };
    /**
    * Create a CSV export of the specified table and download it to the desktop.  This
    * will take into account user modification to the table view like sorting, filtering,
    * rearranging columns, hiding columns, etc.
    *
    * @param table: The table object to export
    */
    AppxTable.prototype._tableToCsv = function () {
        var appxTable = this;
        var table = $("#" + appxTable._gridElemId);
        var postData = table.getGridParam("postData");
        // Make sure out colModel is current in postData
        postData.colModel = table.getGridParam("colModel");
        // If we have filters we have to tell the server to use them
        if (postData.filters !== undefined && postData.filters.length > 0) {
            postData["_search"] = "true";
        }
        // Setup the request to create an extract of data to a CVS file on the server
        var url = table.getGridParam("url").replace(/getGridData$/, "getGridCsv");
        var xhr = new XMLHttpRequest;
        xhr.open("POST", url);
        xhr.setRequestHeader('Content-type', 'application/json');
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4 && xhr.status === 200) {
                // CSV extract is done, now let's download the results to the desktop
                var resp = JSON.parse(xhr.responseText);
                appxUtil_downloadUrl(appx_session.appxCacheUrl + resp.url);
            }
        };
        // Send the request to get everything rolling along
        xhr.send(JSON.stringify(postData));
    };
    AppxTable.prototype._clearSelections = function () {
        var appxTable = this;
        appxTable.selectedKeys = undefined;
        appxTable._transData.lastPage = 1;
        appxTable._transData.scrollPosition = 0;
    };
    AppxTable.prototype._getSelections = function () {
        return this.selectedKeys;
    };
    /**
     * _getPostData - Assemble a postData object from the relevant values.
     */
    AppxTable.prototype._getPostData = function () {
        var appxTable = this;
        var postData;
        if (appxTable._tableData.datalookupid != "BlankTable") {
            postData = {
                "collection": appxTable._tableData.collection,
                "datalookupid": appxTable._tableData.datalookupid,
                "collist": appxTable._tableData.collist,
                "lastSortName": appxTable._prefsData.lastSortName || [],
                "lastSortOrder": appxTable._prefsData.lastSortOrder || [],
                "search": false
            };
            if (appxTable._prefsData.filters) {
                postData.filters = appxTable._prefsData.filters;
                postData.search = true;
            }
        }
        if (appxTable._transData.tableLoaded === false && (JSON.stringify(appxTable._prefsData.lastSortName) !== JSON.stringify(["initialSort"]))) {
            var selectedKeys = appxTable.selectedKeys;
            if (selectedKeys && selectedKeys.length > 0) {
                postData.findId2 = selectedKeys[0];
            }
        }
        return postData;
    };
    /**
     *
     * @param elem
     */
    AppxTable.prototype._updateTableFromGrid = function (elem) {
        var appxTable = this;
        var grid = $("#" + appxTable._gridElemId);
        // Set prefs data we need to recreate the table view
        var newColModel = [];
        var curColModel = grid.jqGrid("getGridParam", "colModel");
        if (curColModel) {
            for (var i = 0; i < curColModel.length; i++) {
                if (curColModel[i].name !== "rn" && curColModel[i].name !== "cb") {
                    newColModel.push($.extend(true, {}, curColModel[i]));
                }
            }
            appxTable._prefsData.colModel = newColModel;
            // Set transient data we need to recreate the table view
            appxTable._transData.scrollPosition = $(elem).find('.ui-jqgrid-bdiv').scrollTop();
            // Getting page param from Grid is unrelaible here.  So compute the page based on the scrollTop offset
            appxTable._transData.lastPage = Math.floor(appxTable._transData.scrollPosition / (21 * 50) + 1);
            appxTable._prefsData.lastSortName = [grid.jqGrid("getGridParam", "sortname")];
            appxTable._prefsData.lastSortOrder = [grid.jqGrid("getGridParam", "sortorder")];
            appxTable._prefsData.colMap = grid.jqGrid("getGridParam", "remapColumns");
            // Check for prefs being set to default states and if true unset the prefs variable
            if (JSON.stringify(appxTable._prefsData.lastSortName) === JSON.stringify(["initialSort"])) {
                appxTable._prefsData.lastSortName = undefined;
            }
            if (JSON.stringify(appxTable._prefsData.lastSortOrder) === JSON.stringify(["asc"])) {
                appxTable._prefsData.lastSortOrder = undefined;
            }
            if (appxTable._prefsData.colMap === undefined || appxTable._prefsData.colMap.length === 0 || JSON.stringify(appxTable._prefsData.colMap) === JSON.stringify(appxTable._tableData.colMap)) {
                appxTable._prefsData.colMap = undefined;
            }
            // Check colModel for deviations from default colModel
            if (appxTable._prefsData.colModel && appxTable._prefsData.colModel.length === appxTable._tableData.colModel.length) {
                var prefsModel = appxTable._prefsData.colModel;
                var tableModel = appxTable._tableData.colModel;
                var j = void 0;
                var count = tableModel.length;
                var diff = false;
                for (j = 0; j < count && diff === false; j++) {
                    var keys = Object.getOwnPropertyNames(tableModel[j]);
                    var k = void 0;
                    var keyCount = keys.length;
                    for (k = 0; k < keyCount && diff === false; k++) {
                        var key = keys[k];
                        if (JSON.stringify(prefsModel[j][key]) !== JSON.stringify(tableModel[j][key])) {
                            diff = true;
                        }
                    }
                }
                if (diff === false) {
                    appxTable._prefsData.colModel = undefined;
                }
            }
        }
    };
    /**
     *
     */
    AppxTable.prototype._getPage = function () {
        var page = 1;
        if (this._transData.reuse === true || this._prefsData.filters != undefined) {
            if (this._transData.lastPage) {
                page = this._transData.lastPage;
            }
        }
        else {
            if (this._tableData.selectedRows && this._tableData.selectedRows.length > 0) {
                page = parseInt("" + (1 + ((this._tableData.selectedRows[0] - 1) / 50)));
            }
        }
        return page;
    };
    /**
     *
     */
    AppxTable.prototype._getScrollPosition = function () {
        var pos = 0;
        if (this._transData.reuse === true || (this._transData.changed !== true && this._prefsData.filters == undefined)) {
            if (this._transData.scrollPosition) {
                pos = this._transData.scrollPosition;
            }
        }
        else {
            if (this._tableData.selectedRows && this._tableData.selectedRows.length > 0) {
                var grid = $("#" + this._gridElemId);
                var bdivHeight = grid.closest('.ui-jqgrid-bdiv').height();
                var rowHeight = (pos === undefined || pos === 0) ? 21 : $("#" + grid.jqGrid('getGridParam', 'selrow')).height();
                pos = (this._tableData.selectedRows[0] - 1) * rowHeight;
                pos = pos - ((bdivHeight - rowHeight) / 2);
                if (pos < 0) {
                    pos = 0;
                }
            }
        }
        return pos < 0 ? 0 : pos;
    };
    /**
     * _createGridMongo - This is the internal implementation of the function to create
     * a jqGrid object in the current page.  We have to do all the math to set up the
     * decorations the way we want them.  Footer, scrollbars, etc.  We also have to create
     * all the event functions to process user interactions.  The grid will manage them
     * but we need to write the callback code for the grid to call.
     *
     * @param elem - This is the jquery object for the placeholder div that will receive the jqGrid.
     */
    AppxTable.prototype._createGridMongo = function (elem) {
        var appxTable = this;
        var id = $(elem).attr("id");
        appxTable._transData.tableLoaded = false;
        // Save these for later reference
        appxTable._appxElemId = id;
        appxTable._gridElemId = AppxTable._ELEM_TABLE_PREFIX + "_" + id;
        appxTable._pagerElemId = AppxTable._ELEM_PAGER_PREFIX + "_" + id;
        appxTable._optionElemId = AppxTable._ELEM_OPTION_PREFIX + "_" + id;
        appxTable._gviewElemId = "gview_" + appxTable._gridElemId;
        // Let's work out some sizes we'll need to lay out the grid correctly
        var fontSize = $('#' + appxTable._appxElemId).css("font-size");
        var rowHeightPx = parseInt(((parseInt(fontSize) * 1.76) + .5) + "px");
        var elemWidthPx = $(elem).width();
        var elemHeightPx = $(elem).height();
        var footerHeightPx = appxTable._widgetData.tableShowFooterBar === true ? 28 : 0; // 26
        var headingsHeightPx = 20; // 27
        var viewWidthPx = elemWidthPx - 2;
        var viewHeightPx = elemHeightPx - 4 - footerHeightPx + headingsHeightPx;
        var rowNumWidthChr = Math.floor(Math.log(appxTable._tableData.rowCount) * Math.LOG10E + 1);
        var rowNumWidthPx = appxTable._widgetData.tableShowRowNumbers == true ? 30 + ((Math.max(4, rowNumWidthChr) - 4) * 10) : 0;
        //      let dataWidthPx:        number = appxTable._tableData.widthcur + rowNumWidthPx; 
        var rowsHeightPx = appxTable._tableData.rowCount * rowHeightPx; //AppxTable._getAppxSession().rowHeightPx;
        var vScrollbarWidthPx = 0;
        //      let hScrollbarHeightPx: number = rowsHeightPx > viewHeightPx ? 18 : 0;
        // Let's create some HTML elements for our grid and append to our container
        $(elem).append($('<table id="' + appxTable._gridElemId + '">'));
        if (this._widgetData.tableShowFooterBar) {
            $(elem).append($('<div id="' + appxTable._pagerElemId + '" style="height: ' + footerHeightPx + 'px"></div>'));
        }
        /*If table has float column set width to resize to remaining table space*/
        var colModel = appxTable.colModel;
        var fixedIdx = -1;
        var curWidth = rowNumWidthPx + AppxTable._colAddedWidthPx;
        for (var i = 0; i < colModel.length; i++) {
            if (colModel[i].hidden !== true) {
                if (colModel[i].fixed === true) {
                    curWidth += colModel[i].width + AppxTable._colAddedWidthPx;
                }
                else {
                    fixedIdx = i;
                }
            }
        }
        if (rowsHeightPx > viewHeightPx) {
            vScrollbarWidthPx = 18;
        }
        if (fixedIdx !== -1) {
            colModel[fixedIdx].width = viewWidthPx - (curWidth + vScrollbarWidthPx + AppxTable._colAddedWidthPx);
        }
        // Let's set up the gridConfig object used to create our grid
        var gridConfig = {};
        gridConfig.shrinkToFit = false;
        gridConfig.height = elemHeightPx - 4 - footerHeightPx - headingsHeightPx;
        gridConfig.width = viewWidthPx;
        gridConfig.scrollOffset = vScrollbarWidthPx;
        gridConfig.mtype = "POST";
        gridConfig.caption = appxTable._widgetData.wLabel || "";
        gridConfig.colModel = colModel;
        gridConfig.datatype = "json";
        gridConfig.hidegrid = false;
        gridConfig.multiselect = true;
        gridConfig.rowList = [10, 20, 30, 40, 50];
        gridConfig.scroll = appxTable._getVirtualScroll();
        gridConfig.viewrecords = true;
        gridConfig.gridview = true;
        gridConfig.loadonce = false;
        gridConfig.scrollrows = false;
        gridConfig.sortname = (appxTable._prefsData.lastSortName || ["initialSort"]).slice(-1)[0];
        gridConfig.sortorder = (appxTable._prefsData.lastSortOrder || ["asc"]).slice(-1)[0];
        gridConfig.rownumbers = appxTable._widgetData.tableShowRowNumbers;
        gridConfig.postData = appxTable._getPostData();
        gridConfig.search = gridConfig.postData && gridConfig.postData.filters ? true : false;
        gridConfig.rownumWidth = rowNumWidthPx;
        gridConfig.rowNum = appxTable._prefsData.rowsPerPage || 50;
        gridConfig.url = AppxTable._getAppxSession().appxDataCacheUrl;
        gridConfig.pager = "#" + appxTable._pagerElemId;
        gridConfig.page = appxTable._getPage();
        gridConfig.sortable = function (newMap) {
            appxTable._columnMoved(this, newMap);
        };
        gridConfig.resizeStop = function (newWidth, index) {
            appxTable._columnResized(this, newWidth, index);
        };
        gridConfig.gridComplete = function () {
            appxTable._gridComplete(this);
        };
        gridConfig.loadComplete = function (data) {
            appxTable._loadComplete(this, data);
        };
        gridConfig.onSelectRow = function onSelectRow(rowid, status, e) {
            appxTable._onSelectRow(this, rowid, status, e);
        };
        gridConfig.beforeSelectRow = function beforeSelectRow(rowid, e) {
            if (appxTable._transData.clickDetect && Date.now() - appxTable._transData.clickDetect < AppxTable._DOUBLE_CLICK_TIMER) {
                // Do nothing, it's a double click
                return false;
            }
            appxTable._transData.clickDetect = Date.now();
            return appxTable._beforeSelectRow(this, rowid, e);
        };
        gridConfig.ondblClickRow = function onDblClickRow(rowid, iRow, iCol, e) {
            appxTable._onDblClickRow(this, rowid, iRow, e);
        };
        gridConfig.loadBeforeSend = function loadBeforeSend(xhr, settings) {
            appxTable._loadBeforeSend(this, xhr, settings);
        };
        // Create the jqGrid object inside the placeholder div
        var gridElem = $("#" + appxTable._gridElemId).jqGrid(gridConfig);
        // Update the grid filters from cache
        var postData = gridElem.jqGrid("getGridParam", "postData");
        if (postData) {
            if (appxTable._prefsData.filters) {
                postData.search = true;
                postData.filters = appxTable._prefsData.filters;
            }
            else {
                postData.search = false;
                postData.filters = undefined;
            }
        }
        // Hide the multiselect checkbox column that jqGrid uses to track multi-selected rows
        gridElem.jqGrid('hideCol', 'cb');
        // Adjust the heading label alignment to match the data alignment from the column model
        for (var i = 0; i < appxTable.colModel.length; i++) {
            if (appxTable.colModel[i].align) {
                // @ts-ignore - too many arguments to jqGrid() function 
                gridElem.jqGrid("setLabel", appxTable.colModel[i].name, "", { "text-align": appxTable.colModel[i].align });
            }
        }
        // Setup the footer bar with the requested options
        var gridSearchOptions = {
            left: "",
            top: "",
            drag: true,
            multipleSearch: true,
            searchOnEnter: true,
            closeAfterSearch: true,
            closeOnEscape: true,
            stringResult: true,
            beforeShowSearch: function () {
                var dialog = $(".ui-jqdialog");
                var newLeft = (elemWidthPx - dialog.width()) / 2;
                var newTop = (elemHeightPx - dialog.height()) / 2;
                dialog.css("left", newLeft + "px").css("top", newTop + "px");
                return true;
            }
        };
        // @ts-ignore - too many arguments to jqGrid() function 
        gridElem.jqGrid('navGrid', "#" + appxTable._pagerElemId, { edit: false, add: false, del: false, beforeRefresh: function () {
                appxTable._clearSelections();
                appxTable._prefsData.filters = undefined;
            } }, {}, {}, {}, gridSearchOptions);
        AppxTable._addButtonsToFooter(appxTable, id);
        // If we are contained in an Appx window that is not the active Appx process window we want to freeze the table
        if ($("#newtablewidget_" + id).closest(".appxbox").hasClass("appx-not-modifiable")) {
            // @ts-ignore - .block() is valid in this context 
            $("#newtablewidget_" + id).closest(".ui-jqgrid").block({
                "message": null,
                "overlayCSS": {
                    "backgroundColor": '#000',
                    "opacity": 0.0,
                    "cursor": null
                }
            });
        }
    };
    // ------------------------------------------------------------
    // Event callbacks used by grid
    // ------------------------------------------------------------
    /**
     * Name: BEFORE SELECT ROW
     *
     * @param elem
     * @param rowid
     * @param e
     */
    AppxTable.prototype._beforeSelectRow = function (elem, rowid, e) {
        var appxTable = this;
        // We use META click on Mac and CTRL click for other platforms to multi-select
        if (e.ctrlKey === false && e.metaKey === false && e.shiftKey === false) {
            $(elem).jqGrid('resetSelection');
            appxTable.selectedKeys = [];
        }
        // We use SHIFT click to select a range of rows
        else if (e.shiftKey) {
            // Shift Click seems to do a text selection over part of the web page, clear that here
            if (window.getSelection) {
                if (window.getSelection().empty) { // Chrome
                    window.getSelection().empty();
                }
                else if (window.getSelection().removeAllRanges) { // Firefox
                    window.getSelection().removeAllRanges();
                }
            }
            // @ts-ignore - document.selection exists in IE
            else if (document.selection) { // IE?
                // @ts-ignore - document.selection exists in IE
                document.selection.empty();
            }
            var initialRowSelect = $(elem).jqGrid('getGridParam', 'selrow');
            var InitialSelectIndex = $(elem).jqGrid('getInd', initialRowSelect);
            var CurrentSelectIndex = $(elem).jqGrid('getInd', rowid);
            $(elem).jqGrid('resetSelection');
            appxTable.selectedKeys = [];
            if (CurrentSelectIndex > InitialSelectIndex) {
                var startID = initialRowSelect;
                var endID = rowid;
            }
            else {
                var startID = rowid;
                var endID = initialRowSelect;
            }
            var shouldSelectRow = false;
            $.each($(elem).jqGrid('getDataIDs'), function (_, id) {
                if ((shouldSelectRow = (id == startID) || shouldSelectRow) && (id != rowid)) {
                    $(elem).jqGrid('setSelection', id, false);
                    appxTable.selectedKeys.push(id);
                }
                return id != endID; // This return is for the $.each() function
            });
        }
        return true;
    };
    /**
     * Name: ON SELECT ROW
     *
     * @param elem
     */
    AppxTable.prototype._onSelectRow = function (elem, rowid, status, e) {
        var appxTable = this;
        // Add or Remove the selections based on state
        if (status)
            appxTable.selectedKeys.push(rowid);
        else
            appxTable.selectedKeys = appxTable.selectedKeys.filter(function (el) { return el !== rowid; });
        // See if we have an Option to fire.  If so defer it so see if we get a double-click
        if (appxTable._transData.clickTimer == undefined && appxTable._widgetData.wCommand) {
            if ($(elem).closest(".appxbox").hasClass("appx-not-modifiable") === false && appxIsLocked() === false) {
                appxTable._transData.clickTimer = setTimeout(function clickTimer() {
                    appxTable._transData.clickTimer = undefined;
                    appxwidgetcallback(appxTable._widgetData.wCommand);
                }, AppxTable._DOUBLE_CLICK_TIMER);
            }
        }
    };
    /**
     * Name: ON DOUBLE CLICK ROW
     *
     * @param elem
     * @param rowid
     * @param iRow
     * @param e
     */
    AppxTable.prototype._onDblClickRow = function (elem, rowid, iRow, e) {
        var appxTable = this;
        if (appxTable._transData.clickTimer) {
            clearTimeout(appxTable._transData.clickTimer);
            appxTable._transData.clickTimer = undefined;
        }
        if ($(elem).closest(".appxbox").hasClass("appx-not-modifiable") === false && appxIsLocked() === false) {
            appxwidgetcallback(appxTable._widgetData.wCommand2);
        }
    };
    /**
     * Name: COLUMN MOVED
     *
     * _columnMoved - Event code for when the user drags a column to a new location.  This is
     * a long term persistent type change to the table.  So we store this value in our
     * persistent storage object.
     *
     * @param elem   - jquery element object of the table invovled in the move.
     * @param newMap - new column map after the column is moved.
     */
    AppxTable.prototype._columnMoved = function (elem, newMap) {
        this._prefsData.colMap = newMap;
    };
    /**
     * _columnResized - Event code for when the user resizes a column in the grid.  This is
     * a long term persistnet type change to the table.  So we store this value in our
     * persistent storage object.
     *
     * @param elem     - jquery element object of the table involved in the resize operation.
     * @param newWidth - New width of the column after resizing.
     * @param index    - numerica column index of the column being resized.
     */
    AppxTable.prototype._columnResized = function (elem, newWidth, index) {
        this._prefsData.colModel = $(elem).jqGrid("getGridParam", "colModel");
    };
    /**
     * Name: GRID COMPLETE
     *
     * _gridComplete - Event code for each time the grid is complete and ready to display.  This
     * fires when the grid is first loaded with data and also after every visible adjustment such
     * as loading more data, resizing a column, moving a column, altering filters, etc.
     *
     * @param elem - jquery element object of the table being loaded.
     */
    AppxTable.prototype._gridComplete = function (elem) {
        var appxTable = this;
        var selectedKeys = appxTable.selectedKeys;
        // Fix the font and line height to use parent container specs
        var fontSize = $('#' + appxTable._appxElemId).css('font-size');
        var lineHeight = $('#' + appxTable._appxElemId).css('line-height');
        $("#" + appxTable._gviewElemId + " div").css({
            "font-size": fontSize,
            "line-height": lineHeight,
            "padding-top": "0px",
            "padding-bottom": "0px"
        });
    };
    /**
     * Name: LOAD BEFORE SEND
     *
     * @param xhr
     * @param settings
     */
    AppxTable.prototype._loadBeforeSend = function (elem, xhr, settings) {
        var appxTable = this;
        var grid = $("#" + appxTable._gridElemId);
        var postData = grid.jqGrid("getGridParam", "postData");
        if (postData) {
            if (JSON.stringify(postData.filters) !== JSON.stringify(appxTable._prefsData.filters)) {
                appxTable._clearSelections();
            }
            appxTable._prefsData.filters = postData.filters;
        }
        else {
            appxTable._prefsData.filters = undefined;
        }
        if (!appxTable._transData.tableLoaded) {
            appxTable._transData.pendingXHR++;
            appxSetStatusStateText(APPX_STATE_BUSY);
        }
    };
    /**
     * Name: LOAD COMPLETE
     *
     * THis method is called every time a grid loads a block of records to display.  This
     * can be on table creating or while the user is scrolling/paging through the records.
     *
     * @param elem - This is the element containing the grid.
     * @param data - This is the context object given to us by the grid.
     */
    AppxTable.prototype._loadComplete = function (elem, data) {
        var appxTable = this;
        var selectedKeys = appxTable.selectedKeys;
        // Apply selections
        $(elem).jqGrid("resetSelection");
        for (var i = 0; i < selectedKeys.length; i++) {
            $(elem).jqGrid("setSelection", selectedKeys[i], false);
        }
        // Set the scrollTop so the selection is visible.
        if (!appxTable._transData.tableLoaded) {
            if (data.findId2RowNo && appxTable._tableData.selectedRows) {
                if (data.findId2RowNo === -1) {
                    appxTable._clearSelections();
                }
                else {
                    appxTable._tableData.selectedRows[0] = data.findId2RowNo;
                    var currentPage = $("#" + appxTable._gridElemId).getGridParam("page"); // petepete
                    if ($("#" + appxTable._gridElemId).jqGrid("getInd", selectedKeys[0]) === false && currentPage !== appxTable._getPage()) {
                        $("#" + appxTable._gridElemId).setGridParam({ page: appxTable._getPage() });
                        appxTable._reloadGrid();
                    }
                }
            }
            $(elem).closest(".ui-jqgrid-bdiv").scrollTop(appxTable._getScrollPosition());
            setTimeout(function pendingTableTimer() {
                appxTable._transData.pendingXHR--;
                if (appxTable._transData.pendingXHR == 0 && appx_session.pendingTables > 0) {
                    appxTable._transData.tableLoaded = true;
                    appx_session.pendingTables--;
                }
                if (appx_session.pendingTables === 0) {
                    if (appx_session.pendingResources.length === 0) {
                        if (Math.abs(appx_session.current_show.curraction[0] & M_WAIT) !== 0) {
                            appxSetStatusStateText(APPX_STATE_READY);
                        }
                        if (!screenflipped) {
                            appxshowscreen();
                        }
                    }
                }
            }, 500);
        }
    };
    AppxTable.prototype._toggleVirtualScroll = function () {
        var appxTable = this;
        appxTable._setVirtualScroll(appxTable._getVirtualScroll() === 1 ? 0 : 1);
        return (appxTable._getVirtualScroll());
    };
    AppxTable.prototype._getVirtualScroll = function () {
        var virtualScroll = this._prefsData.virtualScroll;
        if (virtualScroll == undefined) {
            virtualScroll = AppxTable._getPropVirtualScroll();
        }
        return virtualScroll;
    };
    AppxTable.prototype._setVirtualScroll = function (scroll) {
        if (scroll === undefined || scroll === null) {
            this._prefsData.virtualScroll = undefined;
        }
        else if (scroll > 0) {
            this._prefsData.virtualScroll = 1;
        }
        else {
            this._prefsData.virtualScroll = 0;
        }
        if (AppxTable._getPropVirtualScroll() === this._prefsData.virtualScroll) {
            this._prefsData.virtualScroll = undefined;
        }
    };
    Object.defineProperty(AppxTable.prototype, "colModel", {
        // ============================================================
        //
        // Getters and Setters
        //
        // ============================================================
        /**
         * colModel - Array of objects to define the columns of the grid
         */
        get: function () {
            if (this._prefsData.colModel !== undefined) {
                return this._prefsData.colModel;
            }
            return this._tableData.colModel;
        },
        set: function (colModel) {
            this._prefsData.colModel = colModel; // This is not a deep copy so it is shared with the caller.
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(AppxTable.prototype, "selectedKeys", {
        /**
         * selectedKeys - Array of selected rows from the grid object
         */
        get: function () {
            if (this._transData.selectedKeys !== undefined) {
                return this._transData.selectedKeys;
            }
            return this._tableData.selectedKeys;
        },
        set: function (selectedKeys) {
            this._transData.selectedKeys = selectedKeys;
        },
        enumerable: true,
        configurable: true
    });
    AppxTable.USE_NEW_CODE = true;
    AppxTable._initialized = false;
    AppxTable._colAddedWidthPx = 0;
    AppxTable._rowTotalHeightPx = 19;
    AppxTable._ELEM_TABLE_PREFIX = "newtablewidget";
    AppxTable._ELEM_PAGER_PREFIX = "pager";
    AppxTable._ELEM_OPTION_PREFIX = "option";
    AppxTable._DOUBLE_CLICK_TIMER = 250;
    return AppxTable;
}());
