/**********************************************************************
* 
*
*
**********************************************************************/
((typeof define)[0]=='u'?function(f){module.exports=f(require)}:define)
(function(require){ var module={} // make module AMD/node compatible...
/*********************************************************************/

var object = require('ig-object')
var walk = require('generic-walk').walk



/*********************************************************************/

var FORMAT_NAME =
module.FORMAT_NAME = 'object-diff'

var FORMAT_VERSION =
module.FORMAT_VERSION = '0.0.0'

var MIN_TEXT_LENGTH = 100



/*********************************************************************/
//
// XXX General ToDo:
//		- revise architecture...
//			- merge Types and Diff (???)
//
//		- revise name -- this contains two parts:
//			1. diff / patch and friends
//			2. cmp and patterns
//		  we need the name to be short and descriptive, possible 
//		  candidates:
//		  	objdiff / object-diff
//		  	diffcmp / diff-cmp
//		  	compare
//		  available names:
//			ig-diff
//			cdiff
//		  	diffcmp / diff-cmp / cmpdiff / cmp-diff:
//		  	diff-tools
//			pattern-diff
//
//		- revise docs...
//			...should be simpler to enter, maybe example-oriented intro
//
//		- diff visualization -- for example see:
//			https://www.npmjs.com/package/jsondiffpatch
//
//		- diff compatibility checking...
//			diff.check(A) -> bool
//
//
//
//---------------------------------------------------------------------
// Helpers...

//	getAllKeys(obj)	
//		-> Set([key, ..])
//
// This is different to Object.keys(..) in that it gets both enumerable 
// and non-enumerable keys in the whole prototype chain...
//
// XXX should this be in object.js???
var getAllKeys = function(obj){
	var res = new Set()
	while(obj.__proto__ || obj === obj.__proto__){
		Object.getOwnPropertyNames(obj)
			.forEach(function(n){
				res.add(n) })
		obj = obj.__proto__ }
	return res }


// 	zip(array, array, ...)
// 		-> [[item, item, ...], ...]
//
// 	zip(func, array, array, ...)
// 		-> [func(i, [item, item, ...]), ...]
//
// XXX move this to ig-types
var zip = function(func, ...arrays){
	var i = arrays[0] instanceof Array ? 0 : arrays.shift()
	if(func instanceof Array){
		arrays.splice(0, 0, func)
		func = null }
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
			l = chunk.length += 1 }
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

		return res } 

	return _getCommonSections(0, 0) }


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
			b = e.B + e.length })

	return gaps }


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
			: res } }




//---------------------------------------------------------------------
// Logic patterns...
//
// NOTE: there seems to be no actual benefit from splitting patterns 
// 		into a separate module...
// 			- pointless without cmp(..) and thus diff.js
// 			- importing it alone is a mistake waiting to happen...
// 			- more work more abstraction, more code, more structure, 
// 				more notes and more maintenance...
// 			- more files to download/upload/...
// 		...the only thing in favor of the split are the warm-and-fuzzies
// 		of being modular, but in this case it's modularity for the sake 
// 		of modularity.
//
// XXX add use-case docs...
// XXX need to avoid recursion...
// XXX Q: should we avoid backtracking when pattern matching???
// 			...specifically when working with IN and OF...
// 		A: if possible yes...
// XXX diffing a mismatching pattern should yield the exact position 
// 		(sub-pattern/rule) that failed and not just the whole pattern...
// 		...usually a pattern chain fails, i.e. the nested failing pattern
// 		also fails its parent and so on, so it is not a trivial task 
// 		getting the source and probably the whole failed chain...
// 		...might be a good idea to build a trace failure pattern and 
// 		store it in .trace in the diff...
//
//
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
var LogicTypeClassPrototype = {
}

var LogicTypePrototype = {
	__context__: null,
	// Create a context instance...
	//
	// This instance holds the context .cache and .ns
	context: function(context){
		var res = (this.__context__ == null || context != null) ? 
			Object.create(this) 
			: this
		res.__context__ = res.__context__ || context || {} 
		return res },

	__cmp__: function(obj, cmp, context){
		return false },
	//
	// 	Deep compare this to obj...
	// 	.cmp(obj)
	// 		-> bool
	//
	// 	Deep compare this to obj in context...
	// 	.cmp(obj, context)
	// 		-> bool
	//
	// 	Compare this to obj using comparator cmp and an optional context...
	// 	.cmp(obj, cmp)
	// 	.cmp(obj, cmp, context)
	// 		-> bool
	//
	//
	// The cases where a cmp function is not provided this uses 
	// Diff.cmp(..) as a basis...
	//
	// XXX need to track loops...
	// XXX HACK???: this uses Diff.cmp(..) in simple cases...
	cmp: function(obj, cmp, context){
		// XXX HACK???
		if(arguments.length < 3 || !(cmp instanceof Function)){
			return Diff.cmp(
				cmp instanceof Function ? this : this.context(cmp),
				obj)
		}

		/*
		cmp = cmp || function(a, b){
			return a === b 
				//|| a == b 
				|| (a.__cmp__ && a.__cmp__(b, cmp, context))
				|| (b.__cmp__ && b.__cmp__(a, cmp, context)) }
		//*/
		context = context || this.context().__context__

		// cache...
		var cache = context.cache = context.cache || new Map() 
		var c = cache.get(this) || new Map()
		cache.has(c) 
			|| cache.set(this, c)
		if(c.has(obj)){
			return c.get(obj)
		}

		var res = this.__cmp__(obj, cmp, context)
			|| (obj != null 
				&& obj.__cmp__ 
				&& obj.__cmp__(this, cmp, context))

		// cache...
		c.set(obj, !!res)

		return !!res },
}

var Pattern = 
module.Pattern = 
object.Constructor('Pattern', 
		LogicTypeClassPrototype, 
		LogicTypePrototype)


// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
// Make a constructor/instance combination...
var makeCIPattern = function(name, check, init){
	var o = Object.assign(Object.create(LogicTypePrototype), { 
		__cmp__: check,
	})
	init
		&& (o.__init__ = init)
	return object.Constructor(name, o, o) }


// Singleton ANY...
//
// 	ANY
// 		-> pattern
//
// XXX AT('moo', ANY) matches L even if 'moo' in L is false...
var ANY = 
module.ANY = 
	makeCIPattern('ANY', 
		function(){ return true })()


// Null type pattern...
//
// 	NULL
// 		-> pattern
//
// This matches null and undefined.
var NULL = 
module.NULL = 
	makeCIPattern('NULL', 
		function(obj){ 
			return obj === null 
				|| obj === undefined 
				// XXX is this the right way to go?
				|| isNaN(obj) })()


// Bool pattern...
//
//	BOOL
//		-> pattern
//
var BOOL = 
module.BOOL = 
	makeCIPattern('BOOL', 
		function(obj){ 
			return obj === true || obj === false })()

// shorthand...
var B = module.B = BOOL


// Function pattern...
//
// 	FUNCTION
// 		-> pattern
//
// XXX add signature checking...
var FUNCTION = 
module.FUNCTION = 
	makeCIPattern('FUNCTION', 
		function(obj){ 
			return obj instanceof Function })()

// shorthand...
var F = module.F = FUNCTION


