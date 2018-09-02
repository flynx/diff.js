/**********************************************************************
* 
*
*
**********************************************************************/
((typeof define)[0]=='u'?function(f){module.exports=f(require)}:define)
(function(require){ var module={} // make module AMD/node compatible...
/*********************************************************************/

var diff = require('./diff')
var {
	ANY,
	BOOL, NUMBER, STRING, ARRAY, FUNCTION,
	OR, AND, NOT,
	AT, OF, IN,

	EMPTY, NONE,
} = diff



/*********************************************************************/
// XXX need better mismatch checking -- ideally stating the exact spot
// 		where we did not match...
//

var VALUE =
module.VALUE = OR(
	EMPTY,
	NONE,
	ANY)


var CHANGE =
module.CHANGE = AND(
	AT('path', ARRAY),
	// XXX optional...
	// 		...see DIFF_OBJECT's options for description...
	AT('type', OR(STRING, undefined)),
	OR(
		// A ans B...
		AND(
			AT('A', VALUE),
			AT('B', VALUE)),
		// only A...
		AT('A', VALUE),
		// only B...
		AT('B', VALUE)))


var DIFF_FORMAT_FLAT =
module.DIFF_FORMAT_FLAT = ARRAY(CHANGE) 


// XXX
var DIFF_FORMAT_TREE =
module.DIFF_FORMAT_TREE = ANY 


var DIFF_OBJECT =
module.DIFF_OBJECT = AND(
	AT('format', diff.FORMAT_NAME),
	//AT('version', STRING(/\d+\.\d+\.\d+/)),
	AT('placeholders', AND(
		// XXX must be unique ANY...
		AT('NONE', ANY),
		AT('EMPTY', ANY))),
	AT('options', AND(
 		AT('tree_diff', OR(BOOL, null)),
 		AT('keep_none', OR(BOOL, null)),
 		AT('min_text_length', OR(NUMBER, null)),
		AT('no_attributes', OR(BOOL, null)),
 		AT('NONE', OR(ANY, null)),
 		AT('EMPTY', OR(ANY, null)),
 		AT('no_length', OR(BOOL, null)),
 		AT('cmp', OR(FUNCTION, null)) )),
	AT('timestamp', NUMBER),
	OR(
		AND(
			AT('structure', 'flat'),
			AT('diff', DIFF_FORMAT_FLAT)), 
		AND(
			AT('structure', 'tree'),
			AT('diff', DIFF_FORMAT_TREE))) )



/**********************************************************************
* vim:set ts=4 sw=4 :                               */ return module })
