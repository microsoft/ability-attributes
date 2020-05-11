# Ability Attributes

A runtime accessibility attributes integrity validator.

## About

*This project is pretty much in a work-in-progress proof-of-concept state. More docs and examples are to come.*

It is very easy to make nonsense setting the accessibility-related attributes of the DOM elements and it takes time to learn how to set them properly. And because those attributes make sense for the screen readers only, it is very hard to tell if nothing is broken in a big application. This tool allows to specify a schema for the accessibility-related attributes and see all schema violations at runtime during the developlent process.

1. [Overview](#overview)
1. [/classes](#classes)
    1. [/classes/*ClassName*](#classes-classname)
        1. [/classes/*ClassName*/tags](#classes-classname-tags)
        1. [/classes/*ClassName*/parameters](#classes-classname-parameters)
        1. [/classes/*ClassName*/constraints](#classes-classname-constraints)
        1. [/classes/*ClassName*/inherits](#classes-classname-inherits)
        1. [/classes/*ClassName*/assumptions](#classes-classname-assumptions)
1. [/parameters](#parameters)
    1. [/parameters/$*ParameterId*](#parameters-id)
        1. [/parameters/$*ParameterId*/name](#parameters-id-name)
        1. [/parameters/$*ParameterId*/attributes](#parameters-id-attributes)
        1. [/parameters/$*ParameterId*/one](#parameters-id-one)
1. [/attributes](#attributes)
    1. [/attributes/$*AttributeId*](#attributes-id)
        1. [/attributes/$*AttributeId*/name](#attributes-id-name)
        1. [/attributes/$*AttributeId*/value](#attributes-id-value)
1. [/constraints](#constraints)
    1. [/constraints/$*ConstraintId*](#constraints-id)
        1. [/constraints/$*ConstraintId*/xpath](#constraints-id-xpath)
        1. [/constraints/$*ConstraintId*/js](#constraints-id-js)
        1. [/constraints/$*ConstraintId*/description](#constraints-id-description)
1. [\<tag\>](#tag)
    1. [\<tag\>/parameters](#tag-parameters)
    1. [\<tag\>/attributes](#tag-attributes)
    1. [\<tag\>/constraints](#tag-constraints)
1. [Using the schema](#usage)

## Overview <a name="overview"></a>

One of the key goals for the schema is to provide an explicit bridge between accessibility-related attributes applied to a DOM node and their intended meaning in the particular place of the application.

For example, reading the code you might see something like:

```html
<div aria-label="Blah blah" role="region">...</div>
```

It's not always obvious why a particular attribute is used in a particular place and if that usage is valid. It is even harder to understand if something is going to break by giving or taking another WAI-ARIA attribute.

We try fix that by describing **classes** which connect the WAI-ARIA attributes with their meaning for the particular component of the application. The classes are placed in the JSON schema file, then we use `data-aa-class` attribute on the accessible DOM node. After that the continuous runtime validator kicks in and whenever something diverges from the possibilities listed in the schema, a developer sees an error right away. Note that the validator is a tool for the developers, so we only validate non-production builds.

For example, we can add a class named `Button` and it might look like:

```json
...
"Button": {
    "tags": {
        "<div>, <span>": {
            "attributes": [
                {
                    "name": "role",
                    "value": "button"
                },
                {
                    "name": "tabindex",
                    "value": "0"
                },
                {
                    "name": "aria-disabled",
                    "value": "true",
                    "optional": true
                }
            ]
        }
    }
}
...
```

By that example we tell that a DOM node of that `Button` class can be either `<div>` or `<span>`, it must have `role="button"` and it must have `tabindex="0"`, it also can optionally have `aria-disabled="true"`.

Here are examples of what will be valid and invalid for the instances of that class:

```html
<!-- Valid example -->
<div role="button" tabindex="0" data-aa-class="Button">Blah</div>

<!-- Valid example -->
<div role="button" tabindex="0" aria-disabled="true" data-aa-class="Button">Blah</div>

<!-- Invalid example: Missing tabindex -->
<div role="button" data-aa-class="Button">Blah</div>

<!-- Invalid example: Illegal tabindex value -->
<div role="button" tabindex="1" data-aa-class="Button">Blah</div>

<!-- Invalid example: Illegal tag -->
<a role="button" tabindex="0" data-aa-class="Button">Blah</a>

<!-- Invalid example: Illegal aria-disabled value -->
<div role="button" tabindex="0" aria-disabled="false" data-aa-class="Button">Blah</div>

<!-- Invalid example: By default every node with ARIA attributes
must specify the class -->
<div role="button" tabindex="0">Blah</div>

<!-- Invalid example: Illegal ARIA attribute aria-checked -->
<div role="button" tabindex="0" aria-checked="true" data-aa-class="Button">Blah</div>

```

As you can see, we can go pretty strict with what is allowed and what is not allowed. One of the illegal examples above has `aria-checked="true"` which is perfectly valid HTML. But it is not allowed in the class `Button`, so it is invalid in the context or our button, if `aria-checked="true"` is valid for the buttons in your application, you can add it to the schema, but perhaps another class named `Checkbox` would have more semantical sense. Another illegal example above has `aria-disabled="false"` which is perfectly valid HTML too, but it also has no effect and is as good as not specifying `aria-disabled` at all. We can add `false` to the list of legal `aria-disabled` values, but it makes sense to keep the way the attributes are specified consistent and restrict the number of options.

From the further application development process point of view, everybody is free to mutate accessibility-related attributes within the schema restrictions. But new attributes and new semantical entities must be added to the schema, and that should trigger more accessibility-skilled developers to have a closer look at what is being changed, where and why.

In the examples above we used the classes to validate the existing DOM. The classes can also be used from the opposite direction. If we have a class, we can ask it to provide neccessary WAI-ARIA attributes. From the JSON schema a TypeScript file is generated. Then you can do something like:


```ts
import { Button } from './schema';

// Our primitive example above doesn't have parameters, but
// we can parametrize classes (see the parameters section).
const btn = new Button('div', {});
console.log(btn.getAttributes());
```

The output looks like:

```json
{data-aa-class: "Button", role: "button", tabindex: "0"}
```

Using the schema to get actual attributes allows even better connection with the meaning. And when you add/remove attributes to the schema they will automatically appear/disappear from every place of the application the class is used in. Plus the parameters in the generated TypeScript code for the schema are srtictly typed, so that if you add or remove a mandatory parameter to the schema, the application won't compile without providing that parameter to every class instance.

## /classes <a name="classes"></a>

Classes are the entry point for the application to interact with the schema. In the JSON schema file they go under the top-level `classes` property:

```json
{
    ...

    "classes": {
        "Button": {
            ...
        },
        "Checkbox": {
            ...
        },
        ...
    }

    ...
}
```

### /classes/*ClassName* <a name="classes-classname"></a>

#### /classes/*ClassName*/tags <a name="classes-classname-tags"></a>
#### /classes/*ClassName*/parameters <a name="classes-classname-parameters"></a>
#### /classes/*ClassName*/constraints <a name="classes-classname-constraints"></a>
#### /classes/*ClassName*/inherits <a name="classes-classname-inherits"></a>
#### /classes/*ClassName*/assumptions <a name="classes-classname-assumptions"></a>
## /parameters <a name="parameters"></a>
### /parameters/$*ParameterId* <a name="parameters-id"></a>
#### /parameters/$*ParameterId*/name <a name="parameters-id-name"></a>
#### /parameters/$*ParameterId*/attributes <a name="parameters-id-attributes"></a>
#### /parameters/$*ParameterId*/one <a name="parameters-id-one"></a>
## /attributes <a name="attributes"></a>
### /attributes/$*AttributeId* <a name="attributes-id"></a>
#### /attributes/$*AttributeId*/name <a name="attributes-id-name"></a>
#### /attributes/$*AttributeId*/value <a name="attributes-id-value"></a>
## /constraints <a name="constraints"></a>
### /constraints/$*ConstraintId* <a name="constraints-id"></a>
#### /constraints/$*ConstraintId*/xpath <a name="constraints-id-xpath"></a>
#### /constraints/$*ConstraintId*/js <a name="constraints-id-js"></a>
#### /constraints/$*ConstraintId*/description <a name="constraints-id-description"></a>
## \<tag\> <a name="tag"></a>
### \<tag\>/parameters <a name="tag-parameters"></a>
### \<tag\>/attributes <a name="tag-attributes"></a>
### \<tag\>/constraints <a name="tag-constraints"></a>
## Using the schema <a name="usage"></a>

## Contributing

Contributions are welcome (see the [CONTRIBUTING](./CONTRIBUTING.md) file), though please keep in mind the work-in-progress proof-of-concept state. Might make sense to just observe/discuss until the thing gets stable and well-documented.

## License
This project is licensed under the MIT License, see the [LICENSE](LICENSE) file for details.