// String pattern...
//
//	STRING
//	STRING(string)
//	STRING(regexp)
//	STRING(func)
//	STRING(pattern)
//		-> pattern
//
var STRING = 
module.STRING = 
	makeCIPattern('STRING', 
		function(obj, cmp){ 
			return obj === STRING 
				|| (typeof(obj) == typeof('str') && this.value == null) 
				|| (typeof(obj) == typeof('str')
					&& (this.value instanceof RegExp ?
							this.value.test(obj)
						: typeof(this.value) == typeof('str') ?
							this.value == obj
						: this.value instanceof Function ?
							this.value(obj)
						// pattern...
						: this.value != null ?
							cmp(this.value, obj)
				   		: true	)) },
		function(value){ 
			this.value = value }) 

// shorthand...
var S = module.S = STRING


// Number pattern...
//
// 	NUMBER
// 	NUMBER(n)
// 	NUMBER(min, max)
// 	NUMBER(min, max, step)
// 	NUMBER(func)
// 	NUMBER(pattern)
// 		-> pattern
//
var NUMBER = 
module.NUMBER = 
	makeCIPattern('NUMBER', 
		function(obj, cmp){ 
			return obj === NUMBER 
				|| (typeof(obj) == typeof(123) && this.value == null) 
				|| (typeof(obj) == typeof(123) 
					&& (this.value.length == 1 
								&& typeof(this.value[0]) == typeof(123)?
							this.value[0] == obj
						// min/max...
						: this.value.length == 2 ?
							this.value[0] <= obj 
								&& this.value[1] > obj
						// min/max/step...
						: this.value.length == 3 ?
							this.value[0] <= obj 
								&& this.value[1] > obj
								&& (obj + (this.value[0] % this.value[2])) % this.value[2] == 0
						: this.value[0] instanceof Function ?
							this.value[0](obj)
						// pattern...
						: this.value[0] != null ?
							cmp(this.value[0], obj)
						: true )) },
		function(...value){ 
			this.value = value }) 

// shorthand...
var N = module.N = NUMBER


// Array pattern...
//
// 	ARRAY
// 	ARRAY(length)
// 	ARRAY(func)
// 	ARRAY(pattern)
// 	ARRAY(test, ...)
// 		-> pattern
//
// NOTE: func and pattern if given are applied to each array item and 
// 		the match is made iff for each item the function returns true or
// 		the pattern matches.
// NOTE: multiple tests (length, func, pattern) can be combined in any 
// 		order, this is a shorthand:
// 			ARRAY(4, STRING) 
// 		is the same as:
// 			AND(ARRAY(4), ARRAY(STRING))
// NOTE: order of arguments is not important, but it is possible to add
// 		a set of conflicting arguments...
var ARRAY = 
module.ARRAY = 
	makeCIPattern('ARRAY', 
		function(obj, cmp, context){ 
			return obj === ARRAY 
				//|| (obj instanceof Array && this.value.length == 0)
				|| (obj instanceof Array
					// XXX make this fail on first fail -- currently 
					// 		this runs every test on every elem...
					&& (this.value || []).filter(function(value){
							return (typeof(value) == typeof(123) ?
									obj.length == value
								// function...
								: value instanceof Function ?
									obj.filter(value).length == obj.length
								// pattern...
								: obj.filter(function(e){
										return cmp(value, e)
									}).length == obj.length)
						}).length == (this.value || []).length) }, 
		function(...value){ 
			this.value = value }) 

// shorthand...
// NOTE: yes, ARRAY does not even contain the letter "L" but this is 
// 		tradition ...and it starts off the work [L]ist ;)
var L = module.L = ARRAY


// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
// Will compare as true to anything but .value...
var NOT = 
module.NOT = 
object.Constructor('NOT', Object.assign(Object.create(Pattern.prototype), {
	__cmp__: function(obj, cmp, context){
		return !cmp(this.value, obj, context) },
	__init__: function(value){
		this.value = value },
}))

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
// Will compare as true if one of the .members compares true...
var OR = 
module.OR = 
object.Constructor('OR', Object.assign(Object.create(Pattern.prototype), {
	__cmp__: function(obj, cmp, context){
		for(var m of this.members){
			if(cmp(m, obj, context)){
				return true } }
		return false },
	__init__: function(...members){
		this.members = members },
}))

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
// Will compare as true if one and only one of .members compares true... 
// XXX TEST...
var XOR =
module.XOR = 
object.Constructor('XOR', Object.assign(Object.create(Pattern.prototype), {
	__cmp__: function(obj, cmp, context){
		var state = false
		var cur
		for(var m of this.members){
			cur = cmp(m, obj, context)
			if(state == cur && state){
				return false }
			state = cur }
		return state },
	__init__: function(...members){
		this.members = members },
}))

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
// Will compare as true if all of the .members compare as true...
var AND = 
module.AND = 
object.Constructor('AND', Object.assign(Object.create(Pattern.prototype), {
	__cmp__: function(obj, cmp, context){
		for(var m of this.members){
			if(!cmp(m, obj, context)){
				return false } }
		return true },
	__init__: function(...members){
		this.members = members },
}))


// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
// XXX BUG: 
// 		CONTEXT([ANY, ANY, ANY]).cmp([1, 2, 3]) 
// 			-> false
var CONTEXT = 
module.CONTEXT = 
object.Constructor('CONTEXT', Object.assign(Object.create(Pattern.prototype), {
	__cmp__: function(obj, cmp, context){
		return cmp(this.pattern, obj) },
	__init__: function(pattern){
		this.pattern = arguments.length == 0 ? 
			ANY 
			: pattern },
}))

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
var VAR = 
module.VAR = 
object.Constructor('VAR', Object.assign(Object.create(Pattern.prototype), {
	__cmp__: function(obj, cmp, context){
		var context = context || this.context().__context__
		var ns = context.ns = context.ns || {}
		var pattern = ns[this.name] = 
			this.name in ns ?
				ns[this.name] 
				: this.pattern
		if(cmp(pattern, obj)){
			ns[this.name] = obj 
			return true }
		return false },
	__init__: function(name, pattern){
		this.name = name
		this.pattern = arguments.length < 2 ? 
			ANY 
			: pattern },
}))

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
// this is like VAR(..) but will do a structural compare...
var LIKE = 
module.LIKE = 
object.Constructor('LIKE', Object.assign(Object.create(VAR.prototype), {
	__cmp__: function(obj, cmp, context){
		var context = context || this.context().__context__
		return VAR.prototype.__cmp__.call(this, obj, cmp, context)
			|| Diff.cmp(
				this.name in context.ns ?
					context.ns[this.name] 
					: this.pattern,
				obj) },
}))


// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
// TEST(func) == L iff func(L) is true.
var TEST = 
module.TEST = 
object.Constructor('TEST', Object.assign(Object.create(Pattern.prototype), {
	__cmp__: function(obj, cmp, context){
		return this.func(obj, cmp, context) },
	__init__: function(func){
		this.func = func }
}))


// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
// IN(A) == L iff A contained in L
//
// NOTE: since this can do a search using cmp(..) thid will be slow on 
// 		large containers...
// NOTE: to test if a key exists use AT(key)
var IN = 
module.IN = 
object.Constructor('IN', Object.assign(Object.create(Pattern.prototype), {
	// XXX make this a break-on-match and not a go-through-the-whole-thing
	// XXX should we check inherited stuff???
	__cmp__: function(obj, cmp, context){
		var p = this.value
		return ((obj instanceof Map || obj instanceof Set) ? 
			[...obj.values()]
			: [])
				.concat(Object.values(obj))
				.reduce(function(res, e){
					return res === false ? 
						!!cmp(p, e, context) 
						: res 
				}, false) },
	__init__: function(value){
		this.value = value },
}))

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
// AT(K, A) == L iff A in L and L[K] == A
//
// If K is a pattern or a path containing a pattern this works in the 
// following stages:
// 	1) select all the keys/paths that match K
// 	2) get all the values at the matching paths
// 	3) return true if ALL the values match A
//
// NOTE: this also supports path keys -- i.e. array of path elements that
// 		will be traversed and the last one checked...
// NOTE: to include an array as an explicit key (Map/...) wrap it in 
// 		an array:
// 			AT([[123]], ...)
//
// XXX pattern keys are still experimental, and the exact matching rules 
// 		may still change...
// 		...not yet sure if on step #3 we should require ALL or at least 
// 		one match, though I'm leaning towards ALL...
// XXX this falls into recursion on:
// 		X = AT('moo')
// 		X.value = OR(123, X)
// 		cmp(X, {'moo', 333})
// 			...this would also break on checking a recursive structure against 
// 			a recursive pattern...
// XXX should this also check inherited keys???
// XXX support Maps, ...
var AT = 
module.AT = 
object.Constructor('AT', Object.assign(Object.create(Pattern.prototype), {
	__cmp__: function(obj, cmp, context){
		var key = this.key instanceof Array ? this.key : [this.key]
		var value = this.value
		//return key
		var res = key
			.reduce(function(o, k){
				return o
					.map(function(o){
						return o == null ? 
								[]
							// pattern key,,,
							: k instanceof Pattern ?
								[...getAllKeys(o)]
									.filter(function(n){
										return cmp(k, n, context) })
									.map(function(n){ 
										return o[n] })
							// normal key...
							// NOTE: we are not using 'k in o' here because 
							// 		only objects are supported by the in 
							// 		operator and we can get any value...
							: getAllKeys(o).has(k) ?
								[o[k]] 
							// key not in container...
							: [] })
					// flatten the list of candidates...
					.reduce(function(o, e){ 
						return o.concat(e) }, []) }, [obj])
			/*
			.filter(function(e){
				return cmp(e, value, context)})
			// at least one must match...
			.length > 0
			//*/
		return obj != null
	   		&& res.length > 0	
			&& res
				.filter(function(e){
					return cmp(e, value, context)})
				// all must match...
				.length == res.length },
	__init__: function(key, value){
		this.key = key
		this.value = arguments.length < 2 ? 
			ANY 
			: value },
}))

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
// XXX ORDERED(A, B, ..) == L iff A is before B, B is before C, ... etc.
var ORDERED = 
module.ORDERED = 
object.Constructor('ORDERED', Object.assign(Object.create(Pattern.prototype), {
	__cmp__: function(obj, cmp){
		// XXX
	},
	__init__: function(...items){
		this.items = items },
}))

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
// XXX ADJACENT(A, B, ..) == L iff A directly before B, B directly before C, ...
var ADJACENT = 
module.ADJACENT = 
object.Constructor('ADJACENT', Object.assign(Object.create(Pattern.prototype), {
	__cmp__: function(obj, cmp){
		// XXX
	},
	__init__: function(...items){
		this.items = items },
}))

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
// XXX OF(A, N) == L iff L contains N occurrences of A
// XXX this is a potential problem as it would require us to look ahead 
// 		on matching...
var OF = 
module.OF = 
object.Constructor('OF', Object.assign(Object.create(Pattern.prototype), {
	__cmp__: function(obj, cmp){
		// XXX
	},
	__init__: function(value, count){
		this.count = count
		this.value = value },
}))


//---------------------------------------------------------------------
// Placeholders...
//
// NOTE: these can be anything as long as they are unique and JSON 
// 		compatible. This is done specifically to enable replacing the 
// 		actual values before diffing to avoid clashes with the input 
// 		objects -- this can occur as we use cmp(..) to structurally 
// 		compare values on the patch stage rather than identity 
// 		compares (i.e. '===') as all object linking can/will be severed 
// 		by JSON.stringify(..).
// NOTE: using Symbol(..) here is a bad idea because symbols are not 
// 		serializable to JSON.

// Used to represen non-existent items.
var NONE = {type: 'NONE_PLACEHOLDER'}

// Used to represent empty item slots (in sparse arrays).
var EMPTY = {type: 'EMPTY_PLACEHOLDER'}



