/*********************************************************************
 **
 **   server/appx-client-menu.js - Client Menu/Toolbar processing
 **
 **   This module contains code to process Appx Menus and Toolbars.
 **
 *********************************************************************/

// what_str =  "@(#)Appx $Header$";

var menugroups = [];
var menulabels = [];
var menuitems = [];
var menu = {};
var menu2 = {};

function MenuTree() {
    this.fileMenu = null;
    this.userMenu = [];
    this.optnMenu = null;
    this.helpMenu = null;
}

function MenuNode(label, widget) {
    this.label = label;
    this.widget = widget;
    this.children = [];
}

function MenuItem(label, widget) {
    this.label = label;
    this.widget = widget;
}

function mGroup(menuGroup, label, widget) {
    this.menuGroup = menuGroup;
    this.label = label;
    this.widget = widget;
    this.children = [];
}

function mChild(menuLabel, label, widget) {
    this.menuLabel = menuLabel;
    this.label = label;
    this.widget = widget;
}

function initializeMenu() {
    $("#appx-softkeys-container .toolbaritem").remove();
    $("#appx-defaulttools-container .toolbaritem").remove();
    appx_session.currentmenu = {};
    appx_session.currentmenu.groupsprocessed = [];
    appx_session.currentmenu.groups = {};
    appx_session.currentmenu.groupsprocessed.push("top_menu");
    appx_session.menucache = {};
    appx_session.menucache.currentmenuitems = appx_session.currentmenuitems;
    appx_session.menucache.currentmenu = appx_session.currentmenu;
    appx_session.currentmenuitems = {};
    appx_session.currentmenuitems.all = [];
    appx_session.currentmenuitems.toolbar = [
        [],
        [],
        []
    ];
    appx_session.currentmenuitems.dropdown = [
        [],
        [],
        []
    ];
    appx_session.currentmenuitems.popup = [
        [],
        [],
        []
    ];
    appx_session.currentmenu.block = {};
    appx_session.currentmenu.header = [];
}

//MENU Message Handler
function appxmenuhandler(x) {
    appx_session.currentmenu.block = x;
    appx_session.currentmenu.header.push(new Widget(null, null, appx_session.currentmenu.block.data.headerdata));
    //In LOCALOS for testing
    appxmenushandler(x);
}

//Menus Message Handler
function appxmenushandler(x) {
    var menu = x.data;
    var menuType = menu.type[0];
    //split menu.headerdata into vars
    var mw = new Widget(null, null, null);
    mw.widgetData = x.data.headerdata;
    var menuheader = mw.parseDataIntoPairs();
    $.each(menuheader, function $_each(k, v) {
        menuheader[v.key] = v.value;
    });
    //if use=t, reuse last menu
    if (menuheader.USE) {
        switch (menuheader.USE.trim()) {
            case "T":
                appx_session.currentmenuitems.toolbar[menuType] = appx_session.menucache.currentmenuitems.toolbar[menuType];
                appx_session.currentmenuitems.dropdown[menuType] = appx_session.menucache.currentmenuitems.dropdown[menuType];
                appx_session.currentmenuitems.popup[menuType] = appx_session.menucache.currentmenuitems.popup[menuType];
                break;
            default:
        }
    }
    else {
        if (menu.items.length > 0) {
            var i = 1;
            while (menu.items.length > 0) {
                var mx = menu.items.shift();
                mx.widget = new Widget(null, null, mx.data);
                appx_session.currentmenuitems.all.push(mx.widget);
                if (mx.widget.wUsageToolbar == true) {
                    appx_session.currentmenuitems.toolbar[menuType].push(mx.widget);

                }
                if (mx.widget.wUsagePopup == true) {
                    appx_session.currentmenuitems.popup[menuType].push(mx.widget);
                }
                if (mx.widget.wUsageMenu == true) {
                    appx_session.currentmenuitems.dropdown[menuType].push(mx.widget);
                }
            }
        }
    }
}


