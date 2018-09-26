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
	// non-pattern values...
	EMPTY, NONE,
} = diff


/*********************************************************************/
// helpers...

//	OPT(key, value) 
// 		-> true if key matches value or does not exist...
var OPT = function(key, value){
	return OR(
		NOT(AT(key)),
		AT(key, value)) }



/*********************************************************************/
//
// NOTE: this file is organized bottoms-up, with the most general 
// 		(top-level) patterns at the bottom.
//
// XXX need better mismatch checking -- ideally stating the exact spot
// 		where we did not match and the path of fails it created...
//
//
//---------------------------------------------------------------------
// Flat diff...
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
// Basic value...
var VALUE =
module.VALUE = OR(
	OR(LIKE('EMPTY'), EMPTY),
	OR(LIKE('NONE'), NONE),
	ANY)


// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
// Basic change...
var CHANGE =
module.CHANGE = AND(
	AT('path', L),
	OPT('type', S),
	// NOTE: this matches if one or both of A and B exist and if they 
	// 		do the match VALUE...
	AT(OR('A', 'B'), VALUE))


// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
// flat diff root (Array)...
var DIFF_FLAT =
module.DIFF_FLAT = OR(
	L(CHANGE), 
	null)



//---------------------------------------------------------------------
// Tree diff...
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
// Basic change...
var BASIC_CHANGE =
module.BASIC_CHANGE = AND(
	AT('type', 'Basic'),
	AT(OR('A', 'B'), VALUE))


// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
// Object change...
var OBJECT_ITEM =
module.OBJECT_ITEM = OR(
	[S, DIFF_TREE],
	[S, S, DIFF_TREE])

var OBJECT_CHANGE =
module.OBJECT_CHANGE = AND(
	AT('type', 'Object'),
	AT('items', L(OBJECT_ITEM)),
	// XXX
	OPT('item_order'))


// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
// Array change...
var ARRAY_ITEM =
module.ARRAY_ITEM = OR(
	[ANY, ANY, DIFF_TREE],
	[[ANY, N], [ANY, N], DIFF_TREE])

var ARRAY_ITEMS =
module.ARRAY_ITEMS = AND(
	AT('items', 
		L(OR(
			ARRAY_ITEM,
			OBJECT_ITEM))),
	OPT('length', [N, N]), 
	// XXX
	OPT('item_order'))

var ARRAY_CHANGE =
module.ARRAY_CHANGE = AND(
	AT('type', 'Array'),
	ARRAY_ITEMS)


// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
// Text change...
var TEXT_CHANGE =
module.TEXT_CHANGE = AND(
	AT('type', 'Text'),
	ARRAY_ITEMS)


// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
// Tree - the tree node...
// XXX need to check if we stop on a recursive pattern...
// XXX TEST!!!
var DIFF_TREE =
module.DIFF_TREE = OR(
	BASIC_CHANGE,
	OBJECT_CHANGE,
	ARRAY_CHANGE,
	TEXT_CHANGE,
	null)



//---------------------------------------------------------------------
// Diff -- the root data structure...
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
// Options...
var OPTIONS = 
module.OPTIONS = AND(
	OPT('tree_diff', B),
	OPT('keep_none', B),
	OPT('min_text_length', N),
	OPT('no_attributes', B),
	OPT('NONE', ANY),
	OPT('EMPTY', ANY),
	OPT('no_length', B),
	OPT('cmp', F) )


// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
var DIFF_OBJECT =
module.DIFF_OBJECT = AND(
	// format metadata...
	AT('format', diff.FORMAT_NAME),
	AT('version', AND(
		// version format...
		S(/\d+\.\d+\.\d+[ab]?/),
		// explicit version value...
		diff.FORMAT_VERSION)),

	// instance metadata...
	AT('options', OPTIONS),
	AT('placeholders', 
		AND(
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
