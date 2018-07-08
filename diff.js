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

var EMPTY = {type: 'EMPTY'}


//---------------------------------------------------------------------
// Helpers...

// XXX need to account for array insertions...
// 		i.e. in the current state if a long array gets an item(s) spliced 
// 		in/out, a really big diff will be produced simply moving all 
// 		subsequent items by a fixed number of positions...
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


// Format:
// 	Map([
// 		[<value>, [<index>, ...]],
// 		...
// 	])
var makeIndex = function(L){
	return L
		.reduce(function(res, e, i){ 
			res.has(e) ? 
				res.get(e).push(i) 
				: res.set(e, [i])
			return res 
		}, new Map()) }

// get common chuncs...
// XXX Optimize search tree...
// 		...worst case: 12345 / 54321
// XXX need to balance the minimum number of chunks and maximum number 
// 		of elements here...
// XXX add chunk offsets to results...
var getCommonSections = function(A, B, a, b, min_chunk){
	a = a || 0
	b = b || 0
	min_chunk = min_chunk || 2

	// get common chunk...
	var l = 0
	var chunk = []
	while(a+l < A.length 
			&& b+l < B.length
			&& A[a+l] == B[b+l]){
		chunk.push(A[a+l])
		l++
	}

	// discard small chunks...
	if(l < min_chunk){
		chunk = []
		l = 0
	}

	// get next chunks...
	// XXX this repeats checks ( O(n^2) ), need to optimize...
	var L = A.length > a+l + min_chunk ? 
		getCommonSections(
			A, B, 
			l+a+1, l+b, 
			min_chunk) 
		: [0]
	var R = B.length > b+l + min_chunk ? 
		getCommonSections(
			A, B, 
			l+a, l+b+1, 
			min_chunk) 
		: [0]

	// select the best chunk-set...
	// NOTE: we maximize the number of elements in a chunk set then 
	// 		minimize the number of chunks per set...
	var next = L[0] == R[0] ? 
			(L.length < R.length ? L : R)
		: L[0] > R[0] ? 
			L 
		: R

	return next[0] > 0 && l > 0 ? 
			[l + next[0], chunk].concat(next.slice(1)) 
		: l > 0 ? 
			[l, chunk]
		: next
}


// XXX this would require a new diff structure...
// 		...might be a good idea to treat this as an index diff...
var _diff_arrays = function(diff, A, B, options){
	var A_index = makeIndex(A) 
	var B_index = makeIndex(B) 
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
// 			// holds both index and attribute keys (mode-dependant)...
// 			
// 			items: [
// 				[<key>, <diff>],
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
			//values: [A, B],
			A: A,
			B: B,
		}
	}

	// Array...
	// XXX check seen -- avoid recursion...
	if(A instanceof Array && B instanceof Array){
		var res = {
			type: 'Array',
		}

		// indexed items...
		_diff_items(res, A, B, options, 
			function(e){ return e == 0 || !!(e*1) })

		// attributes... 
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