/*
**Function that takes 2 menus in and checks the first menus objects against the second
**menus children objects. If they are a match then it will add the second menus child
**objects children to the matching first menu object. If the same menu object is sent
**as both object parameters then the boolean parameter should be set to true. If this
**is set, then if it does find a match, after copying the objects children it will 
**delete the object from the second menu.
**
**@param mMenu: menu to place items in.
**@param mTemp: menu containing temporary items that had no group created in main menu.
**@param mTempSent: boolean to tell whether we sent in temp menu as mMenu. 
**
**@return mMenu: Object containing menu items.
**
*/
function placeMenuItems(mMenu, mTemp, mTempSent) {
    for (var tKeys in mTemp) {
        var placed = false;
        for (var mKeys in mMenu) {
            if (mMenu[mKeys].hasOwnProperty("children") && mMenu[mKeys].children.hasOwnProperty(tKeys)) {
                mMenu[mKeys].children[tKeys].children = mTemp[tKeys].children;
                if (mTempSent) {
                    delete mTemp[tKeys];
                }
                placed = true;
                break;
            }
        }
        if (!placed) {
            mMenu[tKeys] = mTemp[tKeys];
        }
    }
    return mMenu
}

/*
**Function to take an list of widgets and turn them into a nested object for
**properly displaying menus.
**
**@param m: array of widgets.
**
**@return menu: object containing menu items.
*/
function fixMenuLabelsAndGroups(m) {
    try {
        /*
        **Recursive function to search through the menu and check if an items group 
        **already exists. If group exists then it will place item in that groups
        **children. If group doesn't exist it returns false value.
        **
        **@param mMenu: menu to search through.
        **@param mGroup: group name to search for.
        **@param mLabel: name of current item.
        **
        **@return boolean: Whether group was found.
        **
        */
        function findGroup(mMenu, mGroup, mLabel) {
            found = false;
            children = mMenu.hasOwnProperty("children");
            if (mMenu.hasOwnProperty(mGroup) || (children && mMenu.children.hasOwnProperty(mGroup))) {
                if (children) {
                    if (mMenu.children[mGroup].hasOwnProperty("children")) {
                        mMenu.children[mGroup].children[mLabel] = {}
                        mMenu.children[mGroup].children[mLabel].command = m[i].wCommand;
                        mMenu.children[mGroup].children[mLabel].widget = m[i];
                    } else {
                        mMenu.children[mGroup].children = {};
                        mMenu.children[mGroup].children[mLabel] = {}
                        mMenu.children[mGroup].children[mLabel].command = m[i].wCommand;
                        mMenu.children[mGroup].children[mLabel].widget = m[i];
                    }
                } else {
                    if (mMenu[mGroup].hasOwnProperty("children")) {
                        mMenu[mGroup].children[mLabel] = {}
                        mMenu[mGroup].children[mLabel].command = m[i].wCommand;
                        mMenu[mGroup].children[mLabel].widget = m[i];
                    } else {
                        mMenu[mGroup].children = {};
                        mMenu[mGroup].children[mLabel] = {}
                        mMenu[mGroup].children[mLabel].command = m[i].wCommand;
                        mMenu[mGroup].children[mLabel].widget = m[i];
                    }

                }
                return true;
            } else {
                for (var keys in mMenu) {
                    if (keys != "widget") {
                        found = findGroup(mMenu[keys], mGroup, mLabel);
                    }
                }
            }
            return found;
        }


        /*
        **Recursive function to search through the menu and check if an item is 
        **marked as hidden. If marked then we remove item from menu.
        **
        **@param mMenu: menu to search through.
        **
        */
        function removeHidden(mMenu) {
            for (var keys in mMenu) {
                children = mMenu[keys].hasOwnProperty("children");
                widget = mMenu[keys].hasOwnProperty("widget");
                if (widget && mMenu[keys].widget.wVisible === false) {
                    delete mMenu[keys];
                } else if (children) {
                    removeHidden(mMenu[keys].children);
                }
            }
        }

        var menu = {};
        var temp = {};
        //populate menu object
        for (var i = 0; i < m.length; i++) {
            var label = m[i].wLabel;

            /*If it has group name check for group, else create item in top
            **level of menu.*/
            if (m[i].wGroupName && m[i].wGroupName != "") {
                var group = m[i].wGroupName;
                var foundMenu = false;
                var foundTemp = false;

                foundMenu = findGroup(menu, group, label);
                if (!foundMenu) {
                    foundTemp = findGroup(temp, group, label);
                }

                //If group was not found then create the group in temp object
                if (!foundMenu && !foundTemp) {
                    temp[group] = {};
                    temp[group].autoCreate = true;
                    temp[group].children = {};
                    temp[group].children[label] = {};
                    temp[group].children[label].command = m[i].wCommand;
                    temp[group].children[label].widget = m[i];
                }
            } else {
                menu[label] = {};
                menu[label].autoCreate = true;
                menu[label].command = m[i].wCommand;
                menu[label].widget = m[i];
            }
        }

        /*Call placeMenuItems. Once to make sure temp doesn't contain any objects
        **that should be nested within itself and the second time to place all the
        **temp menu objects into the menu object.*/
        temp = placeMenuItems(temp, temp, true);
        menu = placeMenuItems(menu, temp, false);

        /*Call removeHidden to check for menu items that should not be displayed*/
        removeHidden(menu);

        /*Remove any automatically added parents that have no children and add them 
        **to top level menu based on menu name it was received from*/
        for (var keys in menu) {
            if (menu[keys].autoCreate === true && ((!menu[keys].hasOwnProperty("children")) || jQuery.isEmptyObject(menu[keys].children)) && menu[keys].widget != null) {
                var menuUse = menu[keys].widget.wMenuUse;
                if (!menu.hasOwnProperty(menuUse)) {
                    menu[menuUse] = {};
                    menu[menuUse].children = {};
                }
                menu[menuUse].children[keys] = menu[keys];
                delete menu[keys];
            }
        }
    }
    catch (e) {
        console.log(e);
        console.log(e.stack);
    }
    return menu;
}

