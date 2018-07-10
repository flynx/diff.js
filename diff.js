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



//---------------------------------------------------------------------
// Helpers...

// XXX should we handle properties???
var _diff_items = function(diff, A, B, options, filter){
	// JSON mode -> ignore attr order...
	var kA = Object.keys(A)
	var kB = Object.keys(B)

	if(filter){
		kA = kA.filter(filter)
		kB = kB.filter(filter)
	}

	var B_index = kB.reduce(function(res, k){
		res[k] = null 
		return res
	}, {})

	// items...
	var items = kA
			// A keys...
			.map(function(ka){
				var res = [ka, 
					_diff(
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
						_diff(
							EMPTY, 
							B[kb],
							options)]}))
			// cleanup...
			.filter(function(e){
				return e[1] !== null })
	items.length > 0
		&& (diff.items = (diff.items || []).concat(items))

	return diff
}
var _diff_item_order = function(diff, A, B, options, filter){
	var kA = Object.keys(A)
	var kB = Object.keys(B)

	if(filter){
		kA = kA.filter(filter)
		kB = kB.filter(filter)
	}

	var item_order = _diff(kA, kB, {mode: 'JSON'})
	item_order != null 
		&& (diff.item_order = item_order)

	return diff
}


// get common chuncs (LCS)...
var getCommonSections = function(A, B, cmp, min_chunk){
	cmp = cmp || function(a, b){
		return a === b || a == b }
	// XXX do we actually need this???
	min_chunk = min_chunk || 1
	var index = index || []

	var _getCommonSections = function(a, b){
		// index...
		var res = (index[a] || [])[b]
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

		// index...
		index[a] = index[a] || []
		index[a][b] = res

		return res
	} 

	return _getCommonSections(0, 0)
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
// 				[<key>, <diff>],
//
// 				// [S]plice section starting at key...
// 				//	The <diff> should contain two array sections.
// 				//	The section is treated as a seporate array, diffed
// 				//	and spliced into the target array at <key>.
// 				// XXX is this too complicated???
// 				['S', <key>, <diff>],
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
// 				...
// 			],
// 			item_order: <array-diff>,
// 		}
// 
// 		
// NOTE: this will include direct links to items.
// XXX check seen -- avoid recursion...
// XXX revise format...
// XXX support Map(..) and other new-style types...
var _diff =
function(A, B, options){
	options = options || {}

	// same object...
	// XXX this will miss things like:
	// 			new Number(123) vs. 123
	//		...would need to also include .value (i.e. .valueOf()) and 
	//		treat the thing as object...
	if(A === B || A == B){
	//if(A === B || (options.mode == 'JSON' && A == B)){
		return null
	}

	// basic types...
	if(typeof(A) != 'object' || typeof(B) != 'object'){
		return {
			type: 'Basic',
			A: A,
			B: B,
		}
	}

	// Array...
	// XXX check seen -- avoid recursion...
	if(A instanceof Array && B instanceof Array){
		var res = {
			type: 'Array',
			length: [A.length, B.length],
		}

		// find the common sections...
		var common_sections = getCommonSections(A, B,
			function(a, b){
				// XXX cache _diff(..) results...
				return a === b || a == b || _diff(a, b) })
		// XXX diff only the sections that differ...
		// XXX

		// indexed items...
		_diff_items(res, A, B, options, 
			function(e){ return e == 0 || !!(e*1) })

		// attributes... 
		// XXX make this more configurable... (order needs to be optional in JSON)
		options.mode != 'JSON'
			&& _diff_items(res, A, B, options, 
				function(e){ return !(e == 0 || !!(e*1)) })
			// attributes order...
			&& _diff_item_order(res, A, B, options, 
				function(e){ return !(e == 0 || !!(e*1)) })

		return (res.items || []).length > 0 ? res : null

	// Object...
	// NOTE: this will handle ONLY own keys...
	// XXX check seen -- avoid recursion...
	// XXX handle prototyping... (???)
	} else {
		var res = {
			type: 'Object',
		}

		_diff_items(res, A, B, options)

		// XXX this should be applicable to JSON too...
		options.mode != 'JSON'
			&& _diff_item_order(res, A, B, options)

		// .constructor...
		if(options.mode != 'JSON'){
			A.constructor !== B.constructor
				&& (res.constructors = [A.constructor, B.constructor])

			// XXX should we diff constructors???

			// XXX .__proto___ (???)
		}

		return ((res.item_order || []).length + (res.items || []).length) == 0 ? 
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
		diff.items.forEach(function(e){
			var i = e[0]
			var v = e[1]
			var p = path.concat([i])

			flatten(v, res, p)
		})

	// Object...
	} else if(diff.type == 'Object'){
		diff.items.forEach(function(e){
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
