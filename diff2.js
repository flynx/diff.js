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

	// XXX do we need to also traverse/index the keys???
	// 		...if yes then we'll need to somehow indicate a path to a key...
	// 		one way to do this is to add virtual paths and link to them...
	// 		...i.e. a virtual path is any path starting from a virtual root
	// 		that can be linked from within the tree...
	containerEntries: {
		containers: [
			Set,
			Map,
		],
		// XXX should this be more generic and just check for .entries(..) ???
		match: function(obj){
			for(var type of this.containers){
				if(obj instanceof type){
					return true } } },
		handle: function(obj){
			// XXX for some reason the .entries() iterator does not have 
			// 		the generaator methods -- we can't call obj.entries().map(..)...
			// XXX for sets k is the same a v... not sure how to handle this...
			return [ [...obj.entries()]
				.map(function([k, v]){ 
					return [[k], v] }), ] },
	},

	// XXX do we need to treat array keys as a special case???
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


var getHandlers = 
module.getHandlers = 
function(obj, handlers=module.HANDLERS){
	var stop = false
	return Object.entries(handlers)
			.filter(function([k, v]){
				return stop ?
					false
					// XXX this is a bit ugly...
					: (v.match 
						&& v.match(obj) 
						&& (stop = v.final, true)) })
			.map(function([k, v]){
				return v }) }



// XXX need a way to index the path...
// 		...and to filter paths by pattern...
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


var _serializePath = function(p){
	return typeof(p) == 'object' ?
		JSON.stringify(p)
		: p }
var serializePath = function(p){
	return '/'+ p.map(_serializePath).join('/') }

// XXX need a better way to serialize the path...
var shandle = 
module.shandle =
handle
	.map(function([p, v]){
		return (
			// XXX revise...
			v instanceof Array && v[0] == 'LINK' ?
				[serializePath(p), 
					'LINK', serializePath(v[1])]
			: [serializePath(p), v] ) })




//---------------------------------------------------------------------
// XXX move to test...

var o = {
	number: 123,
	string: 'abc',

	// XXX add a mode to unify these...
	'null': null,
	'undefined': undefined,
	

	empty_array: [],
	array: [1, 2, 3],

	// XXX set key is the object itself, is this what we want???
	set: new Set([1, [], {a:1}]),
	map: new Map([[[], 123], [321, {}]]),

	object: {
		x: {},
	},
}
// loop...
o.object.y = o.object

console.log([...shandle(o)])





/**********************************************************************
* vim:set ts=4 sw=4 :                               */ return module })
