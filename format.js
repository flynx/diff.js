/**********************************************************************
* 
* This module describes the diff format and provides basic verification.
*
* XXX EXPERIMENTAL...
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
//
// XXX need better mismatch checking -- ideally stating the exact spot
// 		where we did not match and the path of fails it created...
// XXX idea: would be nice to be able to use patterns to extract values
// 		from structures (parsing)...
//
//---------------------------------------------------------------------
// Flat diff...

var VALUE =
module.VALUE = OR(
	// XXX use these taken from .placeholders...
	EMPTY,
	NONE,
	ANY)


var SIDE_VALUES =
module.SIDE_VALUES = OR(
	// A and B...
	AND(
		AT('A', VALUE),
		AT('B', VALUE)),
	// only A...
	AT('A', VALUE),
	// only B...
	AT('B', VALUE))

var CHANGE =
module.CHANGE = AND(
	AT('path', ARRAY),
	// XXX optional...
	// 		...see DIFF_OBJECT's options for description...
	AT('type', OR(STRING, undefined)),
	SIDE_VALUES)


var DIFF_FLAT =
module.DIFF_FLAT = OR(
	ARRAY(CHANGE), 
	null)


//---------------------------------------------------------------------
// Tree diff...

var BASIC_CHANGE =
module.BASIC_CHANGE = AND(
	AT('type', 'Basic'),
	SIDE_VALUES)


// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
var OBJECT_ITEM =
module.OBJECT_ITEM = OR(
	[STRING, DIFF_TREE],
	[STRING, STRING, DIFF_TREE])

var OBJECT_CHANGE =
module.OBJECT_CHANGE = AND(
	AT('type', 'Object'),
	AT('items', ARRAY(OBJECT_ITEM)),
	// XXX
	AT('item_order', undefined))


// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
var ARRAY_ITEM =
module.ARRAY_ITEM = OR(
	[ANY, ANY, DIFF_TREE],
	[[ANY, NUMBER], [ANY, NUMBER], DIFF_TREE])

var ARRAY_ITEMS =
module.ARRAY_ITEMS = AND(
	AT('length', OR(
		[NUMBER, NUMBER], 
		undefined)),
	AT('items', ARRAY(
		OR(
			ARRAY_ITEM,
			OBJECT_ITEM))),
	// XXX
	AT('item_order', undefined))

var ARRAY_CHANGE =
module.ARRAY_CHANGE = AND(
		AT('type', 'Array'),
		ARRAY_ITEMS)


// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
var TEXT_CHANGE =
module.TEXT_CHANGE = AND(
		AT('type', 'Text'),
		ARRAY_ITEMS)

// XXX it makes sense to make this a recursive pattern...
// 		...need to check if we stop on a recursive pattern...
// XXX TEST!!!
var DIFF_TREE =
module.DIFF_TREE = OR(
	BASIC_CHANGE,
	OBJECT_CHANGE,
	ARRAY_CHANGE,
	TEXT_CHANGE,
	null)


//---------------------------------------------------------------------
// Diff...

var DIFF_OBJECT =
module.DIFF_OBJECT = AND(
	// format metadata...
	AT('format', diff.FORMAT_NAME),
	//AT('version', STRING(/\d+\.\d+\.\d+/)),
	AT('version', diff.FORMAT_VERSION),

	// instance metadata...
	AT('options', AND(
 		AT('tree_diff', OR(BOOL, null)),
 		AT('keep_none', OR(BOOL, null)),
 		AT('min_text_length', OR(NUMBER, null)),
		AT('no_attributes', OR(BOOL, null)),
 		AT('NONE', OR(ANY, null)),
 		AT('EMPTY', OR(ANY, null)),
 		AT('no_length', OR(BOOL, null)),
 		AT('cmp', OR(FUNCTION, null)) )),
	AT('placeholders', AND(
		// XXX would be nice to store these and to use them to test 
		// 		deeper stuff (i.e. VALUE)...
		AT('NONE', ANY),
		AT('EMPTY', ANY))),
	AT('timestamp', NUMBER),

	// diff...
	OR(
		AND(
			AT('structure', 'flat'),
			AT('diff', DIFF_FLAT)), 
		AND(
			AT('structure', 'tree'),
			AT('diff', DIFF_TREE))))



/**********************************************************************
* vim:set ts=4 sw=4 :                               */ return module })
