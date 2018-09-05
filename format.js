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
	NULL, BOOL, B, NUMBER, N, STRING, S, ARRAY, L, FUNCTION, F,
	OR, AND, NOT,
	AT, OF, IN,
	VAR, LIKE, TEST,

	EMPTY, NONE,
} = diff



/*********************************************************************/
//
// XXX need better mismatch checking -- ideally stating the exact spot
// 		where we did not match and the path of fails it created...
//
//
//---------------------------------------------------------------------
// Flat diff...

var VALUE =
module.VALUE = OR(
	// XXX use these taken from .placeholders...
	OR(EMPTY, LIKE('EMPTY')),
	OR(NONE, LIKE('NONE')),
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
	AT('path', L),
	// XXX optional...
	// 		...see DIFF_OBJECT's options for description...
	AT('type', OR(S, undefined)),
	SIDE_VALUES)


var DIFF_FLAT =
module.DIFF_FLAT = OR(
	L(CHANGE), 
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
	[S, DIFF_TREE],
	[S, S, DIFF_TREE])

var OBJECT_CHANGE =
module.OBJECT_CHANGE = AND(
	AT('type', 'Object'),
	AT('items', L(OBJECT_ITEM)),
	// XXX
	AT('item_order', undefined))


// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
var ARRAY_ITEM =
module.ARRAY_ITEM = OR(
	[ANY, ANY, DIFF_TREE],
	[[ANY, N], [ANY, N], DIFF_TREE])

var ARRAY_ITEMS =
module.ARRAY_ITEMS = AND(
	AT('length', OR(
		[N, N], 
		undefined)),
	AT('items', L(
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
	//AT('version', S(/\d+\.\d+\.\d+/)),
	AT('version', diff.FORMAT_VERSION),

	// instance metadata...
	AT('options', AND(
 		AT('tree_diff', OR(B, NULL)),
 		AT('keep_none', OR(B, NULL)),
 		AT('min_text_length', OR(N, NULL)),
		AT('no_attributes', OR(B, NULL)),
 		AT('NONE', OR(ANY, NULL)),
 		AT('EMPTY', OR(ANY, NULL)),
 		AT('no_length', OR(B, NULL)),
 		AT('cmp', OR(F, NULL)) )),
	AT('placeholders', AND(
		AT('NONE', 
			VAR('NONE', ANY)),
		AT('EMPTY', 
			VAR('EMPTY', ANY)))),
	AT('timestamp', N),

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
