# Object diff

XXX Intro

- [Object diff](#object-diff)
	- [Motivation](#motivation)
	- [General](#general)
		- [Diff](#diff)
			- [Diff class API](#diff-class-api)
			- [Diff object API](#diff-object-api)
			- [Supported JavaScript objects](#supported-javascript-objects)
			- [Options](#options)
		- [Deep compare](#deep-compare)
		- [Patterns](#patterns)
		- [Patterns (EXPERIMENTAL)](#patterns-experimental)
		- [JSON compatibility](#json-compatibility)
	- [Extending Diff](#extending-diff)
	- [The Diff format](#the-diff-format)
		- [Flat](#flat)
		- [Tree](#tree)
	- [Contacts, feedback and contributions](#contacts-feedback-and-contributions)
	- [License](#license)


## Motivation

XXX goals

XXX alternatives


## General

Install the package:
```bash
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


### Diff

Create a diff object:
```javascript
var diff = new Diff(A, B)
```

#### Diff class API

`.cmp(A, B) -> bool`

`.clone(<title>)`

`.fromJSON(json) -> diff`


#### Diff object API

`.patch(X) -> X'`

`.unpatch(X') -> X`

`.check(X) -> bool`

`.json() -> JSON`


#### Supported JavaScript objects

The object support can be split into two, basic objects that are stored as-is and containers that support item changes when their types match.

All JavaScript objects/values are supported in the basic form / as-is.

Containers that support item changes include:
- `Object`
- `Array`
- ~~`Map` / `WeakMap`~~ *(planned but not done yet)*
- ~~`Set` / `WeakSet`~~ *(planned but not done yet)*

Additionally attribute changes are supported for all non basic objects (i.e. anything that `typeof X` yeilds `"object"`) and can be disabled by setting `options.no_attributes` to `true`.


#### Options

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
	min_text_length: 1000 | -1,

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

### Deep compare

```javascript
cmp(A, B)

Diff.cmp(A, B)
```


### Patterns

XXX General description...

`ANY` - matches anything

`NOT(A)` - match anything but `A`

`OR(A[, .. ])` - match if *one* of the arguments matches

`AND(A[, .. ])` - matches of *all* of the arguments match

XXX examples...


### Patterns (EXPERIMENTAL)

`NUMBER(min, max)`

`IN(A)`

`AT(A, K)`

`OF(A, N)`


### JSON compatibility

```javascript
var json = diff.json()

var diff2 = Diff.fromJSON(json)
```

Note that the output of `.json()` may not be JSON compatible if the input objects are not json compatible. The reasoning here is simple: `object-diff` is a *diffing* module and not a *serializer*.

The simple way to put this is: if the inputs are JSON-compatible the output of `.json()` is going to also be JSON-compatible.

The big picture is a bit more complicated, `Diff(..)` and friends support allot more than simply JSON, this would include any types, attributes on all objects and loops/recursive structures.

`.fromJSON(..)` does not care about JSON compatibility and will be happy with any output of `.json()`.


## Extending Diff

Create a new diff handler:

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
	priority: null,

	check: function(obj, options){
		// ...
	},

	handle: function(obj, diff, A, B, options){
		// ...
	},
	walk: function(diff, func, path){
		// ...
	},
	patch: function(target, key, change, root, options){
		// ...
	},
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

XXX github, npm, email, ...


## License

[BSD 3-Clause License](./LICENSE)

Copyright (c) 2018, Alex A. Naanou,
All rights reserved.
