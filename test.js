#!/usr/bin/env node
/**********************************************************************
* 
* test.js
*
* Repo and docs:
* 	https://github.com/flynx/test.js
*
***********************************************/ /* c8 ignore next 2 */
((typeof define)[0]=='u'?function(f){module.exports=f(require)}:define)
(function(require){ var module={} // make module AMD/node compatible...
/*********************************************************************/

var test = require('ig-test')

var diff = require('./diff')
var format = require('./format')


//---------------------------------------------------------------------

test.Setups({
	// XXX make this return a list...
	basic: function(assert){
		return [
			{
				A: {}, B: {},
				cmp: true,
			},
			{
				A: [], B: [],
				cmp: true,
			},
			{
				A: 0, B: 0,
				cmp: true,
			},
			{
				A: 123, B: 123,
				cmp: true,
			},
			{
				A: false, B: false,
				cmp: true,
			},
			{
				A: undefined, B: undefined,
				cmp: true,
			},
			// XXX special case -- fails....
			{
				A: NaN, B: NaN,
				cmp: true,
			},
		] },
})

test.Tests({
	cmp: function(assert, setup){
		setup = setup instanceof Array ? setup : [setup]
		setup.forEach(function(e){
			var res
			'cmp' in e
				&& assert(
					(res = diff.cmp(e.A, e.B)) == e.cmp, 
					`cmp(..): cmp(${e.A}, ${e.B}) should be ${e.cmp} got ${res}`) }) },
})

test.Cases({
	'basics': function(assert){
		// XXX move reference objects + expected diffs to setups
		var a = {}
		var b = {}

		assert(diff.Diff(a, b), 'Diff(..)')
	},
	recursion: function(assert){
		var a = {}
		a.x = a
		var b = {}
		b.x = b

		assert(diff.cmp(a, b), 'recursive cmp(..)')

		a = {}
		a.x = a
		b = {}
		b.y = b
		assert(!diff.cmp(a, b), 'recursive !cmp(..)')


		a = {}
		a.x = a
		b = {x: {}}

		assert(!diff.cmp(a, b), 'recursive cmp(..)')
	},
})


//---------------------------------------------------------------------
typeof(__filename) != 'undefined'
	&& __filename == (require.main || {}).filename
	&& test.run()



/**********************************************************************
* vim:set ts=4 sw=4 :                               */ return module })
