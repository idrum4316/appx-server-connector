
/*********************************************************************
 **
 **   server/appx-client-token.js - Client Token processing
 **
 **   This module contains code to process client tokens.
 **
 *********************************************************************/

// what_str =  "@(#)Appx $Header: /src/cvs/appxHtml5/server/appx-client-token.js,v 1.22 2017/01/03 18:38:38 jnelson Exp $";

var tokencachepending = 0;

function appxtokenhandler(x) {
    tokencachepending--;
    create_tokens(x);
}

function sendappxtoken(grp) {
    tokencachepending++;
    var ms = {
        cmd: 'appxtoken',
        args: grp,
        handler: 'appxtokenhandler',
        data: null
    };
    appx_session.ws.send(JSON.stringify(ms));
}

function create_tokens(x) {
    var cacheid = appx_session.token_groups[x.data.grp.slice(2, 4)];
    if (!appxtokengetitem(cacheid)) {
        appxtokensetitem(cacheid, JSON.stringify(x));
    }
    appx_session.token_cache[cacheid].data = JSON.parse(appxtokengetitem(cacheid));

    applyToken(cacheid);
}

/*
** Function creates HTML select menu for token group
**
** @param key: token_cache id for token group
*/
function applyToken(key) {
    var itemvals = JSON.parse(appxtokengetitem(key)).data.items;
    $("." + key).each(function () {
        if ($(this).prop("tagName") == "SELECT" && !$(this).hasClass("appx-local-list")) {
            var sel = $(this);
            $(this).html("");
            if ($(this).hasClass("appx-nullok"))
                $(this).append("<option></option>");
            $.each(itemvals, function (i, val) {
                var ov = ab2str(val.data).trim();
                var frag = $('<option></option>').val(ov).html(ov);
                sel.append(frag);
            });
        }
        $(this).val($(this).attr("data"));
    });
}

function setappxcombo(key) {
    $("." + key).autocomplete({
        source: ["c", "java", "php", "coldfusion", "javascript", "asp", "ruby"]
    });
}

// We need to not rely on localStorage for our token lists. If we
// fill up localStorage the client still needs to present tokens. So
// we need to attempt to store and retrieve tokens in localStorage
// but actually fill the token list in the UI from memory.  If we
// can't cacahe the values in localStorage we can still fetch them
// from memory or again from the server.
var appxtokencache = {};

function appxtokengetitem(key) {
    var result = appxtokencache[key];
    /*
        if (!result) {
        result = localStorage.getItem(key);
        if (result) {
            appxtokencache[key] = result;
        }
        }
    */
    return result;
}

function appxtokensetitem(key, data) {
    appxtokencache[key] = data;
    //localStorage.setItem(key,data);
}

