/**********************************************************************
* 
*
*
**********************************************************************/
((typeof define)[0]=='u'?function(f){module.exports=f(require)}:define)
(function(require){ var module={} // make module AMD/node compatible...
/*********************************************************************/




/*********************************************************************/
// Diff base format:
// 	{
// 		varsion: '1.0',
// 		options: {
// 		},
// 		
// 		diff: <diff-format>,
// 	}
//
// Diff format:
//	[
//	]
// 
// 
//
/*********************************************************************/

// Inseted when an item exists one one side and does not on the other.
// 
// NOTE: for Array items this does not shift positions of other item
// 		positions nor does it affect the the array lengths.
var EMPTY = {type: 'EMPTY'}


var NONE = {type: 'NONE'}


var DIFF_TYPES = new Set([
	NONE,
	EMPTY,
])



//---------------------------------------------------------------------
// Helpers...

// 	zip(array, array, ...)
// 		-> [[item, item, ...], ...]
//
// 	zip(func, array, array, ...)
// 		-> [func(i, [item, item, ...]), ...]
//
var zip = function(func, ...arrays){
	var i = arrays[0] instanceof Array ? 0 : arrays.shift()
	if(func instanceof Array){
		arrays.splice(0, 0, func)
		func = null
	}
	// build the zip item...
	// NOTE: this is done this way to preserve array sparseness...
	var s = arrays
		.reduce(function(res, a, j){
			a.length > i 
				&& (res[j] = a[i])
			return res
		}, new Array(arrays.length))
	return arrays
			// check that at least one array is longer than i...
			.reduce(function(res, a){ 
				return Math.max(res, i, a.length) }, 0) > i ?
		// collect zip item...
		[func ? func(i, s) : s]
			// get next...
			.concat(zip(func, i+1, ...arrays))
		// done...
		: [] }

// XXX should we handle properties???
// XXX use zip(..)...
var _diff_items = function(diff, res, A, B, options, filter){
	// JSON mode -> ignore attr order...
	var kA = Object.keys(A)
	var kB = Object.keys(B)

	if(filter){
		kA = filter instanceof Array ? 
			filter.slice() 
			: kA.filter(filter)
		kB = filter instanceof Array ? 
			filter.slice() 
			: kB.filter(filter)
	}

	var B_index = kB.reduce(function(res, k){
		res[k] = null 
		return res
	}, {})

	// items...
	// XXX use zip(..)...
	var items = kA
			// A keys...
			.map(function(ka){
				var res = [ka, 
					diff(
						A[ka], 
						ka in B_index ? B[ka] : EMPTY, 
						options)] 
				// remove seen keys...
				delete B_index[ka]
				return res
			})
			// keys present only in B...
			.concat(Object.keys(B_index)
				.map(function(kb){
					return [kb, 
						diff(
							EMPTY, 
							B[kb],
							options)]}))
			// cleanup...
			.filter(function(e){
				return e[1] !== null })
	items.length > 0
		&& (res.items = (res.items || []).concat(items))

	return res
}
var _diff_item_order = function(diff, res, A, B, options, filter){
	var kA = Object.keys(A)
	var kB = Object.keys(B)

	if(filter){
		kA = filter instanceof Array ? 
			filter.slice() 
			: kA.filter(filter)
		kB = filter instanceof Array ? 
			filter.slice() 
			: kB.filter(filter)
	}

	var item_order = diff(kA, kB, {mode: 'JSON'})
	item_order != null 
		&& (res.item_order = item_order)

	return res
}


// get common chuncs (LCS)...
var getCommonSections = function(A, B, cmp, min_chunk){
	cmp = cmp || function(a, b){
		return a === b || a == b }
	// XXX do we actually need this???
	min_chunk = min_chunk || 1
	var cache = cache || []

	var _getCommonSections = function(a, b){
		// cache...
		var res = (cache[a] || [])[b]
		if(res != null){
			return res
		}

		// collect common chunk...
		var chunk = {
			A: a,
			B: b,
			length: 0,
		}
		var l = chunk.length
		while(a+l < A.length 
				&& b+l < B.length 
				&& cmp(A[a+l], B[b+l])){
			l = chunk.length += 1
		}
		// ignore small chunks...
		l = chunk.length >= min_chunk ? 
			chunk.length
			: 0 

		// get next chunks...
		var L = A.length > a+l + min_chunk ? 
			_getCommonSections(l+a+1, l+b) 
			: [0]
		var R = B.length > b+l + min_chunk ? 
			_getCommonSections(l+a, l+b+1) 
			: [0]

		// select the best chunk-set...
		// NOTE: we maximize the number of elements in a chunk set then 
		// 		minimize the number of chunks per set...
		var next = L[0] == R[0] ? 
				(L.length < R.length ? L : R)
			: L[0] > R[0] ? 
				L 
			: R
		var res = 
			// non-empty chunk and next...
			next[0] > 0 && l > 0 ? 
				[l + next[0], chunk].concat(next.slice(1)) 
			// non-empty chunk and empty next...
			: l > 0 ? 
				[l, chunk]
			// empty chunk...
			: next

		// cache...
		cache[a] = cache[a] || []
		cache[a][b] = res

		return res
	} 

	return _getCommonSections(0, 0)
}


// Format:
// 	[
// 		[
// 			[<gap-offset-A>, 
// 				[ item, ... ]],
// 			[<gap-offset-B>, 
// 				[ item, ... ]],
// 		],
// 		...
// 	]
var getDiffSections = function(A, B, cmp, min_chunk){
	// find the common sections...
	var common_sections = getCommonSections(A, B, cmp, min_chunk)
	common_sections.shift()

	// collect gaps between common sections...
	var a = 0
	var b = 0
	var gaps = []
	common_sections
		// make this consider the tail gap...
		.concat({
			A: A.length,
			B: B.length,
			length: 0,
		})
		.forEach(function(e){
			// store the gap...
			;(a != e.A || b != e.B)
				&& gaps.push([
					[a, A.slice(a, e.A)],
					[b, B.slice(b, e.B)],
				])
			// go to next gap...
			a = e.A + e.length
			b = e.B + e.length
		})

	return gaps
}



//---------------------------------------------------------------------
//
// Format:
// 	- no difference...
// 		null
// 		
// 	- A and/or B is a basic value...
// 		{
// 			type: 'Basic',
// 			
// 			A: <value>,
// 			B: <value>,
// 		}
// 		
// 	- A and B are arrays...
// 		{
// 			type: 'Array',
// 			
// 			length: [A, B],
// 			
// 			// holds both index and attribute keys (mode-dependant)...
// 			items: [
// 				// Simple item diff...
// 				// XXX unused....
// 				[<key>, <diff>],
//
// 				// [S]plice section starting at key...
// 				[<key-a>, <key-b>, <diff>],
// 				
// 				...
// 			],
// 			// only for non-index keys...
// 			item_order: <array-diff>,
// 		}
// 		
// 	- A and B are objects...
// 		{
// 			type: 'Object',
// 			
// 			items: [
// 				[<key>, <diff>],
//
// 				// XXX unused....
// 				[<key-a>, <key-b>, <diff>],
// 				...
// 			],
// 			item_order: <array-diff>,
// 		}
// 
// 		
// NOTE: this will include direct links to items.
// XXX check seen -- avoid recursion...
// XXX support Map(..) and other new-style types...
var _diff =
function(A, B, options, cache){
	options = options || {}

	// same object...
	// XXX this will miss things like:
	// 			new Number(123) vs. 123
	//		...would need to also include .value (i.e. .valueOf()) and 
	//		treat the thing as object...
	if(A === B || A == B){
		return null
	}

	// basic types...
	if(typeof(A) != 'object' || typeof(B) != 'object' || DIFF_TYPES.has(A) || DIFF_TYPES.has(B)){
		return {
			type: 'Basic',
			A: A,
			B: B,
		}
	}

	// cache...
	cache = cache || new Map()
	var diff = cache.diff = cache.diff || function(a, b){
		var l2 = cache.get(a) || new Map()
		var d = l2.get(b) || _diff(a, b, options, cache)
		cache.set(a, l2.set(b, d))
		return d
	}
	var cmp = function(a, b){
		return a === b 
			|| a == b 
			|| (diff(a, b) == null) }

	// Array...
	// XXX check seen -- avoid recursion...
	if(A instanceof Array && B instanceof Array){
		var res = {
			type: 'Array',
			length: [A.length, B.length],
		}

		// diff the gaps...
		// XXX might be good to consider item ordering...
		res.items = getDiffSections(A, B, cmp)
			.map(function(gap){
				var i = gap[0][0]
				var j = gap[1][0]

				return zip(
					function(n, elems){
						return [
							i+n, 
							j+n,
							diff(
								0 in elems ? elems[0] : NONE, 
								1 in elems ? elems[1] : NONE), 
						]
					}, 
					gap[0][1],
					gap[1][1])
			})
			.reduce(function(res, e){ 
				return res.concat(e) }, [])

		/* XXX
		// attributes... 
		// XXX make this more configurable... (order needs to be optional in JSON)
		options.mode != 'JSON'
			&& _diff_items(diff, res, A, B, options, 
				function(e){ return !(e == 0 || !!(e*1)) })
			// attributes order...
			&& _diff_item_order(diff, res, A, B, options, 
				function(e){ return !(e == 0 || !!(e*1)) })
		//*/

		return (res.items || []).length > 0 ? res : null

	// Object...
	// NOTE: this will handle ONLY own keys...
	// XXX check seen -- avoid recursion...
	// XXX handle prototyping... (???)
	} else {
		var res = {
			type: 'Object',
		}

		_diff_items(diff, res, A, B, options)

		/* XXX
		// XXX this should be applicable to JSON too...
		options.mode != 'JSON'
			&& _diff_item_order(diff, res, A, B, options)

		// .constructor...
		if(options.mode != 'JSON'){
			A.constructor !== B.constructor
				&& (res.constructors = [A.constructor, B.constructor])

			// XXX should we diff constructors???

			// XXX .__proto___ (???)
		}
		//*/

		return ((res.item_order || []).length 
				+ (res.items || []).length) == 0 ? 
			null 
			: res
	}
}


// XXX need to track order very carefully here... (???)
var flatten = 
function(diff, res, path){
	res = res || []
	path = path || []

	// no difference...
	if(diff == null){
		return res

	// Basic...
	} else if(diff.type == 'Basic'){
		res.push({
			path: path,
			A: diff.A,
			B: diff.B,
		})

	// Array...
	} else if(diff.type == 'Array'){
		diff.items
			.forEach(function(e){
				var i = e[0] == e[1] ? 
					e[0] 
					: [e[0], e[1]]
				var v = e[2]
				var p = path.concat([i])

				flatten(v, res, p)
			})

	// Object...
	} else if(diff.type == 'Object'){
		diff.items
			.forEach(function(e){
				var i = e[0]
				var v = e[1]
				var p = path.concat([i])

				flatten(v, res, p)
			})

	// Other...
	// XXX revise this...
	} else {
		throw new TypeError('Unknown diff type: '+ diff.type)
	}	

	return res
}



//---------------------------------------------------------------------
var diff =
module.diff = 
function(A, B, options){
	// XXX
}


var patch =
module.patch = 
function(diff, obj){
	// XXX
}




/**********************************************************************
* vim:set ts=4 sw=4 :                               */ return module })
