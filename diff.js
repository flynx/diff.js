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
// XXX still has problems with sparse arrays...
// 		ex: 
// 			zip(new Array(5), [])
// 				-> the sparce side will contain undefined instead of being empty...
// XXX revise...
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
			//a.length > i
			i in a
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


// get common chunks (LCS)...
//
// Format:
// 	[
// 		<total-intersection-length>,
//
// 		{
// 			A: <offset-A>,
// 			B: <offset-B>,
// 			length: <section-length>,
// 		},
// 		...
// 	]
//
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
		while((a+l < A.length && b+l < B.length)
					// cmp non-empty slots only...
					&& ((a+l in A && b+l in B) ?
						cmp(A[a+l], B[b+l])
						: (!(a+l in A) && !(b+l in B)))){
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
// 			[<offset-A>, 
// 				[ <item>, ... ]],
// 			[<offset-B>, 
// 				[ <item>, ... ]],
// 		],
// 		...
// 	]
//
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

var partHandlers = {
	// XXX might be good to consider item ordering 
	// 		...i.e. how an item's indes changed
	// XXX might be good to support section splicing...
	items: function(diff, A, B, options){
		var sections = getDiffSections(A, B, options.cmp)

		// special case: last section set consists of sparse/empty arrays...
		var last = sections[sections.length-1]
		last 
			&& last[0][1]
				.concat(last[1][1])
				.filter(function(e){ return e }).length == 0
			&& sections.pop()

		return sections
			.map(function(gap){
				var i = gap[0][0]
				var j = gap[1][0]
				var a = gap[0][1]
				var b = gap[1][1]

				return zip(
						function(n, elems){
							return [
								// if a slot exists it gets an index, 
								// otherwise null...
								(0 in elems || n < a.length) ? 
									i+n 
									: null,
								(1 in elems || n < b.length) ? 
									j+n 
									: null,
								diff(
									// use value, EMPTY or NONE...
									0 in elems ? 
											elems[0] 
										: n < a.length ?
											EMPTY
										: NONE, 
									1 in elems ? 
											elems[1] 
										: n < b.length ?
											EMPTY
										: NONE,
									options), 
							] }, 
						a, b)
					.filter(function(e){ 
						return e[2] != null})
			})
			.reduce(function(res, e){ 
				return res.concat(e) }, [])
	},
	attributes: function(diff, A, B, options, filter){
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
		return items
	},
	// XXX
	order: function(diff, A, B, options){
		// XXX
	}
}



//---------------------------------------------------------------------
//
// Format can be one of:
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
// 			// NOTE: this is present only if A and B lengths are different...
// 			length: [<A-length>, <B-length>],
// 			
// 			// holds both index and attribute keys (mode-dependant)...
// 			items: [
// 				// NOTE: if an item does not exist in either A or B its
// 				//		key will be null...
// 				[<key-a>, <key-b>, <diff>],
// 				
// 				...
// 			],
// 			// only for non-index keys...
// 			// XXX unused...
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
// 			// XXX unused...
// 			item_order: <array-diff>,
// 		}
//
// 	- A and B are long strings...
// 		{
// 			type: 'Text',
//
//			// same structure as for 'Array'...
// 			...
// 		}
//
// 
//
// XXX might be a good idea to add sub-section splicing, i.e. sub-arrays
//		and not just rely on item-level...
var Types = new Map([
	['Basic',
		function(diff, A, B, options){
			this.A = A
			this.B = B
		}],
	[Object, 
		function(diff, A, B, options){
			this.items = (this.items || [])
				.concat(partHandlers.attributes(diff, A, B, options))

			// XXX optional stuff:
			// 		- attr ordering...
			// 		- prototypes
		}],
	[Array, 
		function(diff, A, B, options){
			this.length = A.length != B.length ? [A.length, B.length] : []
			this.items = partHandlers.items(diff, A, B, options)
		}],

	/*/ XXX other JS types...
	[Map, 
		function(diff, A, B, options){
			// XXX make the set and map types compatible...
			// XXX diff [...A.entries()] and [...B.entries()]
			// 		...might be a good idea to sort them too
		}],
	[Set, Map],
	//*/
	
	// XXX not used yet...
	['Text',
		function(diff, A, B, options){
			return Types.handle(Array, this, A.split(/\n/), B.split(/\n/), options) }],
])
Types.handle = function(type, obj, ...args){
	// set .type
	obj.type = obj.type || (type.name ? type.name : type)

	// get the handler + resolve aliases...
	var handler = type
	do {
		var handler = this.get(handler)
		// unhandled type...
		if(handler == null){
			throw new TypeError('Diff: can\'t handle: ' + type)
		}
	} while(!(handler instanceof Function))

	// call the handler...
	handler.call(obj, ...args)

	return obj
}

// Build a diff between A and B...
//
// NOTE: this will include direct links to items.
// NOTE: for format info see doc for Types...
//
// XXX special case: empty sections do not need to be inserted...
//
// XXX do we need to differentiate things like: new Number(123) vs. 123???
// XXX check seen -- avoid recursion...
// XXX support Map(..) and other new-style types...
// XXX TEST: the format should survive JSON.parse(JSON.stringify(..))...
var _diff =
function(A, B, options, cache){
	// XXX might be a god idea to mix in default options (different 
	// 		defaults per mode)...
	options = options ? Object.create(options) : {}
	options.cmp = options.cmp || function(a, b){
		return a === b 
			|| a == b 
			|| (diff(a, b) == null) }
	// XXX update this depending on mode...
	options.asObject = options.asObject || []


	// same object...
	// XXX do we need to differentiate things like: new Number(123) vs. 123???
	if(A === B || A == B){
		return null
	}

	// basic types...
	if(typeof(A) != 'object' || typeof(B) != 'object' 
			// return diff placeholders as-is...
			|| DIFF_TYPES.has(A) || DIFF_TYPES.has(B)){
		return Types.handle('Basic', {}, diff, A, B, options)
	}


	// cache...
	// XXX check seen -- avoid recursion...
	cache = cache || new Map()
	var diff = cache.diff = cache.diff || function(a, b){
		var l2 = cache.get(a) || new Map()
		var d = l2.get(b) || _diff(a, b, options, cache)
		cache.set(a, l2.set(b, d))
		return d
	}


	// find the matching type...
	// NOTE: if A and B types mismatch we treat them as Object...
	// XXX this may have issues with key ordering, for example if Object
	// 		is not last it will match any set of items...
	var type = Object
	for(var t of Types.keys()){
		// leave pure objects for last...
		if(t === Object 
				// skip non-conctructor stuff...
				|| !(t instanceof Function)){
			continue
		}

		// full hit -- type match...
		if(A instanceof t && B instanceof t){
			type = t
			break
		}
		// partial hit -- type mismatch...
		if(A instanceof t || B instanceof t){
			type = 'Basic'
			break
		}
	}
	// handle type...
	var res = Types.handle(type, {}, diff, A, B, options)
	// handle things we treat as objects (skipping object itself)...
	if(type !== Object && type != 'Basic'
			&& (options.asObject == 'all' 
				|| options.asObject.indexOf(type) >= 0
				|| (type.name && options.asObject.indexOf(type.name) >= 0))){
		Types.handle(Object, res, diff, A, B, options)
	}

	// cleanup -- remove items containing empty arrays...
	Object.keys(res)
		.filter(function(k){ 
			return res[k] instanceof Array && res[k].length == 0 })
		.map(function(k){
			delete res[k] })

	// return only non-empty diff states...
	return Object.keys(res).length == 1 ? 
		null 
		: res
}


// Flatten the diff format...
//
// Format:
// 	[
// 		{
// 			// The path to the item in the object tree...
// 			//
// 			// Keys can be:
//			//	string		- normal object key
//			//	number		- array key 
//			//				  NOTE: this is actually not different 
//			//						from a string...
//			//	array/2		- a set of 2 keys for A and B respectively
//			//				  NOTE: if one of the array items in undefined 
//			//						or null then it means that the item
//			//						does not exist in the corresponding
//			//						array...
// 			path: [<key>, ...],
//
// 			// values in A and B...
// 			//
// 			// Special values:
// 			//	NONE		- the slot does not exist (splice)
// 			//				  NOTE: unless options.keep_none is true, 
// 			//						NONE elements are not included in the 
// 			//						change...
// 			//	EMPTY		- the slot exists but it is empty (set/delete)
// 			A: <value> | EMPTY | NONE,
// 			B: <value> | EMPTY | NONE,
// 		},
// 		...
// 	]
//
// NOTE: all indexes (for arrays) are given relative to the actual input 
// 		objects respectively as they were given. This does not account for
// 		the patch process.
// NOTE: this will lose some meta-information the diff format contains 
// 		like the type information which is not needed for patching but 
// 		may be useful for a more thorough compatibility check.
//
//
// XXX does change order matter here???
// 		...some changes can affect changes after them (like splicing 
// 		with arrays), this ultimately affects how patching is done...
// 		...or is this a quastion of how we treat indexes and the patching 
// 		algorithm???
// XXX should this follow the same extensible structure as _diff???
// 		...i.e. type handlers etc.
// 		......or this could be more generic...
// XXX we should be able to provide "fuzz" (context) to the changes...
// XXX TEST: the format should survive JSON.parse(JSON.stringify(..))...
var flatten = 
function(diff, res, path, options){
	res = res || []
	path = path || []
	options = options || {}

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
		// length...
		// XXX should this be given after all the element changes???
		// 		...but it should be before all the nested changes...
		;(diff.length != null)
			&& res.push({
				path: path.concat('length'),
				A: diff.length[0],
				B: diff.length[1],
			})
		// items...
		;(diff.items || [])
			.forEach(function(e){
				var v = e[2]
				var i = e[0] == e[1] ? 
					e[0] 
					: [e[0], e[1]]
				var p = path.concat([i])

				if(!options.keep_none 
						&& (v.A === NONE || v.B === NONE)){
					// NOTE: we do not need to flatten(..) this as 
					// 		it is guaranteed not to be a diff...
					res.push({
						path: p,
						// write only the value that is not NONE...
						[v.A === NONE ? 'B' : 'A']: v.A === NONE ? v.B : v.A,
					})

				} else {
					flatten(v, res, p, options)
				}
			})

	// Object...
	} else if(diff.type == 'Object'){
		;(diff.items || [])
			.forEach(function(e){
				var i = e[0]
				var v = e[1]
				var p = path.concat([i])

				flatten(v, res, p, options)
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