function buildMenuHTMLtree(menuNode, topLevel) {
    if ((menuNode == null || !(menuNode.hasOwnProperty("children"))) ||
        (menuNode.widget !== undefined &&
            (menuNode.widget.wVisible !== null && menuNode.widget.wVisible === false))) {
        return "";
    }
    var pCls = " class='appx-menu-item'";
    if (menuNode.widget && menuNode.widget.wEnabled === false) {
        pCls = " class='appx-menu-item appx-nav-disabled'";
    }
    var cmd = ((menuNode.widget == null || (menuNode.hasOwnProperty("children"))) ? '' : " onclick='appxwidgetcallback(" + menuNode.widget.wCommand + ")'");
    if (topLevel) {
        var wHTML = "<li" + cmd + pCls + ">" + (menuNode.widget == null ? menuNode.label : menuNode.widget.wLabel) + "<ul>";
    } else {
        var wHTML;
        if (menuNode.widget != null) {
            var shortCut = menuNode.widget.wShortcut;
            var label = menuNode.widget.wLabel;
            var shortReplace = label.replace(shortCut, "<span class='accesskeyunderline'>" + shortCut + "</span>");
            if (shortCut != null) {
                wHTML = "<li" + cmd + pCls + "> <a href='#' accesskey='" + shortCut + "' class='hasSub'>" + shortReplace + "</a><ul>";
            } else {
                wHTML = "<li" + cmd + pCls + "> <a href='#' class='hasSub'>" + label + "</a><ul>";
            }

        } else {
            wHTML = "<li" + cmd + cls + "> <a href='#' class='hasSub'>" + menuNode.label + "</a><ul>";
        }
    }
    for (var keys in menuNode.children) {
        var menuObj = menuNode.children[keys];
        if (menuObj.hasOwnProperty("children")) {
            wHTML += buildMenuHTMLtree(menuObj, false);
        }
        else {
            var cmd = null;
            var lbl = null;
            var sepbefore = false;
            var sepafter = false;
            var tbvisible = true;
            var cls = "appx-menu-item";
            var liCls = "";

            if (menuObj.widget) {
                appxWidgetCheckSelected(menuObj.widget);
                if (menuObj.widget.wSelected == true) {
                    cls = "appx-menu-item appx-menu-item-selected";
                }
                if (menuObj.widget.wEnabled === false) {
                    liCls = "appx-nav-disabled";
                }
                var tbvisible = menuObj.widget.wVisible == null ? true : menuObj.widget.wVisible;
                cmd = " onclick='appxwidgetcallback(" + menuObj.widget.wCommand + ")'";
                lbl = menuObj.widget.wLabel;
                sepbefore = menuObj.widget.wSepBefore == null ? false : true;
                sepafter = menuObj.widget.wSepAfter == null ? false : true;
                cmd = menuObj.widget.wEnabled == false ? "" : cmd;
            }
            else {
                lbl = menuObj.wLabel;
            }

            if (tbvisible) {
                var li = $("<li" + cmd + ">");
                var a = $("<a href='#'>");
                a.text(lbl);
                li.addClass(liCls);
                a.addClass(cls);
                if (liCls !== "") {
                    a.css({
                        "color": "#aaa"
                    });
                }
                
                /*Use widget handler to process widget properties*/
                if (menuObj.widget) {
                    appxwidgetshandlerprops(menuObj.widget, a);
                }
                $(li).append(a)
                if (sepbefore) $(li).addClass("sepbefore");
                if (sepafter) $(li).addClass("sepafter");
                if (menuObj.widget.wIconEnabled) {
                    $(a).addClass(AppxResource.load(menuObj.widget.wIconEnabled));
                    $(a).addClass("appx-hasbg");
                }
                wHTML += $(li)[0].outerHTML;
            }
        }
    }
    wHTML += "</ul></li>";
    return wHTML;
}

