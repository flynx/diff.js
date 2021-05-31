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

var CONTENT_ATTR =
module.CONTENT_ATTR = '[CONTENT$]'


// XXX need to deal with functions...
var HANDLERS =
module.HANDLERS = {
	/*/ XXX
	// XXX need option threading...
	// XXX need to be able to stop processing handlers...
	// 		for example when handling 'text' we do not need to also call 
	// 		'value' too...
	// 		this can be done via:
	// 			- a-la evt.preventDefault()
	// 			- handler.final
	// 			- callback...
	example: {
		match: function(obj){
			return true },
		handle: function(obj){
			...
			return [key, value, next] },
	},
	//*/
	
	null: {
		final: true,
		match: function(obj){
			return obj === null },
		handle: function(obj){
			return [[], obj] },
	},
	
	value: {
		match: function(obj){
			return typeof(obj) != 'object' },
		handle: function(obj){
			return [[], obj] },
	},

	object: {
		match: function(obj){
			return typeof(obj) == 'object' },
		handle: function(obj){
			return [[], {
				// XXX revise...
				type: obj.constructor.name,
				// XXX
			}] },
	},

	// XXX need to optionally treat special attributes...
	// 		.__proto__
	specialKeys: {
		//match: function(obj){
		//	return typeof(obj) == 'object' },
		handle: function(obj){
			// XXX
		},
	},

	// XXX these still intersect with attrs...
	// 		...need a destinct way to encapsulate these to destinguish
	// 		the data from attrs...
	// 		this is simple when nesting, i.e. just add the entries to 
	// 		.entries, attributes to .attrs and done, but in a flat format 
	// 		this is not obvious -- i.e. how do we destinguish attr 'x' 
	// 		from map key 'x'???
	setEntries: {
		match: function(obj){
			return obj instanceof Set },
		// NOTE: we are indexing sets...
		handle: function(obj){
			return [ obj.values()
				.map(function(v, i){ 
					return [[i], v] })
	   			.toArray() ] },
	},
	mapEntries: {
		// XXX should this be more generic and just check for .entries(..) ???
		match: function(obj){
			return obj instanceof Map },
		handle: function(obj, path, options){
			// NOTE: we store content in a special attribute...
			var pattern = options.contentAttr || module.CONTENT_ATTR
			var i = 0
			do{
				var attr = pattern
					.replace('$', i == 0 ?  '' : i)
				i++
			} while(attr in obj)
			// XXX store the attr in parent spec...
			// 		...how can we get the parent spec???
			// XXX

			return [ obj.entries()
				.map(function([k, v], i){ 
					return [
						// XXX not sure how to format these...
						[[attr, i +':key'], k], 
						[[attr, i], v], 
					] })
				.flat()
		   		.toArray() ] },
	},

	// XXX do we need to treat array keys as a special case???
	// 		...the best approach could be to simply:
	// 			- prioretize handlers -- already done
	// 			- skip repeating keys
	// 				...this could be done on the root handler level...
	// XXX need to optionally handle props...
	keys: {
		match: function(obj){
			return typeof(obj) == 'object' },
		handle: function(obj){
			return [ Object.entries(obj) 
				.map(function([k, v]){ 
					return [[k], v] }), ] },
	},
}


var getType = 
module.getType = 
function*(obj){
	// XXX
}


// XXX use STOP...
var getHandlers = 
module.getHandlers = 
function(obj, handlers=module.HANDLERS){
	return [...Object.entries(handlers)
			.iter()
			.filter(function([k, v]){
				if(v.final 
						&& v.match 
						&& v.match(obj)){
					throw types.STOP(true) }
				return v.match 
					&& v.match(obj) })
			.map(function([k, v]){
				return v })] }



// Format:
// 	[
//		[<path>, {type: <name>}],
//
//		[<path>, ['LINK', <path>]],
//
//		[<path>, <value>], 
// 	]
//
// XXX need a way to index the path...
// 		...and to filter paths by pattern...
// XXX need to generate object UIDs for use in paths etc...
// XXX might be a good idea to include obj in the output to negate the 
// 		need to get it via the path in client code...
var handle = 
module.handle = 
function*(obj, path=[], options={}){
	// handle recursive structures...
	// XXX would be nice to index paths to make them unique...
	var seen = options.seen =
	   options.seen || new Map()	
	if(seen.has(obj)){
		// XXX revise format...
		yield [path, ['LINK', seen.get(obj)]]
		return }
	typeof(obj) == 'object'
		&& seen.set(obj, path)

	// get compatible handler list...
	var cache = options.cache = 
		options.cache || new Map()
	var type = getType(obj)
	var handlers = 
		(type && cache.get(type)) 
			|| module.getHandlers(obj, options.handlers || module.HANDLERS)
	type
		&& cache.set(type, handlers)

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
		.map(function*(handler){
			yield* handler.handle instanceof types.Generator ?
				handler.handle(obj, path, options)
					.map(subtree)
				: subtree(handler.handle(obj, path, options)) }) }



// XXX need a better way to serialize the path...
var serializePathElem = function(p){
	return typeof(p) == 'object' ?
		JSON.stringify(p)
		: p }
var serializePath = function(p){
	//return '/'+ p.map(JSON.stringify).join('/') }
	return '/'+ p.map(serializePathElem).join('/') }
var serializePaths = 
module.serializePaths =
types.generator.iter
	.map(function([p, v]){
		return (
			// XXX revise...
			v instanceof Array && v[0] == 'LINK' ?
				[serializePath(p), 
					'LINK', serializePath(v[1])]
			: [serializePath(p), v] ) })



// XXX make this more generic...
// 		...or move these to the HANDLERS as .build(..)...
var construct = function(spec){
	return typeof(spec) != 'object' ?
			spec
		: spec.type == 'Object' ?
			{}
		: spec.type == 'Array' ?
			[]
		: spec.type == 'Set' ?
			new Set()
		: spec.type == 'Map' ?
			new Map()
		: undefined }
var has = function(root, path){
}
var get = function(root, path){
}
var set = function(root, path, value){
}

var build = 
types.generator.iter
	.reduce(function(root, [path, spec]){
		return path.length == 0 ?
			construct(spec)
			: set(root, path, value)
	}, undefined)



//---------------------------------------------------------------------
// XXX move to test...

var o = {
	number: 123,
	string: 'abc',

	// XXX add a mode to unify these...
	'null': null,
	'undefined': undefined,
	

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

	array_with_attrs: Object.assign(
		[1, 2, 3],
		{
			a: 'some value',
			b: 'some other value',
			// will overwrite 2...
			1: 333,
		})
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
		.chain(serializePaths)])

//console.log([...handle(o)])




/**********************************************************************
* vim:set ts=4 sw=4 :                               */ return module })
