/*
 * Utility functions for the APPX class
 */

var StringDecoder = require('string_decoder').StringDecoder;
var decoder = new StringDecoder('utf8');

// Convert buffer to string
exports.ab2str = function(buf) {
	var str = decoder.write(new Buffer(buf));
	return str;
};