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
// XXX can we combine .handle(..) and .match(..) ???
// 		...for example via .handle(obj, '?') protocol...
// 		.....or even simpler, just thread the object through all the 
// 		handlers in one go -- unless there is a fast way to test and 
// 		classify object predictably there is no point in a test stage...
// 		.....would also be nice to support a STOP(res) instead of .final
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

var HANDLERS2 =
module.HANDLERS2 = {
	null: {
		handle: function(obj){
			if(obj === null){
				throw module.STOP(obj) } }, }, 
	value: {
		handle: function(obj){
			if(typeof(obj) != 'object'
					&& typeof(obj) != 'function'){
				throw module.STOP(obj) } },

	object: {
		handle: function(obj){
			return typeof(obj) == 'object' ? 
				[[], {
					// XXX need to check if a constructor is built-in...
					type: obj.constructor.name,

					// Object generations:
					// 	1	- directly constructed objects
					// 	2	- objects at least one level deeper than gen 1
					gen: obj.constructor.prototype === obj.__proto__ ? 1 : 2,

					// XXX
					source: obj,
				}] 
				: undefined }, },
}

var handle2 =
module.handle2 =
function(){

}



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
	.map(function([p, v]){
		return v instanceof Array && v[0] == 'LINK' ?
			// link...
			[path2str(p), 
				'LINK', path2str(v[1])]
			: [path2str(p), v] })


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


console.log([
	...handle(o)
		.chain(
			serializePaths, 
			// make the output a bit more compact...
			stripAttr('source'), 
		)])


console.log('\n\n---\n', 
	[...handle(write(null, handle(o)))
		.chain(
			serializePaths, 
			// make the output a bit more compact...
			stripAttr('source'), 
		)])




/**********************************************************************
* vim:set ts=4 sw=4 :                               */ return module })