var topMenu = null;
/*
**Function to build dropdown menu using HTML
**
**@param menuTree: object containing menu items 
*/
function buildMenuHTML(menuTree) {
    var menunav = $("#appx-main-nav");
    var menuHTML = "";
    var nameSort = ["File", "Options", "Help"];

    if (topMenu == null) {
        topMenu = $("<ul>").attr("id", "topMenu").appendTo(menunav);
    }
    //Cycle through objects in top level to process
    for (var keys in menuTree) {
        var notFOH = true;

        //If object doesn't have a widget then set label to object name.
        if (!(menuTree[keys].hasOwnProperty("widget"))) {
            menuTree[keys].label = keys;
        }

        //Check if name is already in the nameSort array
        for (var i = 0; i < nameSort.length; i++) {
            if (nameSort[i] == keys) {
                notFOH = false;
            }
        }

        /*If name is not in nameSort array then we add it in. We are doing it
        **this way because we always want File to be the first menu item and 
        **Options & Help to be the last 2 menu items.*/
        if (notFOH) {
            if (keys === "Process" || keys === "Application" || keys === "System") {
                nameSort.splice(1, 0, keys);
            } else {
                nameSort.splice((nameSort.length - 2), 0, keys);
            }
        }
    }

    //Create menu html code using the nameSort array order
    for (var i = 0; i < nameSort.length; i++) {
        menuHTML += buildMenuHTMLtree(menuTree[nameSort[i]], true);
    }
    $(topMenu).append(menuHTML);
}

/*
**Function takes in command and returns function using command.
**Needed this so all callbacks didn't share same function.
**
**@param wCommand: string containing widget command
**
**@return function: function containing appxwidgetcallback function
*/
function popupMenuCallback(wCommand) {
    return function returnappxwidgetcallback() {
        appxwidgetcallback2(wCommand);
    };

}

