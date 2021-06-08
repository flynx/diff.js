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
// 		- build object via spec
// 		- update object via spec
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
/*********************************************************************/

// XXX need a way to uniquely serilaize this to a string path...
// 		...or some other way to use it in a convinient manner...
var CONTENT =
module.CONTENT = 
//Symbol.CONTENT = 
	Symbol('CONTENT')


//
// Format:
// 	{
// 		<name>: {
// 			// optional
// 			final: <bool>,
//
// 			match: <name> | <func>,
//
//			handle: <name> | <func>,
// 		},
// 	}
//
//
// NOTE: this is more of a grammar than a set of object handlers, nother
// 		way to think of this is as a set of handlrs of aspects of objects
// 		and not full objects...
// 		XXX not sure if this is how this is going to continue though as 
// 			we'll need to organize constructors preferably within this 
// 			structure and keep it extensible...
// 
// XXX might be nice to have conditional stopping...
// 		a-la event.preventDefault()
// XXX need option threading...
// XXX need to deal with functions...
var HANDLERS =
module.HANDLERS = {

	// null...
	//
	null: {
		final: true,
		match: function(obj){
			return obj === null },
		handle: 'value', }, 
	
	// Functions...
	//
	// XXX EXPERIMENTAL...
	// XXX STUB...
	func: {
		match: function(obj){
			return typeof(obj) == 'function' },
		handle: 'object', },

	// Text...
	//
	// XXX EXPERIMENTAL...
	text: {
		final: true,
		match: function(obj){
			return typeof(obj) == 'string'
				// XXX make this more optimal...
				&& obj.includes('\n') },
		handle: function(obj){
			return [[], 
				{
					type: 'Text',	
					source: obj,
				}, 
				obj.split(/\n/g)
					.map(function(line, i){
						return [[module.CONTENT, i], line] }) ] }, },

	// Non-Objects...
	//
	// NOTE: this will include undefined and NaN...
	value: {
		final: true,
		match: function(obj){
			return typeof(obj) != 'object'
	   			&& typeof(obj) != 'function' },
		handle: function(obj){
			return [[], obj] }, },

	// Base objects...
	//
	object: {
		match: function(obj){
			return typeof(obj) == 'object' },
		handle: function(obj){
			return [[], {
				// XXX need to check if a constructor is built-in...
				type: obj.constructor.name,

				// Object generations:
				// 	1	- directly constructed objects
				// 	2	- objects at least one level deeper than gen 1
				gen: obj.constructor.prototype === obj.__proto__ ? 1 : 2,

				// XXX
				source: obj,
			}] }, },
	// special keys...
	proto: {
		match: function(obj){
			return typeof(obj) == 'object'
				&& obj.constructor.prototype !== obj.__proto__ },
		handle: function(obj){
			return [[ [['__proto__'], obj.__proto__], ]] }, },
	// XXX any other special keys???
	// 		- non-iterable?


	// Entries / Non-attribute (encapsulated) content...
	//
	setEntries: {
		match: function(obj){
			return obj instanceof Set },
		// NOTE: we are indexing sets...
		handle: function(obj){
			return [ obj.values()
				.map(function(v, i){ 
					return [[module.CONTENT, i], v] })
	   			.toArray() ] }, },
	mapEntries: {
		match: function(obj){
			return obj instanceof Map },
		handle: function(obj, path, options){
			return [ obj.entries()
				.map(function([k, v], i){ 
					return [
						[[module.CONTENT, i +'@key'], k], 
						[[module.CONTENT, i], v], 
					] })
				.flat()
		   		.toArray() ] }, },

	// Keys / Attributes...
	//
	// NOTE: this includes array items...
	//
	// XXX do we need to treat array keys as a special case???
	// 		...the best approach could be to simply:
	// 			- prioretize handlers -- already done
	// 			- skip repeating keys
	// 				...this could be done on the root handler level...
	// XXX need to optionally handle props...
	keys: {
		//match: 'object',
		//match: ['object', 'func'],
		match: function(obj, handlers){
			return handlers.object.match(obj) 
				|| handlers.func.match(obj) },
		handle: function(obj){
			return [ Object.entries(obj) 
				.map(function([k, v]){ 
					return [[k], v] }), ] }, },
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



// XXX use STOP...
// XXX might be good to cache output via some citeria (type?)...
// 		...this criteria needs to be consistent with how .match(..) works...
// XXX does .match(..) need options???
// XXX do we warn of orphans???
var getHandlers = 
module.getHandlers = 
function(obj, handlers=module.HANDLERS){
	return [...Object.entries(handlers)
		.iter()
		.filter(function([k, v]){
			var stop = !!v.final
			// expand aliases...
			var seen = new Set()
			while(v && typeof(v.match) == 'string'){
				var n = v.match
				if(seen.has(n)){
					throw new Error('.match(..): alias loop detected:\n\t'
						+ [...seen, n].join('\n \t  -> ')) }
				seen.add(n)
				v = handlers[n] }
			// orphan or falsy .match...
			if(!v){
				return false }
			// handle .final/final...
			if(stop 
					&& v.match 
					&& v.match(obj, handlers)){
				throw types.STOP(true) }
			// normal match...
			return v.match 
				&& v.match(obj, handlers) })
		.map(function([k, v]){
			return v })] }



// 
// Format:
// 	[
//		[<path>, {type: <name>}],
//
//		[<path>, ['LINK', <path>]],
//
//		[<path>, <value>], 
// 	]
//
// XXX add a tree mode -- containers as levels...
// XXX need a way to index the path...
// 		...and to filter paths by pattern...
// XXX might be a good idea to generate "structural hashes" for objects...
var handle = 
module.handle = 
function*(obj, path=[], options={}){
	// handle recursive structures...
	var seen = options.seen =
	   options.seen || new Map()	
	if(seen.has(obj)){
		yield [path, ['LINK', seen.get(obj)]]
		return }
	typeof(obj) == 'object'
		&& seen.set(obj, path)

	// get compatible handler list...
	var cache = options.cache = 
		options.cache || new Map()
	var HANDLERS = options.handlers || module.HANDLERS
	var handlers = module.getHandlers(obj, HANDLERS)

	// XXX might be a good idea to move this up (or into options) so as 
	// 		not to define this on each call...
	// 		...we'll need to somehow curry in the path which is now passed 
	// 		via a closure...
	var subtree = function*(data){
		// a handler just returned a list of next objects to handle...
		if(data.length == 1){
			var next = data.pop()
			var p = path
		// a normal handler...
		} else {
			var [k, v, next] = data
			var p = path.concat(k)
			yield [p, v] }
		// process queued/next objects...
		yield* (next || [])
			.iter()
			.map(function*([k, v]){
				yield* handle(v, p.concat(k), options) }) }

	// apply the handlers...
	yield* handlers
		.iter()
		.filter(function(handler){ 
			return !!handler.handle })
		.map(function*(handler){
			var  h = handler
			// expand aliases...
			while(h && typeof(h.handle) == 'string'){
				h = HANDLERS[h.handle] }
			yield* h.handle instanceof types.Generator ?
				// XXX should .handle(..) be called in the context of h or handler???
				h.handle.call(handler, obj, path, options)
					.map(subtree)
				: subtree(h.handle.call(handler, obj, path, options)) }) }



// XXX need to figure out a way to avoid clashes with module.CONTENT in 
// 		path with actual attribute keys...
// 		ways to do this:
// 			- serialize CONTENT in a cleaver way
// 			- add a different path separator to indicate content and quote 
// 				it in strings -- ':'???
var serializePathElem = function(p, i, l){
	return typeof(p) == 'object' ?
			JSON.stringify(p)
		// quote special chars...
		: typeof(p) == 'string' ?
			p.replace(/([\/:])/g, '\\$1')
		: p }
var serializePath = function(p){
	return '/'+ p
		.map(serializePathElem)
		.reduce(function(res, e){
			e = e === module.CONTENT ?
				res.pop() + ':CONTENT'
				: e
			res.push(e)
			return res }, [])
		.join('/') }
/*/ XXX might also be a good idea to serialize the path into an 
// 		arbitrary length as we always have exactly one value, e.g.:
// 			[ '/path/to/map', 'CONTENT', 'path/in/content', 123]
var serializePathElem = function(p, i, l){
	return typeof(p) == 'object' ?
			JSON.stringify(p)
		// quote special chars...
		: typeof(p) == 'string' ?
			p.replace(/([\/])/g, '\\$1')
		: p }
var serializePath = function(p){
	return p
		.map(serializePathElem)
		.reduce(function(res, e){
			e === module.CONTENT ?
				res.splice(res.length, 0, 'CONTENT', '')
				: (res[res.length-1] += '/'+ e)
			return res }, ['']) }
//*/
var serializePaths = 
module.serializePaths =
types.generator.iter
	.map(function([p, v]){
		return v instanceof Array && v[0] == 'LINK' ?
			// link...
			[serializePath(p), 
				'LINK', serializePath(v[1])]
			: [serializePath(p), v] })


// remove attributes from object metadata...
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
		.map(function([p, v]){
			if(v && typeof(v) == 'object'){
				// keep things non-destructive...
				v = Object.assign({}, v)
				attrs
					.forEach(function(attr){
						attr in v
							&& (delete v[attr]) }) }
			return [p, v] }) }



//---------------------------------------------------------------------
// XXX construct...





//---------------------------------------------------------------------
// XXX move to test...

var o = {
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

	// XXX
	func: function(){},
	func_with_attrs: Object.assign(
		function(){},
		{
			x: 333,
		}),

	array_with_attrs: Object.assign(
		[1, 2, 3],
		{
			a: 'some value',
			b: 'some other value',
			// will overwrite 2...
			1: 333,
		}),

	'special/character\\in:key': [],

	text: `this
		is
		a
		multi-line
		block of text...`,
}

// clone...
// NOTE: JSON does not support:
// 		- sparse arrays
// 		= sets/maps
// 		- loops
oo = JSON.parse(JSON.stringify(o))

// loop...
// NOTE: we are creating the loop before we pass it to JSON because JSON
// 		does not support loops in objects...
o.object.y = o.object



console.log([
	...handle(o)
		.chain(
			serializePaths, 
			// make the output a bit more compact...
			stripAttr('source'), 
		)])

//console.log([...handle(o)])




/**********************************************************************
* vim:set ts=4 sw=4 :                               */ return module })
