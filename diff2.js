/**********************************************************************
* 
*
*
**********************************************/  /* c8 ignore next 2 */
((typeof define)[0]=='u'?function(f){module.exports=f(require)}:define)
(function(require){ var module={} // make module AMD/node compatible...
/*********************************************************************/

var object = require('ig-object')
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


var WALK_HANDLERS = 
module.WALK_HANDLERS = {
	// prevent dissecting null...
	null: {
		walk: function(obj){
			if(obj === null){
				throw module.STOP } } },

	set: {
		walk: function(obj){
			return obj instanceof Set
				&& [...obj.values()].entries() } },
	map: {
		walk: function(obj){
			return obj instanceof Map
				&& obj.entries() } },

	/* XXX should we handle array elements differently???
	//		...these to simply mark attr type for the handler(..), not 
	//		sure if the added complexity is worth it... (???)
	array: {
		walk: function(obj){
			return obj instanceof Array
				&& [...Object.entries(obj)]
					.filter(function(e){ 
						return !isNaN(parseInt(e)) }) }},
	attr: {
		walk: function(obj){
			return obj instanceof Array ?
				[...Object.entries(obj)]
					.filter(function(e){ 
						return isNaN(parseInt(e)) })
				: typeof(obj) == 'object'
					&& [...Object.entries(obj)] } },
	/*/
	attr: {
		walk: function(obj){
			return typeof(obj) == 'object'
				&& Object.entries(obj) } },
	//*/
	proto: {
		walk: function(obj){
			return typeof(obj) == 'object'
				&& obj.constructor.prototype !== obj.__proto__
				&& [['__proto__', obj.__proto__]] }, },

}

//	
//	walk(<handler>[, <options>])
//	walk(<handler>, <path>[, <options>])
//		-> <walker>
//
//
//	<handler>(<obj>, <path>, <next>, <type>)
//		-> <value>
//		!> STOP(<value>)
//
//	Link handling...
//	<handler>(<obj>, <path>, <orig-path>, 'LINK')
//		-> <value>
//		!> STOP(<value>)
//
//
//	<walker>(<obj>)
//	<walker>(<obj>, <path>)
//		-> <generator>
//			-> <value>
//
//
//	<next> is a mutable array that can be edited it <handler> affecting
//	further walking (a-la Python's walk(..)).
//
//
// XXX the idea here is to try to decouple the walk from the format and 
// 		move the formatters and other stuff out...
// 		...not sure if this is simpler yet... 
// XXX can we decouple this from what we are walking???
var walk =
module.walk =
function(handler, path=[], options={}){
	// normalize the handler...
	var _handler = 
		handler instanceof types.Generator ?
			handler
			: function*(){ yield handler(...arguments) }
	// parse args...
	options = 
		typeof(path) == 'object' && !(path instanceof Array) ?
			path
			: options
	options = 
		// inherit options from HANDLE_DEFAULTS of we don't already...
		!object.parentOf(module.HANDLE_DEFAULTS, options) ?
			Object.assign(
				{ __proto__: module.HANDLE_DEFAULTS },
				options)
			: options
	var handlers = options.handlers || module.WALK_HANDLERS
	// XXX do we need this in options???
	var seen = options.seen = options.seen || new Map()	
	var p = path

	var _walk = function*(obj, path=p, type=undefined){
		path = path instanceof Array ?
				path
			: typeof(path) == 'string' ?
				str2path(path)
			: [] 
		type = type || 'root'

		// handle reference loops...
		if(seen.has(obj)){
			yield* _handler(obj, path, seen.get(obj), 'LINK')
			return }
		typeof(obj) == 'object'
			&& seen.set(obj, path)

		// format:
		// 	[
		// 		[<handler-name>, [ [<key>, <value>], .. ]],
		// 		..
		// 	]
		var next = 
			[...Object.entries(handlers)
				// NOTE: we need this to support throwing STOP...
				.iter()
				.filter(function([n, h]){
					return h.walk 
						&& !options['no' + n.capitalize()] })
				.map(function([n, h]){
					// XXX should we call the handler(..) once per set of 
					// 		next values (i.e. attrs, items, ...)???
					var res = h.walk(obj)
					return res 
						&& [n, res] })
				.filter(function(e){
					return !!e }) ]

		try {
			// main object...
			yield* _handler(obj, path, next, type)
			// next/children...
			yield* next
				.iter()
				.map(function*([type, items]){
					yield* items
						.iter()
						.map(function*([key, value]){ 
							yield* _walk(value, path.concat(key), type) }) })
		// handle STOP...
		} catch(err){
			if(err === module.STOP){
				return
			} else if(err instanceof module.STOP){
				yield err.value
				return }
			throw err } } 

	return _walk }


// XXX rename...
var walker = 
walk(function(obj, path, next, type){
	// text...
	if(typeof(obj) == 'string' && obj.includes('\n')){
		next.push(['text', obj.split(/\n/g).entries()])
		return [path, {type: 'text'}] }

	return type == 'LINK' ?
			[path, 'LINK', next]
		: [
			path,
			obj == null ?
				obj
			: typeof(obj) == 'object' ?
				{type: obj.constructor.name}
			: obj,
		] })



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
		// flatten lispPaths...
		.flat(Infinity)
		.map(serializePathElem)
		.reduce(function(res, e){
			e = e === module.CONTENT ?
				(res.length == 0 ? 
						'' 
						: res.pop()) 
					+ ':CONTENT'
				// special case: '' as key...
				: e === '' ?
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
// XXX add support for options.lispPaths
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


// XXX if two sub-trees are different, to we treat them as a big set of 
// 		atomic changes or replace X with Y???
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
// 		XXX yet another approach to this is to work in two stages:
// 				1) diff ignoring keys...
// 				2) selectively match keys...
// 			...need to test how complex this will be...
//
var keyValueDiff =
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

// XXX this completely ignores the path/key...
// XXX this works great for arrays but is questionable on other stuff...
var valueDiff =
function(A, B){
	return diffSections(
		[...handle(A)
			.chain(serializePaths)], 
		[...handle(B)
			.chain(serializePaths)], 
		// XXX add link support...
		function([ap, av], [bp, bv]){
			return av == bv 
				|| (typeof(av) == 'object' 
					&& typeof(bv) == 'object' 
					&& av.type
					&& av.type == bv.type ) }) }


var diff = valueDiff



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
	...walker(o)
		.chain(
			serializePaths, 
		)])


/*/ use spec to create a new object...
console.log('\n\n---\n', 
	[...walker(write(null, walker(o)))
		.chain(
			serializePaths, 
			// make the output a bit more compact...
			stripAttr('source'), 
		)])
//*/


/* XXX
var A = ['x',1,2,3,1,2,3,4,5,,,4]
var B = ['x',1,2,3,4,5,6]

console.log(A)
console.log(B)

console.log(
	commonSections(A, B))
console.log(
	diffSections(A, B))

console.log([...walker(A).chain(serializePaths)])
console.log([...walker(B).chain(serializePaths)])

// XXX
console.log(diff(B, A))
//*/

/*
console.log(JSON.stringify(diff(
	[1,4,2,3],
	[1,2,3],
), null, '    '))
//*/


console.log('---')

// XXX test functions...
console.log([
	//...walker(o)
	...walker(['this\nis\nsome\n\ttext'])
		.chain(serializePaths) ])



/**********************************************************************
* vim:set ts=4 sw=4 :                               */ return module })
