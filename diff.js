/**********************************************************************
* 
*
*
**********************************************************************/
((typeof define)[0]=='u'?function(f){module.exports=f(require)}:define)
(function(require){ var module={} // make module AMD/node compatible...
/*********************************************************************/




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


// Get common chunks (LCS)...
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


// Get diff sections...
//
// This is the reverse of getCommonSections(..)
//
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


// Make a proxy method...
//
var proxy = function(path, func){
	path = path instanceof Array ? 
		path.slice() 
		: path.split(/\./)
	var method = path.pop()

	return function(...args){
		var res = path.reduce(function(res, e){ return res[e] }, this)[method](...args) 
		return func ? 
			func.call(this, res, ...args) 
			: res
	}
}



//---------------------------------------------------------------------
// Diff framework...
//
//
// Format (tree):
// 	<diff> ::=
// 		// no difference...
// 		null
// 			
// 		// A and/or B is a basic value...
// 		| {
// 			type: 'Basic',
// 			
// 			A: <value>,
// 			B: <value>,
// 		}
// 			
// 		// A and B are arrays...
// 		| {
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
// 				// Slice change, the <diff> is treated as two arrays that 
// 				// must be sliced in/out of the targets...
// 				// XXX not implemented -- need to think about this...
// 				[[<key-a>], [<key-b>], <diff>],
// 				
// 				...
// 			],
// 			// only for non-index keys...
// 			// XXX unused...
// 			item_order: <array-diff>,
// 		}
// 			
// 	   	// A and B are objects...
// 	   	| {
// 	   		type: 'Object',
// 	   		
// 	   		items: [
// 	   			[<key>, <diff>],
//     
// 	   			// XXX unused....
// 	   			[<key-a>, <key-b>, <diff>],
// 	   			...
// 	   		],
// 	   		// XXX unused...
// 	   		item_order: <array-diff>,
// 	   	}
//     
// 	   	// A and B are long strings...
// 	   	| {
// 	   		type: 'Text',
//     
//	   		// same structure as for 'Array'...
// 	   		...
// 	   	}
//  	
// 
// Format (flat):
// 	[
// 		// change...
// 		{
// 			// Change type (optional)...
//			//
// 			// If not present then the change is simple item insertion 
// 			// or splicing...
// 			type: <change-type>,
//
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
// XXX revise structure... 
var Types = {
	// Type handlers...
	handlers: new Map(), 
	has: proxy('handlers.has'),
	get: proxy('handlers.get'),
	set: proxy('handlers.set', 
		function(res, key, handler){
			// auto-alias...
			key.name
				&& this.set(key.name, key)
			return res
		}),

	// sorted list of types...
	// XXX do we need to cache this???
	get types(){
		var h = this.handlers
		var order = new Map()
		var i = 0
		return [...h.keys()]
			.filter(function(k){ 
				k = h.get(k)
				return k != null 
					&& !h.has(k) 
					&& order.set(k, i++)
			})
			.sort(function(a, b){
				a = h.get(a)
				b = h.get(b) 

				return a.priority && b.priority ?
						(b.priority - a.priority 
							|| order.get(a) - order.get(b))
					: a.priority ?
						a.priority > 0 ? -1 : 1
					: b.priority ?
						b.priority > 0 ? 1 : -1
					: order.get(a) - order.get(b)
			})
	},
	get typeNames(){
		return this.types.map(function(e){ return e.name || e }) },


	// Get handler...
	//
	// 	.getHandler(object)
	// 	.getHandler(handler-type)
	// 	.getHandler(handler-type-name)
	// 		-> handler | null
	//
	getHandler: function(o){
		// get the type if there is no direct match...
		o = !this.has(o) ? this.detect(o) : o

		// resolve aliases...
		do {
			o = this.get(o)
		} while(o != null && this.has(o))

		return o
	},

	// Detect handler type...
	//
	// 	Detect handler type for A...
	// 	.detect(A)
	// 		-> handler-type
	//
	// 	Detect common handler type for A and B...
	// 	.detect(A, B)
	// 		-> handler-type
	//
	//
	// NOTE: if A and B types mismatch we treat them as Object...
	detect: function(A, B, options){
		var type
		var types = this.types

		// explicit checkers have priority over instance tests...
		for(var t of types){
			var h = this.get(t)
			if(h.check
					&& h.check(A, options)){
				type = t
				break
			}
		}

		// search instances...
		if(!type){
			type = Object
			for(var t of types){
				// leave pure objects for last...
				if(t === Object 
						// skip non-conctructor stuff...
						|| !(t instanceof Function)){
					continue
				}

				// full hit -- type match...
				if(A instanceof t){
					type = t
					break
				}
			}
		}

		// combinational types...
		if(B !== undefined){
			var typeB = this.detect(B, undefined, options)

			// type match...
			if(type === typeB){
				return type

			// partial hit -- type mismatch...
			} else {
				return 'Basic'
			}
		}

		return type
	},
	handle: function(type, obj, diff, A, B, options){
		// set .type
		type = type == null ? this.detect(A, B, options) : type
		obj.type = obj.type || (type.name ? type.name : type)

		// get the handler + resolve aliases...
		var handler = this.getHandler(type)

		// unhandled type...
		if(handler == null 
				|| !(handler instanceof Function 
					|| handler.handle)){
			throw new TypeError('Diff: can\'t handle: ' + type)
		}

		// call the handler...
		handler.handle ?
			handler.handle.call(this, obj, diff, A, B, options)
			: handler.call(this, obj, diff, A, B, options)

		return obj
	},

	// Flatten the tree diff format...
	//
	// XXX might be good to include some type info so as to enable patching 
	// 		custom stuff like Text...
	// XXX does change order matter here???
	// 		...some changes can affect changes after them (like splicing 
	// 		with arrays), this ultimately affects how patching is done...
	// 		...or is this a quastion of how we treat indexes and the patching 
	// 		algorithm???
	// XXX we should be able to provide "fuzz" (context) to the changes...
	// XXX TEST: the format should survive JSON.parse(JSON.stringify(..))...
	flatten: function(diff, res, path, options){
		res = res || []
		path = path || []
		options = options || {}

		if(diff == null){
			return null
		}

		var handler = this.getHandler(diff.type)

		if(handler == null || !handler.flatten){
			throw new TypeError('Can\'t flatten type: '+ diff.type)
		}

		return handler.flatten.call(this, diff, res, path, options)
	},


	// User API...
	
	// Build a diff between A and B...
	//
	// NOTE: this will include direct links to items.
	// NOTE: for format info see doc for Types...
	//
	// XXX special case: empty sections do not need to be inserted...
	//
	// XXX do we need to differentiate things like: new Number(123) vs. 123???
	// XXX check seen -- avoid recursion...
	// XXX TEST: the format should survive JSON.parse(JSON.stringify(..))...
	diff: function(A, B, options, cache){
		var that = this
		// XXX might be a god idea to mix in default options (different 
		// 		defaults per mode)...
		options = options ? Object.create(options) : {}
		options.cmp = options.cmp || function(a, b){
			return a === b 
				|| a == b 
				|| (diff(a, b) == null) }
		// XXX update this depending on mode...
		options.as_object = options.as_object || []


		// same object...
		// XXX do we need to differentiate things like: new Number(123) vs. 123???
		if(A === B || A == B){
			return null
		}

		// builtin types...
		if(DIFF_TYPES.has(A) || DIFF_TYPES.has(B)){
			return this.handle('Basic', {}, diff, A, B, options)
		}


		// cache...
		// XXX check seen -- avoid recursion...
		cache = cache || new Map()
		var diff = cache.diff = cache.diff || function(a, b){
			var l2 = cache.get(a) || new Map()
			var d = l2.get(b) || that.diff(a, b, options, cache)
			cache.set(a, l2.set(b, d))
			return d
		}


		// find the matching type...
		var type = this.detect(A, B, options)
		// handle type...
		var res = this.handle(type, {}, diff, A, B, options)
		// handle things we treat as objects (skipping object itself)...
		if(type !== Object && type != 'Basic'
				&& (options.as_object == 'all' 
					|| options.as_object.indexOf(type) >= 0
					|| (type.name && options.as_object.indexOf(type.name) >= 0))){
			this.handle(Object, res, diff, A, B, options)
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
	},

	// Patch (update) obj via diff...
	//
	patch: function(diff, obj){
		// XXX
	},

	// Check if diff is applicable to obj...
	//
	check: function(diff, obj){
		// XXX
	},
}



//---------------------------------------------------------------------
// Specific type setup...
//
// Handler format:
// 	{
// 		// Type check priority (optional)...
// 		//
// 		// Types are checked in order of occurrence in .handlers unless
// 		// type .priority is set to a non 0 value.
// 		//
// 		// Default priorities:
// 		//	50			- 'Basic'
// 		//	-50			- Object
// 		//
// 		// General guide:
// 		//	>50			- to be checked before 'Basic'
// 		//	<50 and >0	- after Basic but before unprioritized types
// 		//	<-50 and <0	- after unprioritized typee but before Object
// 		//	<-50		- to be checked after Object
// 		//
// 		// NOTE: when this is set to 0, then type will be checked in 
// 		//		order of occurrence...
// 		priority: number | null,
//
// 		// Check if obj is compatible (optional)...
// 		//
// 		// 	.check(obj[, options])
// 		//		-> bool
// 		//
// 		check: function(obj, options){ .. },
//
// 		// Handle/populate the diff of A and B...
// 		//
// 		// Input diff format:
// 		//	{
// 		//		type: <type-name>,
// 		//	}
// 		//
// 		handle: function(obj, diff, A, B, options){ .. },
//
// 		// Flatten a diff...
// 		//
// 		//	.flatten(diff, res, path, options)
// 		//		-> res
// 		//
// 		flatten: function(diff, res, path, options){ .. },
// 	}
//
//
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
// Basic type / type-set...
//
// This is used to store two objects of either basic JavaScript
// types (string, number, bool, ...) or store two objects of 
// mismatching types...
//
// NOTE: a basic type is one that returns a specific non-'object'
// 		typeof...
// 		i.e. when typeof(x) != 'object'
Types.set('Basic', {
	priority: 50,

	check: function(obj, options){
		return typeof(obj) != 'object' },
	handle: function(obj, diff, A, B, options){
		obj.A = A
		obj.B = B
	},
	flatten: function(diff, res, path, options){
		res.push({
			path: path,
			A: diff.A,
			B: diff.B,
		})
		return res
	},
})


// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
// Object...
Types.set(Object, {
	priority: -50,

	handle: function(obj, diff, A, B, options){
		obj.items = (obj.items || [])
			.concat(this.get(Object).attributes(diff, A, B, options))

		// XXX optional stuff:
		// 		- attr ordering...
		// 		- prototypes
	},
	flatten: function(diff, res, path, options){
		var that = this
		;(diff.items || [])
			.forEach(function(e){
				var i = e[0]
				var v = e[1]
				var p = path.concat([i])

				that.flatten(v, res, p, options)
			})
		return res
	},

	// part handlers...
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
})


// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
// Array...
// XXX might be a good idea to add sub-section splicing, i.e. sub-arrays
//		and not just rely on item-level...
Types.set(Array, {
	handle: function(obj, diff, A, B, options){
		obj.length = A.length != B.length ? [A.length, B.length] : []
		obj.items = this.get(Array).items(diff, A, B, options)
	},
	flatten: function(diff, res, path, options){
		var that = this
		// length...
		;(!options.no_length && diff.length != null)
			&& res.push({
				path: path.concat('length'),
				A: diff.length[0],
				B: diff.length[1],
			})
		// items...
		;(diff.items || [])
			.forEach(function(e){
				var v = e[2]

				// index...
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
					that.flatten(v, res, p, options)
				}
			})
		return res
	},

	// part handlers...
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
	// XXX
	order: function(diff, A, B, options){
		// XXX
	},
})


// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
// XXX add JS types like Map, Set, ...
// XXX


// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
// Text...
Types.set('Text', {
	// this must be checked before the 'Base'...
	priority: 100,

	check: function(obj, options){
		options = options || {}
		min = options.min_text_length || 1000
		return typeof(obj) == 'string' 
			&& min > 0 
			&& (obj.length > min 
				&& /\n/.test(obj))
	},
	handle: function(obj, diff, A, B, options){
		options = Object.create(options || {})
		// do not treat substrings as text...
		options.min_text_length = -1
		return this.handle(Array, obj, diff, A.split(/\n/), B.split(/\n/), options) 
	},
	flatten: function(diff, res, path, options){
		options = Object.create(options || {})
		;('no_length' in options) 
			&& (options.no_length = true)
		// use the array flatten but add 'Text' type to each change...
		// NOTE: we need to abide by the protocol and call Array's 
		// 		.flatten(..) the context of the main object...
		this.get(Array).flatten.call(this, diff, res, path, options)
			.map(function(e){
				e.type = 'Text'
				return e
			})
		return res
	},
})



//---------------------------------------------------------------------
//
//
// Options format:
// 	{
// 		// if true return a tree diff format...
// 		tree_diff: false | true,
//
// 		// if true, NONE change items will not be removed from the diff...
// 		keep_none: false | true,
//
// 		// Minimum length of a string for it to be treated as Text...
// 		//
// 		// If this is set to a negative number Text diffing is disabled.
// 		//
// 		// NOTE: a string must also contain at least one \n to be text 
// 		//		diffed...
// 		min_text_length: 1000 | -1,
//
// 		// list of types we treat as objects, i.e. check attributes...
// 		as_object: [ .. ] | Set([ .. ]),
//
//
// 		// Internal options...
//
// 		// do not include length changes in flattened array diffs...
// 		// NOTE: if this is not set by user then this is set by Text's 
// 		//		.flatten(..) to exclude the .length changes form the 
// 		//		text diff.
// 		no_length: false | true,
//
// 		// element compare function...
// 		cmp: function(a, b){ .. },
// 	}
//
//
// Output format:
// 	{
// 		format: 'object-diff',
// 		structure: 'flat' | 'tree',
// 		version: '0.0.0',
//
// 		options: <user-options>,
//
// 		diff: <diff>,
// 	}
//
//
// NOTE: the format itself is JSON compatible (XXX) but the data in the 
// 		changes may not be, so if JSON compatibility is desired, the 
// 		inputs or at least the differences between them must be JSON 
// 		compatible.
var diff =
module.diff = 
function(A, B, options){
	options = options || {}
	return {
		format: 'object-diff',
		structure: options.tree_diff ? 'tree' : 'flat',
		varsion: '0.0.0',

		options: Object.assign({}, options),

		diff: options.tree_diff ? 
			Types.diff(A, B, options) 
			: Types.flatten(Types.diff(A, B, options), null, null, options)
	}}


var patch =
module.patch = 
function(diff, obj){
	return Types.patch(diff, obj) }




/**********************************************************************
* vim:set ts=4 sw=4 :                               */ return module })