//---------------------------------------------------------------------
// Diff framework...
//
//
// General architecture:
// 	Types
// 		Low-level diff routines.
// 	Diff
// 		User interface to Types.
// 		XXX should this encapsulate or inherit (current) or do a mix of two??
// 			...a mix of the two seems logical as we might need access to 
// 			the type handlers (proxy) and the rest of the low-level stuff 
// 			can be hidden apart for very specific things (.cmp(..))...
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
// 				[[<key-a>, <length>], [<key-b>, <length>], <diff>],
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
//			//	[<key>, <key>]
//			//				- a set of 2 keys for A and B respectively,
//			//				  <key> can be one of:
//			//					null			- item does not exist.
//			//					index			- item index.
//			//					[index, length]	- item is a sub-array and
//			//										will replace a section
//			//										of length length. 
//			//				  if both of the array items are arrays it 
//			//				  means that we are splicing array sections 
//			//				  instead of array elements...
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
var Types =
module.Types = {
	// system meta information...
	format: FORMAT_NAME,
	version: FORMAT_VERSION,

	// Object-level utilities...
	clone: function(){
		var res = Object.create(this)
		//res.__cache = null
		res.handlers = new Map([...this.handlers
			.entries()]
			.map(function(e){ 
				return [
					e[0], 
					e[1].handle ? 
						Object.create(e[1]) 
						: e[1]
				] }))
		return res },
	clear: function(){
		// XXX should we instead this.handlers.clear() ???
		//this.handlers = new Map()
		this.handlers.clear()
		return this },


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

		return o },
	set: proxy('handlers.set', 
		function(res, key, handler){
			// auto-alias...
			key.name
				&& this.set(key.name, key)
			return res }),
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
					&& order.set(k, i++) })
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
					: order.get(a) - order.get(b) }) },
	get typeNames(){
		return this.typeKeys
			.map(function(e){ 
				return e.name || e }) },
	get types(){
		var that = this
		return this.typeKeys
			.map(function(e){ 
				return that.get(e) }) },

	// helper...
	typeCall: function(type, func, ...args){
		return this.get(type)[func].call(this, ...args) },


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
	// Basic type detection rules (single object):
	// 	1. use type's .check(..) to check object belongs to a type
	// 	2. use instanceof / .constructor to get object type
	//
	// NOTE: for single object stage 2 will return the actual object 
	// 		type (.constructor)
	//
	//
	// Basic common type detection rules:
	// 	- A and B types mismatch
	// 		-> 'Basic'
	// 	- A and B types match and type handler is in .types
	// 		-> type
	// 	- A and B types match and type handler is NOT in .types
	// 		-> 'Basic'
	//
	detect: function(A, B, options){
		var type
		var types = this.typeKeys

		// explicit checkers have priority over instance tests...
		for(var t of types){
			var h = this.get(t)
			if(h.compatible
					&& h.compatible(A, options)){
				type = t
				break } }

		// search instances...
		if(!type){
			//type = Object
			type = A != null ? A.constructor : null
			for(var t of types){
				// leave pure objects for last...
				if(t === Object 
						// skip non-conctructor stuff...
						|| !(t instanceof Function)){
					continue }

				// full hit -- type match...
				if(A instanceof t){
					type = t
					break } } }

		// combinational types...
		if(B !== undefined){
			var typeB = this.detect(B, undefined, options)

			// type match...
			if(type === typeB && this.has(type)){
				return type

			// partial hit -- type mismatch...
			} else {
				return 'Basic' } }

		return type },

	// Handle the difference between A and B...
	//
	// NOTE: this uses .detect(..) for type detection.
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
			throw new TypeError('Diff: can\'t handle: ' + type) }

		// call the handler...
		handler.handle ?
			handler.handle.call(this, obj, diff, A, B, options)
			: handler.call(this, obj, diff, A, B, options)

		return obj },

	// Diff format walker...
	//
	walk: function(diff, func, path){
		// no changes...
		if(diff == null){
			return null }
		// flat diff...
		if(diff instanceof Array){
			return diff.map(func)

		// tree diff...
		} else {
			var handler = this.get(diff.type)
			if(handler == null || !handler.walk){
				throw new TypeError('Can\'t walk type: '+ diff.type) }
			return handler.walk.call(this, diff, func, path || []) } },

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
		return res },


	// User API...

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

			return c }) },

	// Filter diff changes and return a new diff...
	//
	// 	.filter(path)
	// 	.filter(func)
	// 		-> diff
	//
	// path can be either a '/' separated string of path elements or 
	// an array...
	//
	// path if given as a string supports the following syntax:
	// 	*		- matches any single path element (like ANY)
	// 	a|b		- matches either a or b
	// 	!a		- matches anything but a
	// 	XXX do we need grouping and quoting???
	//
	// Special case: 
	// 	**		- matches 0 or more path elements
	// 				NOTE: '**' can't be used with other patterns from 
	// 					the above.
	//
	// NOTE: array path also supports patterns...
	// XXX should this use cmp(..) or this.cmp(..)
	filter: function(diff, filter){
		// string filter...
		filter = typeof(filter) == typeof('str') ? 
			filter
				.trim()
				// remove leading and trailing '/' or '\'
				.replace(/(^[\\\/]+|[\\\/]+$)/g, '')
				.split(/[\\\/]+/) 
				// 'a|b'	-> OR('a', 'b')
				// '*'		-> ANY
				// '!a'		-> NOT('a')
				// NOTE: '**' is handled differently and later...
				.map(function(e){ 
					e = e
						.split(/\|/)
						.map(function(e){
							return e == '*' ? ANY 
								: e[0] == '!' ? NOT(e.slice(1))
								: e })
					return e.length == 1 ? 
						e[0] 
						: OR(...e) })
			: filter

		// path filter (non-function)...
		if(!(filter instanceof Function)){
			// normalize path...
			// format:
			// 	[
			// 		'**' | [ .. ],
			// 		...
			// 	]
			// XXX when OF(..) is ready, replace '**' with OF(ANY, ANY)...
			var pattern = (filter instanceof Array ? filter : [filter])
				// remove consecutive repeating '**'
				.filter(function(e, i, lst){
					return e == '**' && lst[i-1] != '**' || true })
				// split to array sections at '**'...
				.reduce(function(res, e){
					var n = res.length-1
					e == '**' ? 
						res.push('**') 
					: (res.length == 0 || res[n] == '**') ? 
						res.push([e])
					: res[n].push(e)
					return res }, [])

			// min length...
			var min = pattern
				.reduce(function(l, e){ 
					return l + (e instanceof Array ? e.length : 0) }, 0)

			// XXX account for pattern/path end...
			var test = function(path, pattern){
				return (
					// end of path/pattern...
					path.length == 0 && pattern.length == 0 ?
						true
						
					// consumed pattern with path left over -> fail...
					: (path.length > 0 && pattern.length == 0)
					   		|| (path.length == 0 && pattern.length > 1)?
						false
						
					// '**' -> test, skip elem and repeat...
					: pattern[0] == '**' ?
						(test(path, pattern.slice(1))
							|| test(path.slice(1), pattern))
							
					// compare sections...
					: (cmp(
							path.slice(0, pattern[0].length),
							pattern[0])
						// test next section...
						&& test(
							path.slice(pattern[0].length),
							pattern.slice(1)))) }

			// XXX Q: should we ignore the last element of the path???
			filter = function(change, i, lst){
				return test(change.path, pattern) } }

		return diff.filter(filter.bind(this)) },

	// XXX there are two approaches to this:
	// 		1) naive: simply concatenate all the changes in order...
	// 		2) filter and merge changes based on path...
	// XXX ...another way to go might be to apply the diffs in sequence 
	// 		to an empty object and then reconstruct a single diff from 
	// 		the result...
	// 		...this would require us to do this on both A and B sides,
	// 		i.e. build-then-change...
	// XXX do we need a conflict resolution policy???
	merge: function(diff, other){
		// XXX
		return this.flatten(diff).concat(this.flatten(other)) },

	// Build a diff between A and B...
	//
	// NOTE: this will include direct links to items.
	// NOTE: for format info see doc for Types...
	//
	// XXX BUG:
	// 		.diff([], {})
	// 			-> {
	// 					B: {},
	// 					path: [],
	// 				}
	// 			should also contain 'A: [],' !!!
	// XXX might be a good idea to make a .walk(..) version of this...
	// 		...i.e. pass a function and call it with each change...
	// XXX special case: empty sections do not need to be inserted...
	// 		...splice in a sparse array and store an Array diff with only 
	// 		length changed...
	// XXX do we need to differentiate things like: new Number(123) vs. 123???
	// XXX might be a god idea to mix in default options (different 
	// 		defaults per mode)...
	// XXX TEST: the format should survive JSON.parse(JSON.stringify(..))...
	diff: function(A, B, options, context){
		var that = this
		options = options ? Object.create(options) : {}
		options.as_object = options.as_object || []

		// basic compare...
		// XXX do we need to differentiate things like: new Number(123) vs. 123???
		var bcmp = function(a, b, cmp){
			// NOTE: we can't use a == b directly because of things like
			// 		[2] == 2 -> true...
			return a === b 
				// special-case: NaN...
				|| (isNaN(a) && isNaN(b))
				// basic patters...
				|| a === that.ANY 
				|| b === that.ANY 
				// logic patterns...
				|| (a instanceof Pattern 
					&& a.cmp(b, cmp, context))
				|| (b instanceof Pattern 
					&& b.cmp(a, cmp, context)) }
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
		context = context 
			|| (A instanceof Pattern ? A.context().__context__ 
				: B instanceof Pattern ? B.context().__context__ 
				: {})
		cache = context.cache = context.cache || new Map()
		// cached diff...
		var diff = cache.diff = cache.diff 
			|| function(a, b){
				var l2 = cache.get(a) || new Map()
				var d = l2.get(b) || that.diff(a, b, options, context)
				cache.set(a, l2.set(b, d))
				return d }


		// check: if same/matching object...
		// NOTE: this will essentially do a full diff of the input trees
		// 		skipping only the top level, the actual A and B...
		// NOTE: since actual A and B are not diffed here (as we start with
		// 		bcmp(..) and not cmp(..), see above note), it makes no 
		// 		sense to do a cache check after this as we will exit this
		// 		check with everything but the root cached/diffed...
		// 		XXX not sure if this is efficient...
		if(bcmp(A, B, cmp)){
			return null }

		// check: builtin types...
		if(this.DIFF_TYPES.has(A) || this.DIFF_TYPES.has(B)){
			return this.handle('Basic', {}, diff, A, B, options) }

		// find the matching type...
		var type = this.detect(A, B, options)
		// handle type...
		var res = this.handle(type, {}, diff, A, B, options)
		// handle things we treat as objects (skipping object itself)...
		if(!options.no_attributes 
				&& !this.get(type).no_attributes){
			// XXX need to strip array items from this...
			this.handle(Object, res, diff, A, B, options) }

		// cleanup -- remove items containing empty arrays...
		Object.keys(res)
			.filter(function(k){ 
				return res[k] instanceof Array && res[k].length == 0 })
			.map(function(k){
				delete res[k] })

		// return only non-empty diff states...
		return Object.keys(res).length == 1 ? 
			null 
			: res },

	// XXX can we split out the diff walker and simply reuse it for: 
	// 		.diff(..), .cmp(..), ...
	// 		...use ImageGrid's browser2.js .walk(..) as a basis...
	// XXX this will produce a flat result out of the box...
	// XXX this eliminates the need for .flatten(..)
	// XXX do we need context???
	// XXX Q: will this blow up on recursive objects???
	// 		I think no... (needs testing)
	// 		...do we need a tree/recursive format to support object recursion???
	// 		might be  good idea to add an option to do two diff outputs:
	// 		- recursive
	// 		- flat
	_diff: function(A, B, options, context){
		options = options || {}
		var that = this

		// XXX revise...
		// XXX can there be a nested pattern that needs a context???
		// 		...should this be done in walk(..)???
		context = context 
			|| (A instanceof Pattern ? A.context().__context__ 
				: B instanceof Pattern ? B.context().__context__ 
				: {})

		// cache format:
		// 	Map([
		// 		[<obj_a>, Map([
		//			// <obj_a> and <obj_b0> match... 
		// 			[<obj_b0>, true],
		//			// <obj_a> and <obj_b1> do not match...
		// 			[<obj_b1>, [
		// 				// relative changes...
		// 				// NOTE: change.path is relative to obj_a 
		// 				//		and may need to be updated to 
		// 				//		reflect the actual change in A/B...
		// 				<change>,
		// 				...
		// 			]],
		// 			...
		// 		])],
		// 		...
		// 	])
		var cache = context.cache = context.cache || new Map()

		// basic compare...
		// XXX do we need to differentiate things like: new Number(123) vs. 123???
		// XXX we need to maintain the context here...
		// 		...do we need two contexts here??? -- walk(..) has it's 
		// 		context + the pattern also has a context...
		var cmp = function(a, b){
			// NOTE: we can't use a == b directly because of things like
			// 		[2] == 2 -> true...
			return a === b 
				// special-case: NaN...
				|| (isNaN(a) && isNaN(b))
				// basic patters...
				|| a === that.ANY 
				|| b === that.ANY 
				// logic patterns...
				|| (a instanceof Pattern 
					&& a.cmp(b, cmp, context))
				|| (b instanceof Pattern 
					&& b.cmp(a, cmp, context)) }

		// cached diff...
		// XXX this needs cache...
		var diff = function(a, b){
			var l2 = cache.get(a) || new Map()
			var d = l2.get(b) || that._diff(a, b, options, context)
			cache.set(a, l2.set(b, d))
			return d }

		// XXX ???
		options.cmp = cmp

		// make change path updater...
		//
		// 	returns a function: 
		// 	- create a copy of the change
		// 	- concatenate change.path to base
		var updatePath = function(base){
			return function(e){
				return Object.assign({}, 
					e, 
					{ path: base.concat(e.path) }) } }

		return walk(
			function(diff, node, next, stop){
				var path = node[0]
				var A = node[1]
				var B = node[2]

				var cache_l2 = cache.get(A) || new Map()

				// uncached compare...
				// NOTE: if we already matched A and B they are already 
				// 		in cache and we do not need to push anything...
				if(!cache_l2.has(B)){
					// we have a match -> no changes, just cache...
				   	if(cmp(A, B)){
						cache.set(A, cache_l2.set(B, undefined))
						return }

					// handler...
					var handler = that.get(
						(that.DIFF_TYPES.has(A) || that.DIFF_TYPES.has(B)) ?
							'Basic' 
							: that.detect(A, B, options))
					// normalize...
					handler = handler instanceof Function ?
							handler
						: handler && handler._handle ?
							// NOTE: we do not care about the original 
							// 		context here as we are going to 
							// 		.call(..) anyway...
							handler._handle
						: false
					// unhandled type...
					if(!handler){
						throw new TypeError('Diff: can\'t handle: ' + type) }

					// call the handler...
					var res = handler.call(that, A, B, next, options)

					cache.set(A, cache_l2.set(B, res))

					return diff.concat(res
						.map(updatePath(path)))

				// return the cached values...
				} else {
					var res = cache_l2.get(B)
					return res == null ? 
						res 
						: diff.concat(res
							.map(updatePath(path))) } }, 
			// diff...
			[],
			// node format: 
			// 	[ <path>, <A>, <B> ]
			[[], A, B]) },

	// Deep-compare A and B...
	//
	// XXX would be nice to do a fast fail version of this, i.e. fail on 
	// 		first mismatch and do not waste time compiling a full diff we 
	// 		are going to throw away anyway...
	// 		...this would be possible with a live .walk(..) that would 
	// 		report changes as it finds them...
	cmp: function(A, B, options, context){
		return this.diff(A, B, options, context) == null },

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
		return this.postPatch(this
			.walk(diff.diff, function(change){
				// replace the object itself...
				if(change.path.length == 0){
					return change.B }

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

				var type = change.type || Object

				// call the actual patch...
				var res = that.typeCall(type, 'patch', target, key, change, obj, options)

				// replace the parent value...
				if(parent){
					parent[parent_key] = res

				} else {
					obj = res }

				return obj })
			.pop()) },
	// Call the post-patch method of the handlers...
	//
	postPatch: function(res){
		var that = this
		return [...this.types]
			.filter(function(e){ 
				return !!e.postPatch })
			.reduce(function(r, e){
				return e.postPatch.call(that, r) }, res) },


	// XXX need to support different path element types...
	// 		...in addition to Object and Array items, support Map, Set, ...
	getPath: function(obj, path){
		return path
			.reduce(function(res, e){
				return res[e] }, obj) },


	// Check if diff is applicable to obj...
	//
	// XXX should this return a diff???
	// XXX need a custom check for custom handler...
	// 		...we also have a name clash whit .check(..) that checks if
	// 		the object type is compatible to handler...
	// XXX EXPERIMENTAL...
	// 		...this seems to be mirroring most of the patch architecture
	// 		need to either merge or generalize...
	check: function(diff, obj, options){
		var that = this
		options = options || {}
		var NONE = options.NONE || this.NONE
		var EMPTY = options.EMPTY || this.EMPTY

		return this.flatten(diff)
			.filter(function(change){
				var key = change.path[change.path.length-1]
				var target = change.path
					.slice(0, -1)
					.reduce(function(res, k){ 
						return res[k] }, obj)

				// check root...
				if(key == null){
					return !that.cmp(change.A, target) }

				// keep only the mismatching changes...
				return change.type && that.get(change.type).check ?
						!that.typeCall(change.type, 'check', target, key, change)
					: !('A' in change) || change.A === NONE ?
						!(key in target)
					: change.A === EMPTY ?
						!(!(key in target) && target[key] === undefined)
					// XXX should this be handled by Array???
					: key instanceof Array ? (
						key[0] instanceof Array ?
							!that.cmp(change.A, 
								target.slice(key[0][0], key[0][0] + target.length[0]))
						: !that.cmp(change.A, target[key[0]]))
					: !that.cmp(change.A, target[key]) }) },
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
// 		//	<=50 and <0	- after unprioritized types but before Object
// 		//	<=100		- to be checked after Object -- this is a bit 
// 		//				  pointless in JavaScript.
// 		//
// 		// NOTE: when this is set to 0, then type will be checked in 
// 		//		order of occurrence...
// 		priority: number | null,
//
//		// If set to true will disable additional attribute diffing on 
//		// matching objects...
// 		no_attributes: false | true,
//
//
// 		// Check if obj is compatible (optional)...
// 		//
// 		// 	.compatible(obj[, options])
// 		//		-> bool
// 		//
// 		compatible: function(obj, options){ 
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
// 		// NOTE: by default this will not handle attributes (.attrs), so
// 		//		if one needs to handle them Object's .walk(..) should be 
// 		//		explicitly called...
// 		//		Example:
// 		//			walk: function(diff, func, path){
// 		//				var res = []
// 		//
// 		//				// handle specific diff stuff...
// 		//				
// 		//				return res
// 		//					// pass the .items handling to Object
// 		//					.concat(this.typeCall(Object, 'walk', diff, func, path))
// 		//			}
// 		//		XXX can this be automated???
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
// 		// Finalize the patch process (optional)...
// 		//
// 		// This is useful to cleanup and do any final modifications.
// 		//
// 		// This is expected to return the result.
// 		//
// 		// see: 'Text' for an example.
// 		postPatch: function(result){
// 			..
//
// 			return result
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
	no_attributes: true,

	compatible: function(obj, options){
		return obj === null || typeof(obj) != 'object' },
	handle: function(obj, diff, A, B, options){
		;(!options.keep_none && A === NONE)
			|| (obj.A = A)
		;(!options.keep_none && B === NONE)
			|| (obj.B = B) },
	walk: function(diff, func, path){
		var change = Object.assign({
			path: path,
		}, diff)
		delete change.type
		return func(change) },
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

		return change },

	_handle: function(A, B, next, options){
		var obj = {
			path: [],
		}

		;(!options.keep_none && A === NONE)
			|| (obj.A = A)
		;(!options.keep_none && B === NONE)
			|| (obj.B = B)

		return [obj] },
})


// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
// Object...
// XXX add attr order support...
Types.set(Object, {
	priority: -100,
	// NOTE: the object will itself handle the attributes, no need for a 
	// 		second pass...
	no_attributes: true,

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
			}) },
	// XXX add object compatibility checks...
	patch: function(obj, key, change, ...rest){
		var EMPTY = this.EMPTY
		// object attr...
		if(typeof(key) == typeof('str')){
			if(this.cmp(change.B, EMPTY)){
				delete obj[key]

			} else {
				obj[key] = change.B }

		// array item...
		// XXX should this make this decision???
		} else {
			this.typeCall(Array, 'patch', obj, key, change, ...rest) }
		return obj },

	// XXX EXPERIMENTAL...
	get: function(obj, key){
		return typeof(key) == typeof('str') ?
			obj[key]
			: this.typeCall(Array, 'get', obj, key) },
	set: function(obj, key, value){
		// XXX
	},

	// part handlers...
	//
	// NOTE: attr filtering depends on the order that Object.keys(..) 
	// 		returns indexed items and attributes it...
	attributes: function(diff, A, B, options){
		// get the attributes...
		// special case: we omit array indexes from the attribute list...
		var kA = Object.keys(A)
		kA = A instanceof Array ? 
			kA.slice(A.filter(function(){ return true }).length)
			: kA
		var kB = Object.keys(B)
		kB = B instanceof Array ? 
			kB.slice(B.filter(function(){ return true }).length)
			: kB

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
					return res })
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
		return items },


	// XXX EXPERIMENTAL: used by Types._diff(..)
	//_walk: function(){},
	// XXX add attribute order support...
	_handle: function(A, B, next, options){
		var diff = this.get(Object)._attributes.call(this, A, B, options) 
			// merge node differences...
			.reduce(function(res, attr){
				return res.concat(next('do', [], attr)) }, [])
			// clean out matches...
			.filter(function(e){
				return e != null })
		// XXX add attribute order support...
		// XXX
		return diff },
	// return aligned attr sets...
	// 	format:
	// 		[
	// 			[[<key>], <A> | EMPTY, <B>],
	// 			// or:
	// 			[[<key>], <A>, <B> | EMPTY],
	// 			...
	// 		]
	_attributes: function(A, B, options){
		// get the attributes...
		// special case: we omit array indexes from the attribute list...
		var kA = Object.keys(A)
		kA = A instanceof Array ? 
			kA.slice(A.filter(function(){ return true }).length)
			: kA
		var kB = Object.keys(B)
		kB = B instanceof Array ? 
			kB.slice(B.filter(function(){ return true }).length)
			: kB

		var B_index = kB.reduce(function(res, k){
			res[k] = null 
			return res
		}, {})

		var items = kA
				// A keys...
				.map(function(ka){
					var res = [
						[ka], 
						A[ka], 
						ka in B_index ? B[ka] : EMPTY,
					] 
					// remove seen keys...
					delete B_index[ka]
					return res })
				// keys present only in B...
				.concat(Object.keys(B_index)
					.map(function(kb){
						return [
							[kb], 
							EMPTY, 
							B[kb],
						]}))
		return items },
})


// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
// Array...
// XXX add item order support...
Types.set(Array, {
	handle: function(obj, diff, A, B, options){
		obj.length = A.length != B.length ? [A.length, B.length] : []
		obj.items = this.typeCall(Array, 'items', diff, A, B, options)
	},
	// XXX need to encode length into path/index...
	walk: function(diff, func, path){
		var that = this
		var NONE = this.NONE
		var attrs = []
		// items...
		return (diff.items || [])
			.filter(function(e){ 
				return e.length == 2 ? 
					attrs.push(e) && false 
					: true })
			.map(function(e){
				var v = e[2]

				// index...
				var i = e[0] == e[1] ? 
						e[0] 
					: [e[0], e[1]]
				var p = path.concat([i])

				return that.walk(v, func, p) })
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
			// attributes...
			.concat(this.typeCall(Object, 'walk', {items: attrs}, func, path)) },
	// XXX add object compatibility checks...
	// XXX revise...
	patch: function(obj, key, change){
		var NONE = this.NONE
		var EMPTY = this.EMPTY

		var i = key instanceof Array ? key[0] : key
		var j = key instanceof Array ? key[1] : key

		// sub-array manipulation...
		if(i instanceof Array){
			// XXX remove .length support...
			var li = i[1]
			var lj = j[1]

			i = i[0]
			j = j[0]

			// XXX check compatibility...

			obj.splice(j, 
				'A' in change ? 
					change.A.length
					: li, 
				...('B' in change ? 
					change.B
					// NOTE: this will insert a bunch of undefined's and
					// 		not empty slots, this we will need to cleanup
					// 		after (see below)...
					: new Array(lj)))
			// cleanup...
			// XXX test...
			if(!('B' in change)){
				for(var n=j; n <= lj + j - li; n++){
					delete obj[n] } }

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

			// XXX can we have cases where:
			// 		B is not in change
			// 		B is NONE
			// 			...no because then j would be null and handled above...
			} else if(i == j){
				if(this.cmp(change.B, EMPTY)){
					delete obj[j]

				} else {
					obj[j] = change.B }

			// XXX this is essentially the same as the above case, do we need both??
			} else {
				obj[j] = change.B } }
		
		return obj },
	reverse: function(change){
		if('length' in change){
			change.length = change.length.slice().reverse() }
		return change },

	// XXX EXPERIMENTAL...
	get: function(obj, key){
		return key instanceof Array ? 
			obj.slice(key[0], key[0] + (key[1] != null ? key[1] : 1))
			: obj[key] },
	set: function(obj, key, value){
		// sub-array...
		if(key instanceof Array){
			obj.splice(key[0], key[1] || 0, ...value)

		// EMPTY...
		} else if(value === this.EMPTY){
			delete obj[key]

		// NONE...
		} else if(value === this.NONE){
			obj.splice(key, 0)

		// item...
		} else {
			obj[key] = value }
		return this },

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
				// XXX need to encode length into path/index...
				var tail = { type: 'Basic', }
				ta.filter(() => true).length > 0 
					&& (tail.A = ta)
				tb.filter(() => true).length > 0 
					&& (tail.B = tb)
				//tail.length = [ta.length, tb.length]

				a = a.slice(0, l)
				b = b.slice(0, l)

				// Builds:
				// 	[
				// 		[i, j, diff],
				// 		...
				// 		[[i], [i], tail],
				// 	]
				// XXX need to encode length into path/index...
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
							//[i+l],
							//[j+l],
							[i+l, ta.length],
							[j+l, tb.length],
							tail,
						]]
						: [])
			})
			.reduce(function(res, e){ 
				return res.concat(e) }, []) },
	// XXX
	order: function(diff, A, B, options){
		// XXX
	},


	// XXX EXPERIMENTAL: used by Types._diff(..)
	// XXX BUG: with this the results will not match...
	// 			a = [1,{}]
	//			b = [{}]
	//			diff.Diff(
	//				da = diff.Types._diff(a, b),
	//				db = diff.Types.flatten(diff.Types.diff(a, b)) ).diff.length == 0 // -> false
	//		...options.cmp(..) must use diff to compare items to match...
	_handle: function(A, B, next, options){
		var NONE = this.NONE
		var EMPTY = this.EMPTY

		// XXX cmp must be diff-aware!!!
		var sections = getDiffSections(A, B, options.cmp)

		// special case: last section set consists of sparse/empty arrays...
		var last = sections[sections.length-1]
		last 
			&& last[0][1]
				.concat(last[1][1])
				.filter(function(e){ return e }).length == 0
			&& sections.pop()

		var diff = sections
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
				var tail = {}
				ta.filter(() => true).length > 0 
					&& (tail.A = ta)
				tb.filter(() => true).length > 0 
					&& (tail.B = tb)

				a = a.slice(0, l)
				b = b.slice(0, l)

				return zip(
						function(n, elems){
							return [
								// indexes...
								// if a slot exists it gets an index, 
								// otherwise null...
								(0 in elems || n < a.length) ? 
									i+n 
									: null,
								(1 in elems || n < b.length) ? 
									j+n 
									: null,
								// A...
								// use value, EMPTY or NONE...
								0 in elems ? 
										elems[0] 
									: n < a.length ?
										EMPTY
									: NONE, 
								// B...
								1 in elems ? 
										elems[1] 
									: n < b.length ?
										EMPTY
									: NONE,
							] }, 
						a, b)
					// normalize path and call next...
					.reduce(function(res, attr){
						var path = attr.splice(0, 2)
						path = path[0] == path[1] ? 
							[path[0]] 
							: path
						return res.concat(
							next('do', [], [path].concat(attr))) }, [])
					// clear matching stuff...
					.filter(function(e){ 
						return e != null })
					// splice array sub-sections...
					.concat(ta.length + tb.length > 0 ?
							[Object.assign({}, 
								{ 
									path: [[
										[i+l, ta.length],
										[j+l, tb.length],
									]],
								},
								tail)]
							: []) })
			.reduce(function(res, e){ 
				return res.concat(e) }, [])

		// length...
		if(A.length != B.length){
			diff.push({
				path: ['length'],
				A: A.length,
				B: B.length,
			}) }

		return diff },
})


// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
/*/ XXX Set...
Types.set(Set, {
	handle: function(obj, diff, A, B, options){
		// XXX
	}
	walk: function(diff, func, path){
		// XXX
	},
	reverse: function(change){
		// XXX
	},
})
//*/


// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
// XXX add JS types like Map, Set, ...
// XXX Q: can Map/Set be supported???
// 		- there is not uniform item access 
// 			-> need to type path elements
// 		- Sets have no keys 
// 			-> no way to access/identify specific items
// 		- Maps use specific objects as keys 
// 			-> no way to store a diff and then still match an item
// 			-> two different keys may be represented by identical in 
// 				topology but different in identity objects...
// 				Ex:
// 					var m = new Map([
// 						[ [], 123 ],
// 						[ [], 321 ],
// 					])
// 		Possible approaches:
// 			- index items by order instead of key
// 			- use a best overall match as indication...
// 			- serialize...
// 				...will need a way to sort the items in a stable way...
/*/ XXX for now unsupported types will be treated as object...
Types.set(Map, {
	handle: function(obj, diff, A, B, options){
		throw new TypeError('Map handling not implemented.')
	},
})
//*/


// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
/*/ Pattern...
// XXX need to accompany this with a walk pattern protocol....
Types.set(Pattern, {
	handle: function(obj, diff, A, B, options){
		// XXX
	}
	walk: function(diff, func, path){
		// XXX
	},
	reverse: function(change){
		// XXX
	},
})
//*/


// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
// Text...
Types.set('Text', {
	// this must be checked before the 'Base'...
	priority: 100,
	no_attributes: true,

	compatible: function(obj, options){
		options = options || {}
		min = options.min_text_length || MIN_TEXT_LENGTH
		return typeof(obj) == typeof('str')
			&& min > 0 
			&& (obj.length > min 
				&& /\n/.test(obj)) },
	handle: function(obj, diff, A, B, options){
		options = Object.create(options || {})
		// do not treat substrings as text...
		options.min_text_length = -1
		return this.handle(Array, obj, diff, A.split(/\n/), B.split(/\n/), options) },
	walk: function(diff, func, path){
		// use the array walk but add 'Text' type to each change...
		// NOTE: we need to abide by the protocol and call Array's 
		// 		.flatten(..) the context of the main object...
		return this.typeCall(Array, 'walk', diff, function(c){
			// skip length changes...
			if(c.path[c.path.length-1] == 'length'){
				return
			}
			c.type = 'Text'
			return func(c)
		}, path) },

	// NOTE: we return here arrays, joining is done in .postPatch(..) 
	// XXX add object compatibility checks...
	patch: function(obj, key, change){
		var cache = this._text_cache = this._text_cache || {}
		var path = JSON.stringify(change.path.slice(0, -1))
		var lines = cache[path] = cache[path] || obj.split(/\n/)

		var res = cache[path] = this.typeCall(Array, 'patch', lines, key, change)

		return res },

	// XXX EXPERIMENTAL...
	get: function(obj, key){
	},
	set: function(obj, key, value){
	},

	// replace all the cached text items...
	postPatch: function(res){
		var cache = this._text_cache = this._text_cache || {}

		Object.keys(cache)
			.forEach(function(path){
				var text = cache[path].join('\n')
				path = JSON.parse(path)

				// root object...
				if(path.length == 0){
					res = text

				} else {
					path.slice(0, -1)
						.reduce(function(res, k){
							return res[k] }, res)[path.pop()] = text } })

		return res },
})



//---------------------------------------------------------------------
// The diff object...
//
//	Create a diff...
// 		Diff(A, B[, options])
// 		new Diff(A, B[, options])
// 			-> diff
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
// 		min_text_length: 100 | -1,
//
//		// If true, disable attribute diff for non Object's...
//		//
//		// XXX should be more granular...
//		no_attributes: false | true,
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
//
//
// Extending Diff...
//
// 	// create a new diff constructor...
// 	var ExtendedDiff = Diff.clone('ExtendedDiff')
//
// 	// add a new type...
// 	ExtendedDiff.types.set(SomeType, {
// 		...
// 	})
//
// 	// add a new synthetic type...
// 	ExtendedDiff.types.set('SomeOtherType', {
// 		compatible: function(..){ .. },
// 		...
// 	})
//
// 	// remove an existing type...
// 	ExtendedDiff.types.delete('Text')
//
//
var DiffClassPrototype = {
	// encapsulate the low-level types...
	types: Types,

	// create a new diff constructor with a detached handler set...
	clone: function(name){
		var cls = Object.create(this.__proto__)
		cls.types = this.types.clone()
		return object.Constructor(name || 'EDiff', cls, this()) },

	// proxy generic stuff to .types...
	cmp: proxy('types.cmp'),
	vars: function(pattern, obj){
		var o = {}
		this.cmp(pattern, obj, null, o)
		return o.ns || {} },

	// XXX do format/version conversion...
	fromJSON: function(json){
		var diff = new this()

		if(json.format == diff.format
				&& json.version == diff.version){
			// XXX do a deep copy...
			diff.options = JSON.parse(JSON.stringify(json.options))
			diff.placeholders = JSON.parse(JSON.stringify(json.placeholders))
			diff.diff = JSON.parse(JSON.stringify(json.diff))

			return diff

		// XXX do format conversion...
		} else {
		}
	},
}

// XXX need to make the diff object the universal context...
// 		...currently the context for most things is .constructor.types 
// 		which is global this makes anything that any handler does not 
// 		local to a particular diff instance...
// XXX patching should be possible with a simple empty object...
// 		...not sure how to create the path elements though...
// 		this would make optimizing .merge(..) simple:
// 			var diff = x.merge(y)
// 			// reference -- the unchanged section of the input...
// 			var pre = diff
// 				.reverse()
// 				.patch()
// 			var post = diff.patch(ref)
// 			var optimized = Diff(pre, post)
var DiffPrototype = {
	// system meta information...
	get format(){
		return this.constructor.types.format },
	get version(){
		return this.constructor.types.version },

	// XXX is this the right thing to do???
	// 		...the bad thing here is that this can be mutated from the 
	// 		instance when returned like this...
	//get types(){
	//	return this.constructor.types },
	
	structure: null, 
	placeholders: null,
	options: null,
	diff: null,
	timestamp: null,

	parent: null,


	__init__: function(A, B, options){
		// XXX should we add a default options as prototype???
		options = this.options = options || {}
		this.structure = options.tree_diff ? 'tree' : 'flat'
		this.placeholders = {
			NONE: options.NONE 
				|| this.constructor.types.NONE,
			EMPTY: options.NONE 
				|| this.constructor.types.EMPTY,
		}

		var diff = this.constructor.types

		// XXX should the Types instance be stored/cached here???
		this.diff = arguments.length == 0 ?
				null
			: options.tree_diff ? 
				diff.diff(A, B, options) 
			: diff.flatten(diff.diff(A, B, options), options)

		this.timestamp = Date.now() },

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
		return res },

	check: function(obj){
		return Object.assign(
				Object.create(this.constructor.types), 
				// get the actual placeholders...
				this.placeholders)
			.check(this.diff, obj) },
	patch: function(obj){
		return Object.assign(
				Object.create(this.constructor.types), 
				// get the actual placeholders...
				this.placeholders)
			.patch(this, obj) },
	unpatch: function(obj){
		return this.reverse().patch(obj) },

	// these are non-mutating...
	reverse: function(obj){
		var res = this.clone()
		res.diff = Object.create(this.constructor.types).reverse(this.diff)
		res.parent = this
		return res }, 
	filter: function(filter){
		var res = this.clone()
		res.diff = this.constructor.types.filter.call(this, this.diff, filter)
		res.parent = this
		return res },

	// XXX should this set .parent ????
	merge: function(diff){
		var res = this.clone()
		res.diff = this.constructor.types.merge.call(this, this.diff, diff.diff)
		res.parent = this
		return res },

	// XXX EXPERIMENTAL...
	end: function(){
		return this.parent || this },

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
		} },
}

var Diff = 
module.Diff = 
object.Constructor('Diff', 
	DiffClassPrototype, 
	DiffPrototype)
		

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
// Short hands...

module.diff = Diff


// Deep-compare objects...
//
var cmp =
module.cmp =
function(A, B){
	return Diff.cmp(A, B) }


// Apply diff (patch) to obj...
//
// This is a front-end to Types.patch(..), handling loading the options
// from the diff...
var patch =
module.patch = 
function(diff, obj, options, types){
	return (diff instanceof Diff ? 
			diff
			: Diff.fromJSON(diff))
		.patch(obj, options) }


// Extract pattern VAR/LIKE matching values from obj...
//
var vars =
module.vars =
function(pattern, obj){
	return Diff.vars(pattern, obj) }




/**********************************************************************
* vim:set ts=4 sw=4 :                               */ return module })