/*
**Recursive function to populate nested items in the popup menus
**
**@param menuNode: Current level menu object
**@param childMenu: object to store children objects in
*/
function popupMenuChildren(menuNode, childMenu) {
    for (var keys in menuNode) {
        var menuObj = menuNode[keys];
        var icon = null;
        if (menuObj.widget && menuObj.widget.wSepBefore === true) {
            childMenu[keys + "sepB"] = { "name": "-----------------------------" }; 
        }
        childMenu[keys] = {
            "name": keys
        };
        if (menuObj.widget && menuObj.widget.wSepAfter === true) {
            childMenu[keys + "sepA"] = { "name": "-----------------------------" };
        }
        if (menuObj.widget && menuObj.widget.wIconEnabled) {
            icon = AppxResource.load(menuObj.widget.wIconEnabled);
        }
        if (menuNode[keys].hasOwnProperty("command")) {
            var wCommand = menuNode[keys].command.toString();
            childMenu[keys].callback = popupMenuCallback(wCommand);
            if (icon) {
                childMenu[keys].icon = icon;
            }
        }
        if (menuNode[keys].hasOwnProperty("children")) {
            childMenu[keys].items = {};
            popupMenuChildren(menuNode[keys].children, childMenu[keys].items);
        }
    }
}

/*
**Function to build popup menu. Placed in subcategory of appx_session for use
**in appx-client-screen.js
**
**@param menuTree: object containing menu items 
*/
function buildPopupMenuHTML(menuTree) {
    appx_session.currentmenuitems.popupItems = {};
    var a = appx_session.currentmenuitems.popupItems;

    /*Switch menu order so that items without groups are placed on the top.*/
    if (menuTree.hasOwnProperty(null)) {
        var tempMenu = {};
        tempMenu[null] = menuTree[null];
        for (var keys in menuTree) {
            if (keys !== null) {
                tempMenu[keys] = menuTree[keys];
            }
        }
        menuTree = tempMenu;
    }
    for (var keys in menuTree) {
        // Commented out code is if we want to add the high level menu group to the popup menu, the java client does not
        //	a[keys] = {
        //	    "name": keys,
        //	};
        //	if (menuTree[keys].hasOwnProperty("command")){
        //	    var wCommand = menuTree[keys].command.toString();
        //	    a[keys].callback = popupMenuCallback(wCommand);
        //	}

        if (menuTree[keys].hasOwnProperty("children")) {
            // Commented out code is if we want to add the high level menu group to the popup menu, the java client does not
            //	    a[keys].items = {};
            //	    popupMenuChildren(menuTree[keys].children, a[keys].items);
            popupMenuChildren(menuTree[keys].children, a);
        }
    }
}

/*
**Function to concatonate all the appx_session drop down menus into one object
**for further processing
*/
function createDropDownMenu() {
    $("ul#topMenu").empty();
    var a = [];
    var menuName = ["Process", "Application", "System"];
    for (var menuType = 2; menuType >= 0; menuType--) {
        var ddMenu = appx_session.currentmenuitems.dropdown[menuType];
        for (var i = 0; i < ddMenu.length; i++) {
            ddMenu[i].wMenuUse = menuName[menuType];
        }
        a = a.concat(ddMenu);
    }

    if (a.length > 0) {
        buildMenuHTML(fixMenuLabelsAndGroups(a));
    }
}

/*
**Function to concatonate all the appx_session popup menus into one object
**for further processing
*/
function createPopupMenu() {
    var a = [];
    for (var menuType = 2; menuType >= 0; menuType--) {
        a = a.concat(appx_session.currentmenuitems.popup[menuType]);
    }
    if (a.length > 0) {
        buildPopupMenuHTML(fixMenuLabelsAndGroups(a));
    }
}

