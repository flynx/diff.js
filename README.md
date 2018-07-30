# Object diff

XXX Intro

- [Object diff](#object-diff)
	- [Motivation](#motivation)
	- [General](#general)
		- [Diff](#diff)
			- [Diff class API](#diff-class-api)
			- [Diff object API](#diff-object-api)
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

Add new type handler:

```javascript
ExtendedDiff.types.set(SomeType, {
	priority: null,

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


Add new *synthetic* type handler:

```javascript
ExtendedDiff.types.set(SomeType, {
	priority: null,

	check: function(obj, options){
		// ...
	},

	// ...
})
```


Remove an existing type handler:
```javascript
ExtendedDiff.types.delete('Text')
```

The [source code](./diff.js#L1098) is a good example for this as the base `Diff(..)` is built using this API, but note that we are registirng types on the `Types` object rather that on the `Diff` itself, there is no functional difference other than how the main code is structured internally.


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

XXX github, email, ...


## License

[BSD 3-Clause License](./LICENSE)

Copyright (c) 2018, Alex A. Naanou,
All rights reserved.
