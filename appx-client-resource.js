/*********************************************************************
 **
 **   server/appx-client-resource.js - Client Resource processing
 **
 **   This module contains code to process client resources.
 **
 *********************************************************************/

// what_str =  "@(#)Appx $Header$";

//RESOURCE Message Handler
//Injects an Image into the DOM with an Object URL
//(allows server to send binary image data from the server without client saving locally
// or referencing a link to the server)

// To optimize for speed we have a number of caches we work with here.
// 1) appx_session.image_cache:
//        This is a list of the resources referenced on the current screen update.
//        This lets ApplyImages() apply generated urls to those reference elements based on class names.
// 2) AppxResource.cache[]:
//        This is an in-memory list of generated resource URLs from all resources processed during this session.
//        This lets us redisplay screens without having to reload data or regenerate URLs from blobs.
//

// The flow of resources is that the screen painters "load" resources as they are encountered in the widget
// data for a screen.  The "load" function will return a unique class names that the widget elements are 
// tagged with.  The "load" function makes sure the resource is loaded and read.  It does this by looking 
// in all of it's caches and if not found sends a request to the server for the resource data.  The server
// sends these resources as Resource transactions that are processed by the "handler" function below.
// As these resources are loaded they are added to our local caches.  AppxScreen.applyImage() takes care
// of marking all screen elements that have resources with the generated URLs so they display.

function AppxResource() { }

// 
// In memory session cache for resource blob image URLs
//
AppxResource.cache = {};

//
// List of resource requests that need to be sent to the server
//
AppxResource.sendHold = [];

//
// Handler to process Resource transaction coming in from the server for resource we don't have locally yet
//
AppxResource.handler = function AppxResource_handler(x) {
    AppxResource.sendHeld();
    var logdata = JSON.stringify(x);
    var ctx = ab2str(x.data.cacheid).trim();
    var longCacheId = appx_session.pendingResources[ctx];
    if (longCacheId) {
        delete appx_session.pendingResources[ctx];
    }
    else {
        longCacheId = ab2str(x.data.cacheid).trim();
    }
    appx_session.pendingResources.length--;
    var cacheid = cleanClassName(appx_session.server + "_" + appx_session.port + "_" + ab2str(x.data.ap).trim() + "_" + ab2str(x.data.ver).trim() + "_" + longCacheId.trim());
    try {
        // If we have data then process it into a resource
        if (x.data.len > 0) {
            var dataBuffer = x.data.data; 
            // If it's a client url then we don't have to convert from a blob. Just use the url we were given.
            if (x.data.loctype == 1) {
                var idx = x.data.data.length - 1;
                while (idx >= 0 && x.data.data[idx] == 0) {
                    x.data.data[idx] = 32;
                    idx--;
                }
                var url = ab2str(x.data.data).trim();
                if (url.indexOf("/getResource/") != -1) {
                    url = appx_session.appxCacheUrl + url;
                }
                AppxResource.cache[cacheid] = url;
            }
            // Convert the blob into a url and place it in our in memory cache.
            else {
                var url = window.URL.createObjectURL(new Blob([dataBuffer]));

                if (longCacheId.length == 8) {
                    AppxResource.cache[cacheid] = url;
                }
            }
        }
        // No data means no resource, show a broken image url
        else {
            if (x.data.state == 10)
                var url = "";
            else
                var url = "" + appxClientRoot + "/images/missing.png";
        }
    }
    catch (ex) {
        console.log("image exception 1 = " + ex);
        console.log(ex.stack);
        if (x.data.state == 10)
            var url = "";
        else
            var url = "" + appxClientRoot + "/images/missing.png";
    }
    /*If we have a CKEDITOR config file and an CKEDITOR instance was not
**already loaded from cache then we call function to create instance*/
    if (Object.getOwnPropertyNames(CKEDITOR.instances).length === 0 && appx_session.pendingResources.length === 0) {
        appxApplyStylesEditor();
    }
    if (x.data.state == 10) {
        if (appx_session.pendingResources.length == 0 && appx_session.pendingTables === 0 ) {
            appxSetStatusStateText(APPX_STATE_READY);

            if (!screenflipped) {
                appxshowscreen();
            }
        }
    } else {
        // Force the image to load and apply it once loaded
        try {
            img = new Image();
            img.src = url;
            if (appx_session.image_cache.hasOwnProperty(cacheid)) {
                appx_session.image_cache[cacheid].url = url;
                img.onload = applyimage(cacheid);
            }
            if ((Math.abs(appx_session.current_show.curraction[0] & M_WAIT) == 0) &&
                (appx_session.pendingResources.length == 0)) {
                sendappxshow(OPT_NULL, []);
            }
        }
        catch (ex) {
            console.log("appx-client-resource.js AppxResource.handler() failed to load " + cacheid + " image:" + ex);
            console.log(ex.stack);
            applyimage(null);
        }
    }
}

//
// Make sure resource is loaded and return a unique cacheid class name.
//
AppxResource.load = function AppxResource_load(wIcon) {
    var inMemory = true;
    var ai = wIcon.split('.');
    var bi = ai[3].split(',');
    var cache = appx_session.image_cache;
    var ctx = parseInt("0x" + bi[0]);
    var cacheid = cleanClassName(appx_session.server + "_" + appx_session.port + "_" + ai[0].replace("#", "") + "_" + ai[1] + "_" + ai[2]);
    var clientCacheId = cacheid + ai[5].split(",")[0];
    // If it's already been processed elsewhere on this screen there is nothing to do.
    if (cache[cacheid] && cache[cacheid].cacheid === clientCacheId) {
        return cacheid;
    } else if (!cache[cacheid]) {
        cache.length++;
        cache.keys.push(cacheid);
    } else {
        inMemory = false;
    }

    // Add it to the screens cache list
    cache[cacheid] = {
        "cacheid": clientCacheId,
        "url": "",
        "ctx": ctx,
        "blob": null,
        "wIcon": wIcon
    };
    // If it's not in the in memory cache try request it from the server.
    if (!AppxResource.cache[cacheid] || !inMemory) {
        AppxResource.send(wIcon);
        return cacheid;
    }

    // At this point we have a resource url in our in memory cache, use it.

    cache[cacheid].url = AppxResource.cache[cacheid];
    return cacheid;
}


AppxResource.sendHeld = function AppxResource_sendHeld(name) {
    if (AppxResource.sendHold.length > 0) {
        var ms = AppxResource.sendHold.shift();
        appx_session.ws.send(JSON.stringify(ms));
    }
}
//
// Request a resource from the server
//
AppxResource.send = function AppxResource_send(name) {
    if (name.indexOf("BV8P5XTB") > -1) { //Bug #3016
        return;
    }
    var cacheArray = name.split(",");
    /*If length != 3 then data is corrupt and server wont respond to request, so
    **don't push data or send server request*/
    if (cacheArray.length == 3) {
        var newName = name;
        var subArray = cacheArray[0].split(".");
        var ctx = cacheArray[2].split(".");
        if (subArray[2].length > 8) {
            newName = subArray[0] + "." + subArray[1] + "." + ctx[0] + "." + subArray[3] + "," + cacheArray[1] + "," + cacheArray[2];
        }
        appx_session.pendingResources[ctx[0]] = subArray[2];
        appx_session.pendingResources.length++;

        var ms = {
            cmd: 'appxresource',
            args: newName,
            handler: 'appxresourcehandler',
            data: null
        };

        AppxResource.sendHold.push(ms);

    }
}
