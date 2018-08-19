# Object diff

*Object diff* is a not-so-basic diff/patch/pattern implementation for JavaScript objects / object trees.

- [Object diff](#object-diff)
	- [Introduction](#introduction)
		- [Seeing the difference (*diff*)](#seeing-the-difference-diff)
		- [Applying changes (*patch*)](#applying-changes-patch)
		- [Partial patching](#partial-patching)
		- [Checking](#checking)
		- [Generic ways to compare objects (*patterns*)](#generic-ways-to-compare-objects-patterns)
	- [Motivation](#motivation)
		- [Goals / Features](#goals--features)
	- [Installation and loading](#installation-and-loading)
	- [Diff](#diff)
		- [Diff class API](#diff-class-api)
		- [Diff object API](#diff-object-api)
		- [Supported JavaScript objects](#supported-javascript-objects)
		- [Extended 'Text' object support](#extended-text-object-support)
		- [Options](#options)
	- [Deep compare](#deep-compare)
	- [Patterns](#patterns)
		- [Logic patterns](#logic-patterns)
		- [String patterns](#string-patterns)
		- [Number patterns](#number-patterns)
		- [Array patterns](#array-patterns)
	- [Patterns (EXPERIMENTAL)](#patterns-experimental)
	- [JSON compatibility](#json-compatibility)
	- [Extending Diff](#extending-diff)
	- [The Diff format](#the-diff-format)
		- [Flat](#flat)
		- [Tree](#tree)
	- [Contacts, feedback and contributions](#contacts-feedback-and-contributions)
	- [License](#license)


## Introduction

Let's start with a couple of objects, similar but not quite:
```javascript
var Bill = {
	name: 'Bill',
	age: 20,
	hair: 'black',
	skills: [
		'awsome',
		'time travel',
	],
}

var Ted = {
	name: 'Ted',
	age: 20,
	hair: 'blond',
	skills: [
		'awsome',
		'time travel',
		'guitar',
	],
}
```

### Seeing the difference (*diff*)

```javascript
var Diff = require('object-diff').Diff

var diff = Diff(Bill, Ted)

// and log out the relevant part...
console.log(diff.diff)
```

Here's how different `Bill` and `Ted` really are (or how the *diff* looks like):
```javascript
// log out the relevant part...
console.log(diff.diff)
```
And the output is:
```javascript
[
	{
		"path": ["name"],
		"A": "Bill",
		"B": "Ted"
	},
	{
		"path": ["hair"],
		"A": "black",
		"B": "blond"
	},
	{
		"path": ["skills", [[2, 0], [2, 1]]],
		"B": [
			"guitar"
		]
	},
	{
		"path": ["skills", "length"],
		"A": 2,
		"B": 3
	}
]
```
This tells us that we have four *changes*:
- different `"name"`
- different `"hair"`
- in `"skills"` missing `"guitar"`
- in `"skills"` different `"length"`

A couple of words on the format:
- `A` and `B` indicate the states of the *change* in the input objects,
- `path` tells us how to reach the *change* in the inputs,
- The odd thing in `"path"` of the third change is the *index* of the change in the input `"skills"` arrays where each element (`[2, 0]` and `[2, 1]`) describes the spot in the array that changed in the corresponding input object. Each element consists of two items, the first is the actual *index* or position of the change (in both cases `2`) and the second is the length of the change (`0` and `1` respectively, meaning that in `A` we have zero or no items and in `B` one),
- `"A"` or `"B"` may not be present in the change (change #3) if the change describes simple item addition or removal,
- The format is redundant in places by design, for example here you can both infer `"skills"` *length* from the *changes* applied to it and we have an explicit `["path", "length"]` *change*. This is mainly to support cases where inferring array length from changes to it may not be possible, like for sparse arrays.

Now, we can do different things with this information (*diff object*).

### Applying changes (*patch*)

```javascript
// let's clone Bill, just in case...
var Bill2 = JSON.parse(JSON.stringify(Bill))

// now apply the patch...
diff.patch(Bill2)

console.log(Bill2)
```

Since we applied all the changes to `Bill2`, now he looks just like `Ted`:
```javascript
{
	"name": "Ted",
	"age": 20,
	"hair": "blond",
	"skills": [
		"awsome",
		"time travel",
		"guitar"
	]
}
```

### Partial patching

XXX partial patch...  
XXX modify the diff -- teach Ted guitar...  

### Checking

XXX

### Generic ways to compare objects (*patterns*)

And for further checking we can create a *pattern*:
```javascript
var {cmp, OR, STRING, NUMBER, ARRAY} = require('object-diff')

var PERSON = {
	name: STRING,
	age: NUMBER,
	hair: OR(
		'blond', 
		'blonde', 
		'black', 
		'red', 
		'dark', 
		'light',
		// and before someone asks for blue we'll cheat ;)
		STRING
	),
	skills: ARRAY(STRING),
}

// now we can "structure-check" things...
cmp(Bill, PERSON) // -> true
```

*Now for the serious stuff...*

## Motivation

XXX

### Goals / Features
- Full JSON *diff* support
- Support for JavaScript objects without restrictions
- ~~Optional attribute order support~~ (not done yet)
- ~~Support extended Javascript types: Map, Set, ...etc.~~ (feasibility testing)
- *Text diff* support
- Configurable and extensible implementation
- As simple as possible

XXX alternatives


## Installation and loading

Install the package:
```shell
$ npm install --save object-diff
```

Load the module:
```javascript
var diff = require('object-diff')
```

This module supports both [requirejs](https://requirejs.org/) and [node's](https://nodejs.org/) `require(..)`.


XXX list basic use-cases:
- creating / manipulating a diff
- patching objects
- deep comparisons and patterns


## Diff

Create a diff object:
```javascript
var diff = new Diff(A, B)
```

### Diff class API

`Diff.cmp(A, B) -> bool`  
Deep compare `A` to `B`.

`Diff.clone(<title>)`  
Clone the `Diff` constructor, useful for extending or tweaking the type handlers (see: [Extending](#extending-diff) below).

`Diff.fromJSON(json) -> diff`  
Build a diff object from JSON (exported via `.json()`).


### Diff object API

`diff.patch(X) -> X'`  
Apply "diff* (or *patch*) `X` to `X'` state.

`diff.unpatch(X') -> X`  
Undo *diff" application to `X'` returning it to `X` state.

`diff.check(X) -> bool`  
Check if *diff* is compatible/applicable to `X`. This essentially checks if the *left hand side* of the *diff* matches the corresponding nodes of `X`.

`diff.json() -> JSON`  
Serialize the *diff* to JSON. Note that the output may or may not be JSON compatible depending on the inputs.


### Supported JavaScript objects

The object support can be split into two, basic objects that are stored as-is and containers that support item changes when their types match.

All JavaScript objects/values are supported in the basic form / as-is.

Containers that support item changes include:
- `Object`
- `Array`
- ~~`Map` / `WeakMap`~~ *(planned but not done yet)*
- ~~`Set` / `WeakSet`~~ *(planned but not done yet)*

Additionally attribute changes are supported for all non basic objects (i.e. anything for which `typeof X` yeilds `"object"`). This can be disabled by setting `options.no_attributes` to `true` (see: [Options](#options) below).

### Extended 'Text' object support

A *text* is JavaScript string that is long (>1000 chars, configurable in [Oprions](#options)) and multiline string.

A *text* is treated as an `Array` containing the string split into lines (split by `'\n'`).

Shorter strings or strings containing just a single line are treated as *basic* monolithic string objects and included in the *diff* as-is.


### Options

```javascript
{
	// if true return a tree diff format...
	tree_diff: false | true,

	// if true, NONE change items will not be removed from the diff...
	keep_none: false | true,

	// Minimum length of a string for it to be treated as Text...
	//
	// If this is set to a negative number Text diffing is disabled.
	//
	// NOTE: a string must also contain at least one \n to be text 
	//		diffed...
	min_text_length: 100 | -1,

	// If true, disable attribute diff for non Object's...
	//
	// XXX should be more granular...
	no_attributes: false | true,

	// Plaeholders to be used in the diff..
	//
	// Set these if the default values conflict with your data...
	//
	// XXX remove these from options in favor of auto conflict 
	//		detection and hashing...
	NONE: null | { .. },
	EMPTY: null | { .. },
}
```

## Deep compare

```javascript
cmp(A, B)

Diff.cmp(A, B)
```
XXX


## Patterns

XXX General description...

### Logic patterns

`ANY`  
Matches anything


`NOT(A)`  
Match anything but `A`


`OR(A[, .. ])`  
Match if *one* of the arguments matches


`AND(A[, .. ])`  
Matches of *all* of the arguments match


### String patterns

`STRING`  
Match any string.

`STRING(string)`  
Match a specific string.

`STRING(regexp)`  
Match a string via a `RegExp` object.

`STRING(func)`  
Match a string via a function predicate.

`STRING(pattern)`  
Match a string via a nested pattern.


### Number patterns

`NUMBER`  
`NUMBER(number)`  
`NUMBER(min, max)`  
`NUMBER(min, max, step)`  
`NUMBER(func)`  
`NUMBER(pattern)`  
Matches a number


### Array patterns

`ARRAY`  
Matches any array.

`ARRAY(length)`  
Matches an array of length `length`.

`ARRAY(func)`  
Match if `func` returns true when applied to each array item.

`ARRAY(pattern)`  
Match if `pattern` matches each array item.

`ARRAY(x, y, ..)`  
A combination of the above where `x`, `y` and `..` may be any of *length*, *functions* or *patterns*.  
This is a shorthand for: `AND(ARRAY(x), ARRAY(y), ..)`

XXX examples...


## Patterns (EXPERIMENTAL)

`IN(A)`  

`AT(A, K)`  

`OF(A, N)`  


## JSON compatibility

```javascript
var json = diff.json()

var diff2 = Diff.fromJSON(json)
```

Note that the output of `.json()` may not be JSON compatible if the input objects are not json compatible. The reasoning here is simple: `object-diff` is a *diffing* module and not a *serializer*.

The simple way to put this is: if the inputs are JSON-compatible the output of `.json()` is going to also be JSON-compatible.

The big picture is a bit more complicated, `Diff(..)` and friends support allot more than simply JSON, this would include any types, attributes on all objects and loops/recursive structures.

`.fromJSON(..)` does not care about JSON compatibility and will be happy with any output of `.json()`.


## Extending Diff

Create a new diff constructor:

```javascript
var ExtendedDiff = diff.Diff.clone()
```

This has the same API as `Diff` and inherits from it, but it has an independent handler map that can be manipulated without affecting the original `Diff` setup.

When building a *diff* type checking is done in two stages:
1. via the `.check(..)` method of each implementing handler, this approach is used for *synthetic* type handlers, as an exmple look at `'Text'` that matches long multi-line string objects.
2. type-checking via `instanceof` / `.construtor`, this is used for JavaScript objects like `Array` and `Object` instances, for example.

Hence we have two types of handler objects, those that implement `.check(..)` and can have any arbitrary object as a key (though a nice and readable string is recommended), and objects that have the constructor as key against which `instanceof` checks are done.

`.check(..)` has priority to enable handlers to intercept handling of special cases, `'Text'` handler would be a good example.

If types of the not equal object pair mismatch `'Basic'` is used and both are stored in the *diff* as-is.

`.priority` enables sorting of checks and handlers within a stage, can be set to a positive, negative `Number` or `null`, priorities with same numbers are sorted in order of occurrence.

Adding new *synthetic* type handler:
```javascript
ExtendedDiff.types.set('SomeType', {
	// Type check priority (optional)...
	//
	// Types are checked in order of occurrence in .handlers unless
	// type .priority is set to a non 0 value.
	//
	// Default priorities:
	//	Text:		100
	//		Needs to run checks before 'Basic' as its targets are
	//		long strings that 'Basic' also catches.
	//	Basic:		50
	//		Needs to be run before we do other object checks.
	//	Object:		-100
	//		Needs to run after everything else as it will match any
	//		set of objects.
	//
	// General guide:
	//	>50			- to be checked before 'Basic'
	//	<50 and >0	- after Basic but before unprioritized types
	//	<=50 and <0	- after unprioritized types but before Object
	//	<=100		- to be checked after Object -- this is a bit 
	//				  pointless in JavaScript.
	//
	// NOTE: when this is set to 0, then type will be checked in 
	//		order of occurrence...
	priority: null,

	// If set to true will disable additional attribute diffing on 
	// matching objects...
	no_attributes: false | true,

	// Check if obj is compatible (optional)...
	//
	// 	.check(obj[, options])
	//		-> bool
	//
	compatible: function(obj, options){
		// ...
	},

	// Handle/populate the diff of A and B...
	//
	// Input diff format:
	//	{
	//		type: <type-name>,
	//	}
	//
	handle: function(obj, diff, A, B, options){
		// ...
	},

	// Walk the diff...
	//
	// This will pass each change to func(..) and return its result...
	//
	//	.walk(diff, func, path)
	//		-> res
	//
	// NOTE: by default this will not handle attributes (.attrs), so
	//		if one needs to handle them Object's .walk(..) should be 
	//		explicitly called...
	//		Example:
	//			walk: function(diff, func, path){
	//				var res = []
	//
	//				// handle specific diff stuff...
	//				
	//				return res
	//					// pass the .items handling to Object
	//					.concat(this.typeCall(Object, 'walk', diff, func, path))
	//			}
	walk: function(diff, func, path){
		// ...
	},

 	// Patch the object...
	//
	patch: function(target, key, change, root, options){
		// ...
	},

	// Finalize the patch process (optional)...
	//
	// This is useful to cleanup and do any final modifications.
	//
	// This is expected to return the result.
	//
	// see: 'Text' for an example.
	postPatch: function(result){
		..

		return result
	},



 	// Reverse the change in diff...
	//
	reverse: function(change){
		// ...
	},
})
```

Adding new type handler (checked via `instanceof` / `.constructor`):
```javascript
ExtendedDiff.types.set(SomeOtherType, {
	priority: null,

	// NOTE: .check(..) is not needed here...

	// the rest of the methods are the same as before...
	// ...
})
```

Remove an existing type handler:
```javascript
ExtendedDiff.types.delete('Text')
```

The [source code](./diff.js#L1098) is a good example for this as the base `Diff(..)` is built using this API, but note that we are registering types on the `Types` object rather than on the `Diff` itself, there is no functional difference other than how the main code is structured internally.

The handler methods are all called in the context of the `Diff.types` instance, this instance is created per `Diff`'s method call and is destroyed right after the method is done, thus it is save to use the context for caching.

To call a different type handler's methods use:
```javascript
this.typeCall(HandlerType, 'method', ...args)
```
For an example see: `Object` handler's `.walk(..)` in [diff.js](./diff.js#L1178).

## The Diff format

### Flat

This is the main and default format used to store diff information.

```javascript
[]
```


### Tree

This format is used internally but may be useful for introspection.

```javascript
```

## Contacts, feedback and contributions

- https://github.com/flynx/object-diff.js
- XXX npm
- https://github.com/flynx


## License

[BSD 3-Clause License](./LICENSE)

Copyright (c) 2018, Alex A. Naanou,
All rights reserved.
