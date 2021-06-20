/**********************************************************************
* 
*
*
**********************************************/  /* c8 ignore next 2 */
((typeof define)[0]=='u'?function(f){module.exports=f(require)}:define)
(function(require){ var module={} // make module AMD/node compatible...
/*********************************************************************/

var types = require('ig-types')



/*********************************************************************/
//
// XXX thinks this needs to do:
// 		- walk object tree			- DONE
// 		- generate a spec			- DONE
// 			- serializable
// 		- support props
// 		- build object via spec		- DONE
// 		- update object via spec
// 			- contextual updates
// 		- subtract specs (diff)
// 			- full
// 			- relaxed -- ignore item order
// 		- modes:
// 			- JSON
// 			- reconstructable
// 			- full
// 				- not reconstructable -- if some types are used (functions, ...)
// 		- compare protocol
// 		- reconstruct protocol
//
//
// XXX proposed diff format:
// 	[
// 		// change...
// 		[
// 			// pre-context...
// 			// XXX should '=' here be optional???
// 			['=', <path>, <value>],
// 			...
// 			['=', <path>, <value>],
//
// 			// changes...
// 			// addition...
// 			['+', <path>, <value>],
// 			// removal...
// 			['-', <path>, <value>],
// 			// unchanged context line....
// 			['=', <path>, <value>],
// 			...
//
// 			// post-context...
// 			['=', <path>, <value>],
// 			...
// 			['=', <path>, <value>],
// 		],
//
// 		...
// 	]
//
//
//
/*********************************************************************/

var STOP =
module.STOP = 
	types.STOP
	

var EMPTY =
module.EMPTY = 
//Symbol.EMPTY = 
	Symbol('EMPTY')


// XXX need a way to uniquely serilaize this to a string path...
// 		...or some other way to use it in a convinient manner...
var CONTENT =
module.CONTENT = 
//Symbol.CONTENT = 
	Symbol('CONTENT')



//---------------------------------------------------------------------

//
// Format:
// 	{
// 		<name>: {
//			handle: <name> | <func>,
//
//			...
// 		},
// 	}
//
//
//	.handle(obj, res, next(..), stop(..), options)
//		-> [path, res]
//		-> undefined
//
//	res ::= [path] 
//		| [path, value]
//
//	next([path, value], ..)
//		-> true
//
//	stop(value)
//	stop(path, value)
//
//
//
// NOTE: this is more of a grammar than a set of object handlers, another
// 		way to think of this is as a set of handlers of aspects of objects
// 		and not full objects...
//
// XXX need to deal with functions...
// XXX add a tree mode -- containers as levels...
// XXX need a way to index the path...
// 		...and to filter paths by pattern...
// XXX might be a good idea to generate "structural hashes" for objects...
var HANDLERS =
module.HANDLERS = {

	// null...
	//
	null: {
		handle: function(obj, res, next, stop){
			obj === null
				&& stop(obj) }, }, 

	// Functions...
	//
	// XXX EXPERIMENTAL...
	// XXX STUB...
	// XXX can we reuse object's .handle(..) here???
	func: {
		handle: function(obj, res, next, stop){
			return typeof(obj) == 'function' ?
				{
					// XXX need to check if a constructor is built-in...
					type: obj.constructor.name,
					// Object generations:
					// 	1	- directly constructed objects
					// 	2	- objects at least one level deeper than gen 1
					gen: obj.constructor.prototype === obj.__proto__ ? 1 : 2,
					// XXX
					source: obj,
				} 
				: undefined }, },

	// Text...
	//
	// XXX EXPERIMENTAL...
	text: {
		handle: function(obj, res, next, stop, options){
			typeof(obj) == 'string'
				// XXX make this more optimal...
				&& obj.includes('\n')
				&& next(
					...obj.split(/\n/g)
						.map(function(line, i){
							return [[module.CONTENT, i], line] }))
	   			&& stop({
						type: 'Text',	
						source: obj,
					}) }, },

	// Non-Objects...
	//
	// NOTE: this will include undefined and NaN...
	value: {
		handle: function(obj, res, next, stop){
			typeof(obj) != 'object'
				&& typeof(obj) != 'function'
				&& stop(obj) }, },

	// Base objects...
	//
	object: {
		handle: function(obj, res, next, stop){
			return typeof(obj) == 'object' ? 
				{
					// XXX need to check if a constructor is built-in...
					type: obj.constructor.name,
					// Object generations:
					// 	1	- directly constructed objects
					// 	2	- objects at least one level deeper than gen 1
					gen: obj.constructor.prototype === obj.__proto__ ? 1 : 2,
					// XXX
					source: obj,
				} 
				: undefined }, },
	// special keys...
	proto: {
		handle: function(obj, res, next, stop){
			typeof(obj) == 'object'
				&& obj.constructor.prototype !== obj.__proto__
				&& next([['__proto__'], obj.__proto__]) }, },
	// XXX any other special keys???
	// 		- non-iterable?

	// Entries / Non-attribute (encapsulated) content...
	//
	setEntries: {
		handle: function(obj, res, next, stop){
			obj instanceof Set
				&& next(
					...obj.values()
						.map(function(v, i){ 
							return [[module.CONTENT, i], v] })) }, },
	mapEntries: {
		handle: function(obj, res, next, stop){
			obj instanceof Map
				&& next(
					...obj.entries()
						.map(function([k, v], i){ 
							return [
								[[module.CONTENT, i +'@key'], k], 
								[[module.CONTENT, i], v], 
							] })
						.flat()) }, },

	// Keys / Attributes...
	//
	// NOTE: this includes array items...
	//
	// XXX do we need to treat array keys as a special case???
	// 		...the best approach could be to simply:
	// 			- prioretize handlers -- already done
	// 			- skip repeating keys
	// 				...this could be done on the root handler level...
	keys: {
		handle: function(obj, res, next, stop){
			;(typeof(obj) == 'object'
					|| typeof(obj) == 'function')
				&& next(
					...Object.entries(obj) 
						.map(function([k, v]){ 
							return [[k], v] })) }, },


	/* XXX
	props: {
		//match: 'object',
		//match: ['object', 'func'],
		match: function(obj, handlers){
			return handlers.object.match(obj) 
				|| handlers.func.match(obj) },
		handle: function(obj){
			return [key, value, next] }, },
	//*/
	

	/* XXX not sure about this...
	// Service stuff...
	//
	error: {
		match: function(obj){},
	},
	//*/


	// Testing...
	//
	// XXX alias loop...
	//alias_loop: { match: 'alias_loop' },
	//alias_loop_a: { match: 'alias_loop_b' },
	//alias_loop_b: { match: 'alias_loop_a' },
	// XXX orphaned alias...
	//alias_orphan: { match: 'orphan' },
	//false: { match: false },
}

//
//	handle(obj[,options])
//	handle(obj, path[,options])
//		-> generator
//
//
// Format:
// 	[
//		// primitive value...
//		[<path>, <value>], 
//
//		// constructed object...
//		[<path>, {
//			type: <name>,
//			gen: <generation>,
//			source: <obj>,
//		}],
//
//		// link...
//		[<path>, 'LINK', <path>],
//
// 	]
//
var handle =
module.handle =
function*(obj, path=[], options={}){
	// parse args...
	options = typeof(path) == 'object' && !(path instanceof Array) ?
		path
		: options
	path = path instanceof Array ?
			path
		: typeof(path) == 'string' ?
			str2path(path)
		: [] 

	// handle object loops...
	var seen = options.seen =
	   options.seen || new Map()	
	if(seen.has(obj)){
		yield [path, 'LINK', seen.get(obj)]
		return }
	typeof(obj) == 'object'
		&& seen.set(obj, path)

	var _next = []
	var next = function(...values){
		_next.splice(_next.length, 0, ...values)
		return true }
	var stop = function(p, v){
		throw module.STOP(arguments.length == 1 ? 
			[path, arguments[0]] 
			: [p, v]) }

	// handle the object...
	var handlers = options.handlers || module.HANDLERS
	var res = [path]
	yield* Object.entries(handlers)
		.iter()
		.filter(function([_, handler]){ 
			return !!handler.handle })
		.map(function*([name, handler]){
			// skip...
			if(!!options['no'+ name.capitalize()]){
				return }
			// expand aliases...
			var  h = handler
			while(h && typeof(h.handle) == 'string'){
				h = handlers[h.handle] }
			// XXX should .handle(..) be called in the context of h or handler???
			res = h.handle.call(handler, obj, res, next, stop, options)
			yield res 
				&& [path, res] }) 
		// clean out remains of handlers that rejected the obj...
		.filter(function(e){ 
			return !!e })
	// handle the next stuff...
	yield* _next
		.iter()
		.map(function*([k, v]){
			yield* handle(v, path.concat(k), options) }) }




//---------------------------------------------------------------------

// path2str(..)
//
// XXX need to figure out a way to avoid clashes with module.CONTENT in 
// 		path with actual attribute keys...
// 		ways to do this:
// 			- serialize CONTENT in a cleaver way
// 			- add a different path separator to indicate content and quote 
// 				it in strings -- ':'???
// XXX Q: should there be a difference between:
// 			['', module.CONTENT]
// 		and
// 			[module.CONTENT] ???
// 		...currently they are the same...
// 		A: there should be a difference....
// 			[...d.handle({'':new Set([1,2,3]), x:123}).chain(d.serializePaths)]
//		...the problem is in path2str(..)
var serializePathElem = function(p, i, l){
	return typeof(p) == 'object' ?
			JSON.stringify(p)
		// quote special chars...
		: typeof(p) == 'string' ?
			p.replace(/([\/:])/g, '\\$1')
		: p }
var path2str = 
module.path2str =
function(p){
	return '/'+ p
		.map(serializePathElem)
		.reduce(function(res, e){
			e = e === module.CONTENT ?
				(res.length == 0 ? 
						'' 
						: res.pop()) 
					+ ':CONTENT'
				// special case: '' as key...
				: e == '' ?
					"''"
				: e
			res.push(e)
			return res }, [])
		.join('/') }


// str2path(..)
//
var unquote = function(str){
	return str
		.replace(/^(['"])(.*)\1$/, '$2') }
var deserializePathElem = function(p){
	return p == ':CONTENT'?
			[module.CONTENT]
		: /[^\\]:CONTENT$/.test(p) ?
			[unquote(p.replace(/(?<!\\):CONTENT$/, '')), module.CONTENT]
		: [unquote(p)] }
// XXX should we hanve relative paths????
// XXX PROBLEM: need to be able to reference '' in {'': 123}, i.e, how do
// 		we stringify ['']???
// 			[''] => ???
var str2path = 
module.str2path =
function(str){
	return str instanceof Array ?  
			str 
		: str == '' || str == '/' ?
			[]
		: (str
			// remove leading '/'
			.replace(/^\//, '')
			.split(/\//g)
			.map(deserializePathElem)
			.flat()) }


var serializePaths = 
module.serializePaths =
types.generator.iter
	.map(function([p, v, ...rest]){
		return rest.length > 0 && v == 'LINK' ?
			// link...
			[path2str(p), v, path2str(rest[0])]
			: [path2str(p), v] })


// Remove attributes from object metadata...
//
// 	stripAttr(attr, ...)
// 		-> <chainable>
//
// 	<chainable>(<input>)
// 		-> <generator>
//
// 	<input>.chain(<chainable>)
//
var stripAttr =
module.stripAttr =
function(...attrs){
	return types.generator.iter
		.map(function([p, v, ...rest]){
			if(v && typeof(v) == 'object'){
				// keep things non-destructive...
				v = Object.assign({}, v)
				attrs
					.forEach(function(attr){
						attr in v
							&& (delete v[attr]) }) }
			return [p, v, ...rest] }) }



//---------------------------------------------------------------------
// XXX construct...


//
// 	atPath(root, path)
// 		-> value
//
// 	atPath(root, path, value)
// 		-> value
//
// NOTE: to set this needs the full basepath to exist...
//
// XXX need to write a map key to an item that does not exist...
// XXX need a way to insert values after a specific index/key, this 
// 		would require:
// 			- indicated this in spec:
// 				a) AFTER/BEFORE symbol(s) in path (???)
// 					here there are two ways to think about this:
// 					- AFTER means *replace* the item after
// 					- AFTER means *between* this and the item after
//				b) context (a-la diff)
// 			- insert to array:
// 				.splice(i, 0, <value>)
// 			- insert into set:
// 				.splice(..)
// 			- insert into map
// 				???
// 			- insert into object
// 				???
// 		...revise...
// XXX str2path and passing in a list path produce different results...
var atPath = 
module.atPath =
function(root, path, value){
	path = str2path(path)
	//console.log('    ', path, value)
	// special case: get/set root...
	if(path.length == 0 || path[0] == '/'){
		return arguments.length > 2 ?
			value
			: root }
	// get value at path...
	var mode = 'normal'
	var base
	var target = path
		.reduce(function(cur, p){
			// CONTENT...
			if(p === module.CONTENT){
				// NOTE: indicate to the next iteration that we'll need 
				// 		to use map/set API to get/set the value...
				mode = 'content'
				base = cur
				return cur }
			// value in content...
			if(mode == 'content'){
				mode = 'content-item'
				return (
					// set item...
					cur instanceof Set ?
						[...cur][p]
					// map key...
					: typeof(p) != 'number' 
							&& p.slice(-4) == '@key' ?
						// NOTE: we can write to a non-existant item...
						([...cur][p.slice(0, -4)] || [])[0] 
					// map value...
					: [...cur][p][1] )}
			// attr...
			mode = 'normal'
			base = cur
			return cur[p] }, root)

	// get...
	if(arguments.length <= 2){
		return target }

	// write attr...
	if(mode != 'content-item'){
		value === module.EMPTY ?
			(delete base[path.last()])
			: (base[path.last()] = value)
		// XXX should we return value or base???
		// 		...should we return target when writing EMPTY
		return value }

	var index = path.last()
	// write set item...
	if(base instanceof Set){
		value === module.EMPTY ?
			base.delete(target)
		:index == base.size ? 
			base.add(value)
		: base.replaceAt(index, value)
		// XXX should we return value or base???
		// 		...should we return target when writing EMPTY
		return value }

	// write map item/key...
	var isKey = typeof(index) != 'number' 
		&& index.slice(-4) == '@key'
	index = isKey ? 
		index.slice(0, -4) 
		: index
	var key = atPath(root, 
		path
			.slice(0,-1)
			.concat([index +'@key']))
	value === module.EMPTY ?
		base.delete(key)
	: isKey ?
		(base.has(key) ?
			base.replaceKey(key, value)
			: base.set(value, undefined))
	: base.set(key, value)

	// XXX should we return value or base???
	// 		...should we return target when writing EMPTY
	return value }


// XXX rename to patch(..)
var write =
module.write =
function(root, spec){
	return types.generator.iter(spec)
		.reduce(function(root, [path, value, ...rest]){
			//console.log('>>>>', path2str(path), value)
			// generate/normalize value...
			value = 
				// XXX STUB...
				typeof(value) == 'function' ?
					value.source
				: value == null || typeof(value) != 'object' ?
					value
				// XXX move this out / use HANDLERS...
				: value.type == 'Object' ?
					{}
				: value.type == 'Array' ?
					[]
				: value.type == 'Set' ?
					new Set()
				: value.type == 'Map'?
					new Map()
				: undefined
			// root value...
			if(path.length == 0 
					|| (path.length == 1 
						&& (path[0] == '/' || path[0] == ''))){
				return value }
			// link...
			if(rest.length > 0 && value == 'LINK'){
				atPath(root, path, atPath(root, rest[0])) 
				return root }
			// set value...
			atPath(root, path, value)
			return root }, root) }



//---------------------------------------------------------------------

// Get common chunks (LCS)...
//
// Format:
// 	[
// 		<total-intersection-length>,
//
// 		// XXX should this be an obj???
// 		[
// 			<offset-A>,
// 			<offset-B>,
// 			<section-length>,
// 		],
// 		...
// 	]
//
var commonSections = 
module.commonSections =
function(A, B, cmp){
	cmp = cmp 
		|| function(a, b){ 
			return a === b || a == b }

	var LCS = function(a, b){
		// calculate length of chunk...
		var l = 0
		while(a+l < A.length && b+l < B.length
				&& a+l in A && b+l in B
				&& cmp(A[a+l], B[b+l])){
			l++ }
		// get next chunks...
		var L = A.length > a+l ? 
			LCS(a+l+1, b+l) 
			: [0]
		var R = B.length > b+l ? 
			LCS(a+l, b+l+1) 
			: [0]
		// select the best chunk-set...
		// NOTE: we maximize the number of elements in a chunk set then 
		// 		minimize the number of chunks per set...
		var next = L[0] == R[0] ? 
				(L.length < R.length ? L : R)
			: L[0] > R[0] ? 
				L 
			: R
		return ( 
			// non-empty chunk and next...
			next[0] > 0 && l > 0 ? 
				[l + next[0], [a, b, l]].concat(next.slice(1)) 
			// non-empty chunk and empty next...
			: l > 0 ? 
				[l, [a, b, l]]
			// empty chunk...
			: next ) }

	return LCS(0, 0) }


// 
// Format:
// 	[
// 		// change...
// 		[
// 			<a-index>, <a-chunk>,
// 			<b-index>, <b-chunk>,
// 		],
//
// 		...
// 	]
//
// NOTE: this is generic -- does not care what it compares...
//
// XXX would be nice to be able to mixin stuff cmp -- to wrap container 
// 		type and the like...
var diffSections =
module.diffSections =
function(A, B, cmp){
	var pa = 0
	var pb = 0
	return commonSections(A, B, cmp)
		.slice(1)
		.concat([[A.length, B.length, 0]])
		.reduce(function(gaps, [a, b, l]){
			// only push changes of >0 length...
			;(pa == a && pb == b)
				// NOTE: we are collecting changes before the current chunk...
				|| gaps.push([
					pa,
						A.slice(pa, a), 
					pb,
						B.slice(pb, b),
				])
			// next change start...
			pa = a + l
			pb = b + l
			return gaps }, []) }	


// XXX at this point array indexes are treated as changes, i.e. if we 
// 		insert an item into an array, this effectively changes all other 
// 		items (shifting their indexes by the number of items inserted)... 
// 		...need to treat this gracefully...
// 		we can:
// 			- ignore array index???
// 				...to do this we need to know object type per element 
// 				compared...
// 			- handle item shifts gracefully...
// 			- diff recursively instead of flat...
// 		XXX another way to approach this is to treat indexes in a relative 
// 			manner, i.e. keep track of relative order of elements...
// 			e.g. if we insert a sub-array then all the elements after it are 
// 			simply shifted, that is, their relative order is maintained...
// 			...this is already tracked by diffSections(..) but after 
// 			handler(..) arrays are more like hashes, and we need to 
// 			account for this....
//
var diff =
function(A, B){
	return diffSections(
		[...handle(A)
			.chain(serializePaths)], 
		[...handle(B)
			.chain(serializePaths)], 
		// XXX add link support...
		function([ap, av], [bp, bv]){
			return ap == bp 
				&& (av == bv 
					|| (typeof(av) == 'object' 
						&& typeof(bv) == 'object' 
						&& av.type
						&& av.type == bv.type )) }) }



//---------------------------------------------------------------------
// XXX move to test...

var o = module.o = {
	number: 123,
	string: 'abc',

	// XXX add a mode to unify these...
	'null': null,
	'undefined': undefined,
	'NaN': NaN,
	

	empty_array: [],
	array: [1, 2, 3,,,,'N'],

	// XXX set key is the object itself, is this what we want???
	set: new Set([
		1, 
		[], 
		{a:1},
	]),
	map: new Map([
		[[9,8,7], 123], 
		[321, {x: 123}],
	]),

	object: {
		x: {},
	},
	object_gen2: Object.assign(
		Object.create({
			x: 'parent',
			z: 'shadowed',
		}),
		{
			y: 'local',
			z: 'shadowing',
		}),

	/*/ XXX
	func: function(){},
	func_with_attrs: Object.assign(
		function(){},
		{
			x: 333,
		}),
	//*/

	array_with_attrs: Object.assign(
		[1, 2, 3],
		{
			a: 'some value',
			b: 'some other value',
			// will overwrite 2...
			1: 333,
		}),

	'special/character\\in:key': [],

	/* XXX EXPERIMENTAL
	text: `this
		is
		a
		multi-line
		block of text...`,
	//*/
}

// loop...
// NOTE: we are creating the loop before we pass it to JSON because JSON
// 		does not support loops in objects...
o.object.y = o.object


// generate spec...
console.log([
	...handle(o)
		.chain(
			serializePaths, 
			// make the output a bit more compact...
			stripAttr('source'), 
		)])


// use spec to create a new object...
console.log('\n\n---\n', 
	[...handle(write(null, handle(o)))
		.chain(
			serializePaths, 
			// make the output a bit more compact...
			stripAttr('source'), 
		)])


/* XXX
var A = ['x',1,2,3,1,2,3,4,5,,,4]
var B = ['x',1,2,3,4,5,6]

console.log(A)
console.log(B)

console.log(
	commonSections(A, B))
console.log(
	diffSections(A, B))

console.log([...handle(A).chain(serializePaths)])
console.log([...handle(B).chain(serializePaths)])

// XXX
console.log(diff(B, A))
//*/

console.log(JSON.stringify(diff(
	[1,4,2,3],
	[1,2,3],
), null, '    '))



/**********************************************************************
* vim:set ts=4 sw=4 :                               */ return module })
