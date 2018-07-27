/**********************************************************************
* 
*
*
**********************************************************************/
((typeof define)[0]=='u'?function(f){module.exports=f(require)}:define)
(function(require){ var module={} // make module AMD/node compatible...
/*********************************************************************/

var object = require('ig-object')



/*********************************************************************/

var FORMAT_NAME = 'object-diff'
var FORMAT_VERSION = '0.0.0'



/*********************************************************************/
// XXX General ToDo:
//		- revise architecture...
//		- revise name -- this contains two parts:
//			1. diff / patch and friends
//			2. cmp and patterns
//		  we need the name to be short and descriptive, possible 
//		  candidates:
//		  	- objdiff / object-diff
//		  	- diffcmp / diff-cmp
//		  	- compare
//
//
//---------------------------------------------------------------------
// Helpers...

// 	zip(array, array, ...)
// 		-> [[item, item, ...], ...]
//
// 	zip(func, array, array, ...)
// 		-> [func(i, [item, item, ...]), ...]
//
// XXX revise -- is this too complicated???
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
// 	proxy('path.to.attr')
// 		-> method
//
// 	proxy('path.to.attr', function)
// 		-> method
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
// Placeholders...

//var ANY = {type: 'ANY_PLACEHOLDER'}
var NONE = {type: 'NONE_PLACEHOLDER'}
var EMPTY = {type: 'EMPTY_PLACEHOLDER'}



//---------------------------------------------------------------------
// Logic patterns...
//
// XXX add use-case docs...
// XXX need to avoid recursion...
//
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
var LogicTypeClassPrototype = {
}

var LogicTypePrototype = {
	__cmp__: function(obj, cmp){
		return false
	},
	// XXX need to track loops...
	cmp: function(obj, cmp, cache){
		cmp = cmp || function(a, b){
			return a === b 
				|| a == b 
				|| (a.__cmp__ && a.__cmp__(b, cmp, cache))
				|| (b.__cmp__ && b.__cmp__(a, cmp, cache)) }

		// cache...
		cache = cache || new Map()
		var c = cache.get(this) || new Map()
		cache.has(c) 
			|| cache.set(this, c)
		if(c.has(obj)){
			return c.get(obj)
		}

		var res = this.__cmp__(obj, cmp, cache)
			|| (obj.__cmp__ 
				&& obj.__cmp__(this, cmp, cache))
		c.set(obj, res)

		return res
	},
}

var LogicType = 
module.LogicType = 
object.makeConstructor('LogicType', 
		LogicTypeClassPrototype, 
		LogicTypePrototype)


// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
// Singleton, will compare to anything as true...
var ANY = 
module.ANY = 
new (object.makeConstructor('ANY', Object.assign(new LogicType(), {
	__cmp__: function(obj, cmp){ 
		return true },
})))()

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
// Will compare as true to anything but .value...
var NOT = 
module.NOT = 
object.makeConstructor('NOT', Object.assign(new LogicType(), {
	__cmp__: function(obj, cmp){
		return !cmp(this.value, obj) },
	__init__: function(value){
		this.value = value
	},
}))

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
// Will compare as true if one of the .members compares as true...
var OR = 
module.OR = 
object.makeConstructor('OR', Object.assign(new LogicType(), {
	__cmp__: function(obj, cmp){
		for(var m of this.members){
			if(cmp(m, obj)){
				return true
			}
		}
		return false
	},
	__init__: function(...members){
		this.members = members
	},
}))

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
// Will compare as true if all of the .members compare as true...
var AND = 
module.AND = 
object.makeConstructor('AND', Object.assign(new LogicType(), {
	__cmp__: function(obj, cmp){
		for(var m of this.members){
			if(!cmp(m, obj)){
				return false
			}
		}
		return true
	},
	__init__: function(...members){
		this.members = members
	},
}))



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
//
// 			// optional payload data...
// 			...
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
// 			// XXX not implemented...
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
// 	   			// XXX not implemented....
// 	   			[<key-a>, <key-b>, <diff>],
// 	   			...
// 	   		],
// 	   		// XXX not implemented...
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
// 			//
// 			// NOTE: insertion vs. splicing depends on the values of .A,
// 			//		.B and/or .path, see docs for those...
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
//			//				  NOTE: if both of the array items are arrays
//			//						it means that we are splicing array 
//			//						sections instead of array elements...
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
//
// 			// used if we are splicing array sections to indicate section
// 			// lengths, useful when splicing sparse sections...
// 			length: [a, b],
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
// XXX Q: do we need to support both the flat and tree diff formats???
var Types =
module.Types = {
	__cache: null,

	// Object-level utilities...
	clone: function(){
		var res = Object.create(this)
		res.__cache = null
		res.handlers = new Map(this.handlers.entries())
		return res
	},
	clear: function(){
		// XXX should we instead this.handlers.clear() ???
		this.handlers = new Map()
		return this
	},


	// Placeholder objects...
	//
	// Inseted when an item exists on one side and does not on the other.
	// 
	// NOTE: for Array items this does not shift positions of other item
	// 		positions nor does it affect the the array lengths.
	// NOTE: these are compared by identity while diffing but are compared
	// 		by value when patching...
	ANY: ANY,
	NONE: NONE,
	EMPTY: EMPTY,
	get DIFF_TYPES(){
		return new Set([
			this.ANY,
			this.NONE,
			this.EMPTY, 
		]) },


	// Type handlers...
	handlers: new Map(), 
	has: proxy('handlers.has'),
	// Get handler...
	//
	// 	.get(object)
	// 	.get(handler-type)
	// 	.get(handler-type-name)
	// 		-> handler | null
	//
	get: function(o){
		var h = this.handlers
		// get the type if there is no direct match...
		o = !h.has(o) ? this.detect(o) : o

		// resolve aliases...
		do {
			o = h.get(o)
		} while(o != null && h.has(o))

		return o
	},
	set: proxy('handlers.set', 
		function(res, key, handler){
			// auto-alias...
			key.name
				&& this.set(key.name, key)
			return res
		}),
	delete: proxy('handlers.delete'),

	// sorted list of types...
	// XXX do we need to cache this???
	get typeKeys(){
		var that = this
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
	get types(){
		var that = this
		return this.typeKeys
			.map(function(e){ 
				return that.get(e) })
	},
	get typeNames(){
		return this.typeKeys.map(function(e){ return e.name || e }) },


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
		var types = this.typeKeys

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

	// Handle the difference between A and B...
	//
	handle: function(type, obj, diff, A, B, options){
		// set .type
		type = type == null ? this.detect(A, B, options) : type
		obj.type = obj.type || (type.name ? type.name : type)

		// get the handler + resolve aliases...
		var handler = this.get(type)

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

	// Diff format walker...
	//
	walk: function(diff, func, path){
		// no changes...
		if(diff == null){
			return null
		}

		// flat diff...
		if(diff instanceof Array){
			return diff.map(func)

		// tree diff...
		} else {
			var handler = this.get(diff.type)
			if(handler == null || !handler.walk){
				throw new TypeError('Can\'t walk type: '+ diff.type)
			}
			return handler.walk.call(this, diff, func, path || [])
		}
	},

	// Flatten the tree diff format...
	//
	// XXX might be good to include some type info so as to enable patching 
	// 		custom stuff like Text...
	// XXX does change order matter here???
	// 		...some changes can affect changes after them (like splicing 
	// 		with arrays), this ultimately affects how patching is done...
	// 		...or is this a question of how we treat indexes and the patching 
	// 		algorithm???
	// XXX we should be able to provide "fuzz" (context, horizontal) to 
	// 		the changes in ordered containers...
	// 		...it might also be possible to provide vertical/topological 
	// 		"fuzz", need to think about this...
	flatten: function(diff, options){
		options = options || {}
		var res = []
		this.walk(diff, function(change){ res.push(change) })
		return res
	},


	// Reverse diff...
	//
	reverse: function(diff){
		var that = this
		return this.walk(diff, function(change){ 
			var c = Object.assign({}, change)

			// path...
			c.path = c.path.slice().map(function(e){
				return e instanceof Array ?
					e.slice().reverse()
					: e })

			that.types.forEach(function(type){
				type.reverse 
					&& (c = type.reverse.call(that, c)) })

			return c
		})
	},


	// User API...
	
	// Build a diff between A and B...
	//
	// NOTE: this will include direct links to items.
	// NOTE: for format info see doc for Types...
	//
	// XXX might be a good idea to make a .walk(..) version of this...
	// 		...i.e. pass a function a nd call it with each change...
	// XXX special case: empty sections do not need to be inserted...
	// 		...splice in a sparse array and store an Array diff with only 
	// 		length changed...
	// XXX do we need to differentiate things like: new Number(123) vs. 123???
	// XXX might be a god idea to mix in default options (different 
	// 		defaults per mode)...
	// XXX TEST: the format should survive JSON.parse(JSON.stringify(..))...
	diff: function(A, B, options, cache){
		var that = this
		options = options ? Object.create(options) : {}
		options.as_object = options.as_object || []

		// basic compare...
		// XXX nesting still does not work...
		// 		diff(OR([1,2], [2,1]), [1,2]) -> false (should be true)
		// XXX do we need to differentiate things like: new Number(123) vs. 123???
		var bcmp = function(a, b, cmp){
			return a === b 
				|| a == b 
				// basic patters...
				|| a === that.ANY 
				|| b === that.ANY 
				// logic patterns...
				// XXX not final...
				|| (a instanceof LogicType 
					&& a.cmp(b, cmp, cache))
				|| (b instanceof LogicType 
					&& b.cmp(a, cmp, cache)) }
		// deep compare...
		var cmp = options.cmp = options.cmp 
			|| function(a, b){
				return bcmp(a, b, cmp)
					// diff...
					// NOTE: diff(..) is in closure, so we do not need to 
					// 		pass options and cache down. 
					// 		see cache setup below...
					|| (diff(a, b) == null) }

		// cache...
		cache = this.__cache = cache || this.__cache || new Map()
		var diff = cache.diff = cache.diff || function(a, b){
			var l2 = cache.get(a) || new Map()
			var d = l2.get(b) || that.diff(a, b, options, cache)
			cache.set(a, l2.set(b, d))
			return d
		}


		// check: if same/matching object...
		// NOTE: this will essentially do a full diff of the input trees
		// 		skipping only the top level, the actual A and B...
		// NOTE: since actual A and B are not diffed here (as we start with
		// 		bcmp(..) and not cmp(..), see above note), it makes no 
		// 		sense to do a cache check after this as we will exit this
		// 		check with everything but the root cached/diffed...
		// 		XXX not sure if this is efficient...
		if(bcmp(A, B, cmp)){
			return null
		}

		// check: builtin types...
		if(this.DIFF_TYPES.has(A) || this.DIFF_TYPES.has(B)){
			return this.handle('Basic', {}, diff, A, B, options)
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

	// Deep-compare A and B...
	//
	cmp: function(A, B, options){
		return this.diff(A, B, options) == null },

	// Patch (update) obj via diff...
	//
	// XXX should we check for patch integrity???
	// 		bad patches would include:
	// 			- including both a.b and a.b.c is a conflict.
	patch: function(diff, obj, options){
		var that = this
		var NONE = diff.placeholders.NONE
		var EMPTY = diff.placeholders.EMPTY
		var options = diff.options

		// NOTE: in .walk(..) we always return the root object bing 
		// 		patched, this way the handlers have control over the 
		// 		patching process and it's results on all levels...
		// 		...and this is why we can just pop the last item and 
		// 		return it...
		// NOTE: this will do odd things for conflicting patches...
		// 		a conflict can be for example patching both a.b and 
		// 		a.b.c etc.
		return this
			.walk(diff.diff, function(change){
				// replace the object itself...
				if(change.path.length == 0){
					return change.B
				}

				var type = change.type || Object

				var parent
				var parent_key
				var target = change.path
					.slice(0, -1)
					.reduce(function(res, e){
							parent = res
							parent_key = e
							return res[e]
						}, obj)
				var key = change.path[change.path.length-1]

				// call the actual patch...
				var res = that.get(type).patch.call(that, target, key, change, obj, options)

				// replace the parent value...
				if(parent){
					parent[parent_key] = res

				} else {
					obj = res
				}

				return obj
			})
			.pop()
	},

	// Check if diff is applicable to obj...
	//
	check: function(diff, obj, options){
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
// 		//	Text:		100
// 		//		Needs to run checks before 'Basic' as its targets are
// 		//		long strings that 'Basic' also catches.
// 		//	Basic:		50
// 		//		Needs to be run before we do other object checks.
// 		//	Object:		-100
// 		//		Needs to run after everything else as it will match any
// 		//		set of objects.
// 		//
// 		// General guide:
// 		//	>50			- to be checked before 'Basic'
// 		//	<50 and >0	- after Basic but before unprioritized types
// 		//	<-50 and <0	- after unprioritized types but before Object
// 		//	<-100		- to be checked after Object -- this is a bit 
// 		//				  pointless in JavaScript.
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
// 		check: function(obj, options){ 
// 			.. 
// 		},
//
// 		// Handle/populate the diff of A and B...
// 		//
// 		// Input diff format:
// 		//	{
// 		//		type: <type-name>,
// 		//	}
// 		//
// 		handle: function(obj, diff, A, B, options){
// 			..
// 		},
//
// 		// Walk the diff...
// 		//
// 		// This will pass each change to func(..) and return its result...
// 		//
// 		//	.walk(diff, func, path)
// 		//		-> res
// 		//
// 		walk: function(diff, func, path){
// 			.. 
// 		},
//
// 		// Patch the object...
//		//
// 		patch: function(target, key, change, root, options){
// 			..
// 		},
//
// 		// Reverse the change...
//		//
// 		reverse: function(change){
// 			..
// 		},
// 	}
//
//
// NOTE: to add attribute checking to a specific type add it to 
// 		options.as_object...
// 		XXX need a more flexible way to configure this, preferably from 
// 			within the handler...
// 		XXX would also need to enable attribute filtering, at least for 
// 			arrays as this will also check all the number keys...
//
// XXX do not like that we need to explicitly pass context to helper 
// 		methods...
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
// NOTE: this does not need a .patch(..) method because it is not a 
// 		container...
Types.set('Basic', {
	priority: 50,

	check: function(obj, options){
		return typeof(obj) != 'object' },
	handle: function(obj, diff, A, B, options){
		;(!options.keep_none && A === NONE)
			|| (obj.A = A)
		;(!options.keep_none && B === NONE)
			|| (obj.B = B)
	},
	walk: function(diff, func, path){
		var change = Object.assign({
			path: path,
		}, diff)
		delete change.type
		return func(change)
	},
	reverse: function(change){
		var b = 'B' in change
		var a = 'A' in change 
		var t = change.B

		a ?
			(change.B = change.A)
			: (delete change.B)
		b ? 
			(change.A = t)
			: (delete change.A)

		return change
	},
})


// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
// Object...
// XXX add attr order support...
Types.set(Object, {
	priority: -100,

	handle: function(obj, diff, A, B, options){
		// attrebutes/items...
		obj.items = (obj.items || [])
			.concat(this.get(Object).attributes.call(this, diff, A, B, options))

		// XXX optional stuff:
		// 		- attr ordering...
		// 		- prototypes
	},
	walk: function(diff, func, path){
		var that = this
		return (diff.items || [])
			.map(function(e){
				var i = e[0]
				var p = path.concat([i])
				var v = e[1]

				return that.walk(v, func, p)
			})
	},
	// XXX add object compatibility checks...
	patch: function(obj, key, change){
		// object attr...
		if(typeof(key) == typeof('str')){
			if(this.cmp(change.B, EMPTY)){
				delete obj[key]

			} else {
				obj[key] = change.B
			}

		// array item...
		// XXX should this make this decision???
		} else {
			this.get(Array).patch.call(this, obj, key, change)
		}
		return obj
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
// XXX add item order support...
Types.set(Array, {
	handle: function(obj, diff, A, B, options){
		obj.length = A.length != B.length ? [A.length, B.length] : []
		obj.items = this.get(Array).items.call(this, diff, A, B, options)
	},
	walk: function(diff, func, path){
		var that = this
		var NONE = this.NONE
		var res = []
		//*/
		// items...
		return res.concat((diff.items || [])
			.map(function(e){
				var v = e[2]

				// index...
				var i = e[0] == e[1] ? 
					e[0] 
					: [e[0], e[1]]
				var p = path.concat([i])

				return that.walk(v, func, p)
			}))
			// length...
			// NOTE: we keep this last as the length should be the last 
			// 		thing to get patched...
			.concat(diff.length != null ?
				func({
					path: path.concat('length'),
					A: diff.length[0],
					B: diff.length[1],
				})
				: [])
	},
	// XXX add object compatibility checks...
	patch: function(obj, key, change){
		var i = key instanceof Array ? key[0] : key
		var j = key instanceof Array ? key[1] : key

		// sub-array manipulation...
		if(i instanceof Array){
			i = i[0]
			j = j[0]

			// XXX check compatibility...

			obj.splice(j, 
				'A' in change ? 
					change.A.length
					: change.length[0], 
				...('B' in change ? 
					change.B
					: new Array(change.length[1])))

		// item manipulation...
		} else {
			if(i == null){
				// XXX this will mess up the indexing for the rest of
				// 		item removals...
				obj.splice(j, 0, change.B)

			} else if(j == null){
				// obj explicitly empty...
				if('B' in change && this.cmp(change.B, EMPTY)){
					delete obj[i]

				// splice out obj...
				} else if(!('B' in change) || this.cmp(change.B, NONE)){
					// NOTE: this does not affect the later elements
					// 		indexing as it essentially shifts the 
					// 		indexes to their obj state for next 
					// 		changes...
					obj.splice(i, 1)

				// XXX
				} else {
					// XXX
					console.log('!!!!!!!!!!')
				}

			} else if(i == j){
				obj[j] = change.B

			} else {
				obj[j] = change.B
			}
		}
		
		return obj
	},
	reverse: function(change){
		if('length' in change){
			change.length = change.length.slice().reverse()
		}
		return change
	},

	// part handlers...
	items: function(diff, A, B, options){
		var NONE = this.NONE
		var EMPTY = this.EMPTY
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

				// split into two: a common-length section and tails of 
				// 0 and l lengths...
				var l = Math.min(a.length, b.length)
				var ta = a.slice(l)
				var tb = b.slice(l)
				// tail sections...
				// XXX hack???
				// XXX should we use a different type/sub-type???
				var tail = { type: 'Basic', }
				ta.filter(() => true).length > 0 
					&& (tail.A = ta)
				tb.filter(() => true).length > 0 
					&& (tail.B = tb)
				tail.length = [ta.length, tb.length]

				a = a.slice(0, l)
				b = b.slice(0, l)

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
					// clear matching stuff...
					 .filter(function(e){ 
						return e[2] != null})
					// splice array sub-sections...
					.concat(ta.length + tb.length > 0 ?
						[[
							[i+l],
							[j+l],
							tail,
						]]
						: [])
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
// XXX TEST: .patch(..)
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
	walk: function(diff, func, path){
		// use the array walk but add 'Text' type to each change...
		// NOTE: we need to abide by the protocol and call Array's 
		// 		.flatten(..) the context of the main object...
		return this.get(Array).walk.call(this, diff, function(c){
			// skip length changes...
			if(c.path[c.path.length-1] == 'length'){
				return
			}
			c.type = 'Text'
			return func(c)
		}, path)
	},

	// XXX this is not efficient...
	// 		...find a way to do all the changes in one go...
	// XXX add object compatibility checks...
	patch: function(obj, key, change){
		var lines = obj.split(/\n/)

		// remove line...
		if(!('B' in change) || change.B == this.NONE){
			lines.splice(key, 1)

		// insert line...
		} else if(!('A' in change) || change.A == this.NONE){
			lines.splice(key, 0, change.B)

		// replace line...
		} else {
			obj.split(/\n/)[key] = change.B
		} 
		
		return lines.join('\n')
	},
})



//---------------------------------------------------------------------
// Deep-compare objects...
//
// XXX would be nice to do a fast fail version of this, i.e. fail on 
// 		first mismatch and do not waste time compiling a full diff we 
// 		are going to throw away anyway...
// 		...this would be possible with a live .walk(..) that would 
// 		report changes as it finds them...
var cmp =
module.cmp =
function(A, B){
	return Types.clone().cmp(A, B) }


// Diff interface function...
//
// This is a front-end to Types.diff(..), adding a metadata wrapper to 
// the format, and optionally handling the topology of the output...
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
// 		// Plaeholders to be used in the diff..
// 		//
// 		// Set these if the default values conflict with your data...
// 		//
// 		// XXX remove these from options in favor of auto conflict 
// 		//		detection and hashing...
// 		NONE: null | { .. },
// 		EMPTY: null | { .. },
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
// 		version: '0.0.0',
// 		structure: 'flat' | 'tree',
// 		// NOTE: these are stored in the diff to make the diff independent
// 		//		of future changes to the values of the placeholder, both
// 		//		in spec and as means to avoid data collisions... 
// 		// NOTE: these are compared by identity while diffing but are 
// 		//		compared by value when patching...
//		placeholders: {
//			...
//		},
//
// 		options: <user-options>,
//
// 		diff: <diff>,
// 	}
//
//
// NOTE: the format itself is JSON compatible but the data in the changes 
// 		may not be, so if JSON compatibility is desired, the inputs or 
// 		at least the differences between them must be JSON compatible.
// NOTE: recursive inputs will result in recursive diff objects.
//
// XXX revise how the types can be passed in...
var diff =
module.diff = 
function(A, B, options, types){
	options = options || {}
	types = types || Types.clone()

	return {
		// system meta information...
		format: FORMAT_NAME,
		varsion: FORMAT_VERSION,
		structure: options.tree_diff ? 'tree' : 'flat',
		placeholders: {
			NONE: options.NONE || Types.NONE,
			EMPTY: options.NONE || Types.EMPTY,
		},

		// user data...
		options: Object.assign({}, options),

		diff: options.tree_diff ? 
			types.diff(A, B, options) 
			//: types.flatten(Types.diff(A, B, options), null, null, options)
			: types.flatten(Types.diff(A, B, options), options)
	}}


// Apply diff (patch) to obj...
//
// This is a front-end to Types.patch(..), handling loading the options
// from the diff...
//
var patch =
module.patch = 
function(diff, obj, options, types){
	var types = types || Types.clone()
	diff.placeholders 
		&& Object.assign(types, diff.placeholders)
	return types.patch(diff, obj, options) 
}



//---------------------------------------------------------------------
// XXX EXPERIMENTAL...

// XXX make this an instance of Types...
// XXX
var DiffClassPrototype = {
	// system meta information...
	format: FORMAT_NAME,
	version: FORMAT_VERSION,

	// XXX PROTOTYPE -- uses Types...
	cmp: function(A, B){
		return Types.clone().cmp(A, B) },

	// XXX
	fromJSON: function(json){
	},
}
// XXX hack...
//DiffClassPrototype.__proto__ = Types.clone()

// XXX
var DiffPrototype = {
	// system meta information...
	get format(){
		return this.constructor.format },
	get version(){
		return this.constructor.version },

	structure: null, 
	placeholders: null,
	options: null,
	diff: null,

	// XXX PROTOTYPE -- uses Types...
	__init__: function(A, B, options){
		// XXX should we add a default options as prototype???
		options = this.options = options || {}
		this.structure = options.tree_diff ? 'tree' : 'flat'
		this.placeholders = {
			NONE: options.NONE || Types.NONE,
			EMPTY: options.NONE || Types.EMPTY,
		}

		var types = types || Types.clone()

		// XXX should the Types instance be stored/cached here???
		this.diff = arguments.length == 0 ?
				null
			: options.tree_diff ? 
				types.diff(A, B, options) 
			: types.flatten(Types.diff(A, B, options), options)
	},

	// XXX should this be a deep copy???
	clone: function(){
		var res = new this.constructor()
		res.structure = this.structure
		res.placeholders = Object.assign({}, this.placeholders)
		// XXX should this be a deep copy???
		res.options = Object.assign({}, this.options)
		// XXX should this be a deep copy???
		res.diff = this.diff instanceof Array ? 
				this.diff.slice()
			: this.diff ?
				Object.assign({}, this.diff)
			: null
		return res
	},

	// NOTE: this will not mutate this...
	// XXX PROTOTYPE -- uses Types...
	reverse: function(obj){
		var res = this.clone()
		res.diff = Types.reverse(this.diff)
		return res
	}, 

	// XXX PROTOTYPE -- uses Types...
	check: function(obj){
		Types.clone().check(this.diff, obj) },
	// XXX PROTOTYPE -- uses Types...
	patch: function(obj){
		return Types.patch(this, obj) },
	unpatch: function(obj){
		return this.reverse().patch(obj) },

	// XXX need to normalize .diff and .options...
	json: function(){
		return {
			format: this.format,
			version: this.version,
			structure: this.structure,
			placeholders: this.placeholders,

			// XXX these need to be prepared for JSON compatibility...
			options: this.options,
			diff: this.diff,
		}
	},
}

var Diff = 
module.Diff = 
object.makeConstructor('Diff', 
		DiffClassPrototype, 
		DiffPrototype)
		



/**********************************************************************
* vim:set ts=4 sw=4 :                               */ return module })