function createToolbarMenu() {
    var tbi = [];
    //no need to fix toolbar item hierarchy
    for (var menuType = 2; menuType >= 0; menuType--) {
        var a = appx_session.currentmenuitems.toolbar[menuType];
        for (var i = 0; i < appx_session.currentmenuitems.toolbar[menuType].length; i++) {
            var widg = appx_session.currentmenuitems.toolbar[menuType][i];
            widg.aOrder = i;
            /*Get rid of any non toolbar items before pushing them into the array.
            **We are assuming that all toolbar items should have an icon.*/
            if (widg.wIconEnabled) {
                tbi.push(widg);
            }

        }
    }
    tbi.sort(function toolbarArraySortOverride(a, b) {
        if (a.wGroupName < b.wGroupName) {
            return -1;
        } else if (a.wGroupName > b.wGroupName) {
            return 1;
        } else {
            return a.aOrder - b.aOrder;
        }
    });
    var toolbarItems = {
        "over255": [],
        "under256": []
    }
    $("#toolbar").empty();
    while (tbi.length > 0) {
        var mx = {};
        mx.widget = tbi.shift();
        var tbvisible = mx.widget.wVisible == null ? true : mx.widget.wVisible;
        if (tbvisible) {
            var item = $('<div>');
            if (mx.widget.wSepBefore && mx.widget.wSepAfter) {
                item.addClass("appx-sep-before appx-sep-after");
            } else if (mx.widget.wSepBefore) {
                item.addClass("appx-sep-before");
            } else if (mx.widget.wSepAfter) {
                item.addClass("appx-sep-after");
            }

            if (mx.widget.wShortLabel) {
                $(item).html('<span class="appx-toolbar-label">' + mx.widget.wShortLabel.trim() + '</span>');
            }
            var cacheid = AppxResource.load(mx.widget.wIconEnabled);
            $(item).addClass("appxitem"); //item
            $(item).addClass("toolbaritem");
            $(item).addClass(cacheid);

            var tbenabled = mx.widget.wEnabled == null ? true : mx.widget.wEnabled;

            if (tbenabled == false) {
                $(item).addClass("tbdisabled");
            } else {
                $(item).click(function $_clickCallback() {
                    appxwidgetcallback(this.id);
                });
            }

            if (mx.widget.wColorBg !== null) {
                $(item).css("background-color", mx.widget.wColorBg);
            }
            if (mx.widget.wCommand != null && mx.widget.wCommand === OPT_WHATS_THIS) {
                $(item).addClass("appx-title-button-help");
            }
            else{
                $(item).attr("id", addClientId(mx.widget.wCommand, mx.widget.wClientId));
            }
            if (mx.widget.wTooltip) {
                $(item).prop('title', mx.widget.wTooltip);
                $(item).tooltip({
                    content: function tooltipCallback() {
                        if (typeof this.title == 'function')
                            return this.title();
                        else
                            return '';
                    }
                });
            } else if (mx.widget.wLabel) {
                $(item).prop('title', mx.widget.wLabel);
                $(item).tooltip({
                    content: function tooltipCallback() {
                        if (typeof this.title == 'function')
                            return this.title();
                        else
                            return '';
                    }
                });
            }

            if (mx.widget.wCommand > 255) {
                if (mx.widget.wcommand == 256) {
                    console.log("Creating delete");
                }
                var ic = $(item).clone();
                if (mx.widget.wCommand != null && mx.widget.wCommand === OPT_WHATS_THIS) {
                    $(item).addClass("appx-title-button-help");
                }
                else{
                    $(ic).attr("id", addClientId("sk_" + mx.widget.wCommand, mx.widget.wClientId));
                    $(ic).click(function $_clickCallback() {
                        var i = getClientId(this.id).replace("sk_", "");
                        appxwidgetcallback(i);
                    });
                }
                $(ic).css({
                    "background-color": "transparent"
                });
                
                toolbarItems.over255.push(ic);
            }
            else {
                toolbarItems.under256.push(item);
            }

        }
    }
    for (var i = 0; i < toolbarItems.over255.length; i++) {
        $("#toolbar").append(toolbarItems.over255[i]);
    }
    for (var i = 0; i < toolbarItems.under256.length; i++) {
        $("#toolbar").append(toolbarItems.under256[i]);
    }
}
