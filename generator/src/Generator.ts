/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import Ajv = require('ajv');
import * as fs from 'fs';
import * as path from 'path';

import { Schema } from 'ability-attributes';

interface ParameterInClassEntry extends Schema.ParameterEntry {
    optional?: boolean | Schema.Constraint | Schema.ConstraintRef;
    overridable?: string;
    overrides?: string;
}

type Parameter = Schema.ParameterEntry | { one: Schema.ParameterEntry[]; };

interface ParameterRel {
    rel: string;
    overridable?: string;
    overrides?: string;
}

interface ParameterInClassRef {
    ref: string;
    optional?: boolean | Schema.Constraint | Schema.ConstraintRef;
    overridable?: string;
    overrides?: string;
}

type ParameterInClass =
    ParameterInClassEntry |
    {
        one: Schema.ParameterEntry[];
        optional?: boolean | Schema.Constraint | Schema.ConstraintRef;
        overridable?: string;
        overrides?: string;
    };

interface Parameters {
    [key: string]: Parameter;
}

interface ParametersMap {
    [name: string]: true;
}

interface ResolvedParametersInClass {
    [name: string]: ParameterInClass;
}

interface ResolvedRelativeParametersByTag {
    [tagName: string]: ResolvedParametersInClass;
}

interface ParamConstraintsByTag {
    [tagName: string]: Schema.TagConstraints;
}

interface AttributeEntry {
    name: string;
    value: string | string[];
    optional?: boolean;
}

type Attribute = AttributeEntry | { one: AttributeEntry[]; };

interface Attributes {
    [key: string]: Attribute;
}

interface AttributeRef {
    ref: string;
}

interface Constraints {
    [key: string]: Schema.Constraint;
}

interface Tag {
    constraints?: (Schema.Constraint | Schema.ConstraintRef)[];
    attributes?: (Attribute | AttributeRef)[];
    parameters?: { [rel: string]: ParameterInClass | ParameterInClassRef };
}

interface SchemaClass {
    inherits?: string;
    assumptions?: Schema.ClassAssumption[];
    constraints?: (Schema.Constraint | Schema.ConstraintRef)[];
    parameters?: (ParameterInClass | ParameterInClassRef | ParameterRel)[];
    tags?: { [tag: string]: Tag | null };
}

interface ProcessedClass {
    assumptions?: Schema.ClassAssumption[];
    constraints?: (Schema.Constraint | Schema.ConstraintRef)[];
    parameters?: (ParameterInClass | ParameterInClassRef | ParameterRel)[];
    tags: { [tag: string]: Tag };
}

interface SchemaClasses {
    [name: string]: SchemaClass;
}

interface ProcessedClasses {
    [name: string]: ProcessedClass;
}

interface Schema {
    version: string;
    namespace?: string;
    constraints?: Constraints;
    parameters?: Parameters;
    attributes?: Attributes;
    classes: SchemaClasses;
}

//const paramNameRegexp = /^[a-z_][a-z0-9_]*$/i;
const tagNameRegExp = /^\<\s*[a-z][a-z0-9_-]*\s*\>$/i;

const ajv = new Ajv({ allErrors: false, jsonPointers: true });
const validateSchema = ajv.compile(require(path.join(__dirname, '../schema-schema.json')));

function formatError(error: Ajv.ErrorObject): string {
    let message: string;

    // console.error(error);

    if ('additionalProperty' in error.params) {
        message = `has invalid property '${ error.params.additionalProperty }'`;
    } else if (error.message) {
        message = error.message;
    } else {
        message = 'has schema validation error';
    }

    return `${ error.dataPath || 'Root object' } ${ message }`;
}

export class CodeGenerator {
    private _schemaFilename: string;
    private _constraints: Constraints;
    private _parameters: Parameters;
    private _attributes: Attributes;
    private _devCondition: string;
    private _classes: ProcessedClasses;

    constructor(schema: string, devCondition?: string) {
        this._schemaFilename = schema;
        const parsedSchema = JSON.parse(fs.readFileSync(schema).toString()) as Schema;
        this._validate(parsedSchema);
        this._classes = this._processInheritance(parsedSchema);
        this._constraints = parsedSchema.constraints || {};
        this._parameters = parsedSchema.parameters || {};
        this._attributes = parsedSchema.attributes || {};
        this._devCondition = devCondition || `process.env.NODE_ENV !== 'production'`;
    }

    private _validate(schema: Schema): void {
        if (!validateSchema(schema)) {
            const errors: { [message: string]: boolean } = {};

            throw new Error(`${ this._schemaFilename }:\n\n${ validateSchema.errors && validateSchema.errors.length
                ? validateSchema.errors.map(formatError).filter(e => { const r = e in errors; errors[e] = true; return !r; }).join('\n')
                : 'Schema validation error' }`);
        }
    }

    private _processInheritance(schema: Schema): ProcessedClasses {
        const classes: ProcessedClasses = {};
        const self = this;

        for (let className of Object.keys(schema.classes)) {
            if (className in classes) {
                continue;
            }

            const cls = schema.classes[className];

            let c = cls;
            let lastClass = className;
            const chain: string[] = [className];

            while (c.inherits) {
                const prevClass = lastClass;

                lastClass = c.inherits;

                chain.unshift(lastClass);

                if (lastClass === className) {
                    throw new Error(`Circular class inheritance '${ chain.join(' -> ') }'`);
                }

                c = schema.classes[lastClass];

                if (!c) {
                    throw new Error(`Unknown parent class '${ lastClass }' in class '${ prevClass }'`);
                }
            }

            for (let i = 0; i < chain.length; i++) {
                const n = chain[i];

                if (classes[n]) {
                    continue;
                }

                if (i === 0) {
                    classes[n] = convert(n, schema.classes[n]);
                } else {
                    const n2 = chain[i - 1];
                    classes[n] = inherit(n2, classes[n2], n, schema.classes[n]);
                }
            }
        }

        for (let className of Object.keys(classes)) {
            const cls = classes[className];

            if (cls.parameters) {
                for (let param of cls.parameters) {
                    delete param.overridable;
                    delete param.overrides;
                }
            }
        }

        return classes;

        interface Overridable {
            rel?: string;
            overridable?: string;
            overrides?: string;
        }

        function convert(className: string, cls: SchemaClass): ProcessedClass {
            if (!cls.tags) {
                throw new Error(`No tags specified in '${ className }' class`);
            }

            return cls as ProcessedClass;
        }

        function inherit(ancestorName: string, ancestor: ProcessedClass, descendantName: string, descendant: SchemaClass): ProcessedClass {
            const ret: ProcessedClass = JSON.parse(JSON.stringify(ancestor));

            // We do not inherit assumptions.
            if (descendant.assumptions) {
                ret.assumptions = descendant.assumptions;
            } else {
                delete ret.assumptions;
            }

            const retTags = ret.tags || {};
            const descendantTags = descendant.tags || {};
            const ancestorTagNames: { [tag: string]: string } = {};
            let overridableRels: { [rel: string]: string } = {};

            for (let tags of Object.keys(retTags)) {
                for (let tag of self._parseTagNames(ancestorName, tags)) {
                    ancestorTagNames[tag] = tags;
                }
            }

            for (let tags of Object.keys(descendantTags)) {
                for (let tag of self._parseTagNames(ancestorName, tags)) {
                    const aTags = ancestorTagNames[tag];

                    if ((tag !== undefined) && (tags !== aTags)) {
                        throw new Error(
                            `A name of overriding tag declaration should match the overriden declaration, '${
                                tags
                            }' in class '${
                                descendantName
                            }' != '${
                                aTags
                            }' in class ${
                                ancestorName
                            }`
                        );
                    }
                }
            }

            if (ret.parameters || descendant.parameters) {
                ret.parameters = override(ret.parameters, descendant.parameters) as typeof ret.parameters;
            }

            for (let tagNames of Object.keys(descendantTags)) {
                const dTags = descendantTags[tagNames];

                if (dTags === null) {
                    if (retTags[tagNames]) {
                        delete retTags[tagNames];
                    } else {
                        throw new Error(
                            `Parent class '${
                                ancestorName
                            }' does not define ${
                                tagNames
                            } nullified in class ${
                                descendantName
                            }`
                        );
                    }
                } else {
                    if (tagNames in retTags) {
                        if (dTags.constraints) {
                            // If the constraints are provided, just replace the old ones with the new ones,
                            // don't do anything fancy so far.
                            retTags[tagNames].constraints = dTags.constraints;
                        }

                        const aParams = retTags[tagNames].parameters;

                        if (aParams && dTags.parameters) {
                            for (let rel of Object.keys(dTags.parameters)) {
                                if (aParams[rel] && !overridableRels[rel]) {
                                    throw new Error(
                                        `Class '${
                                            descendantName
                                        }' overrides non-overridable relative parameter '${
                                            rel
                                        }' in '${
                                            tagNames
                                        }'`);
                                }

                                aParams[rel] = dTags.parameters[rel];
                            }
                        } else if (!aParams && dTags.parameters) {
                            retTags[tagNames].parameters = dTags.parameters;
                        }

                        if (dTags.attributes) {
                            // If the attributes are provided, just replace the old ones with the new ones,
                            // don't do anything fancy so far.
                            retTags[tagNames].attributes = dTags.attributes;
                        }
                    } else {
                        retTags[tagNames] = dTags;
                    }
                }
            }

            return ret;

            type Overridables = Overridable[] | undefined;

            function override(a: Overridables, d: Overridables): Overridables {
                const overriden: Overridables = a ? JSON.parse(JSON.stringify(a)) : [];

                const overridables: {
                    [name: string]: {
                        index: number;
                        overridable: Overridable;
                    }
                } = {};

                if (a) {
                    for (let index = 0; index < a.length; index++) {
                        const overridable = a[index];

                        if (overridable.overridable) {
                            overridables[overridable.overridable] = { index, overridable };

                            if (overridable.rel) {
                                overridableRels[overridable.rel] = overridable.overridable;
                            }
                        }
                    }
                }

                if (d) {
                    for (let overridable of d) {
                        if (overridable.overrides) {
                            const p = overridables[overridable.overrides];

                            if (!p) {
                                throw new Error(`Overridable '${ overridable.overrides }' does not exist in class '${ ancestorName }'`);
                            }

                            overriden!!!.splice(p.index, 1, overridable);
                        } else {
                            overriden!!!.push(overridable);
                        }
                    }
                }

                return overriden;
            }
        }
    }

    generate(): string {
        const code: string[] = [];

        code.push(`/* tslint:disable */
/* eslint-disable */
/* !!! THIS FILE IS GENERATED, DO NOT EDIT !!! */
import {
    DevEnv,
    HTMLElementAttributes,
    Schema
} from 'ability-attributes';`);

        for (let className of Object.keys(this._classes)) {
            code.push(this._generateClass(className, this._classes[className]));
        }

        code.push(`if (${ this._devCondition }) {
${
    Object.keys(this._classes).map(c => `    DevEnv.addClass('${ c }', ${ c });`).join('\n')
}\n}`);

        return code.join('\n\n');
    }

    private _generateClass(className: string, cls: ProcessedClass): string {
        const assumptions: Schema.ClassAssumption[] = [];
        const classConstraints: Schema.Constraint[] = [];
        const tagConstraints: Schema.TagConstraints = {};
        const relativeParams: ResolvedRelativeParametersByTag = {};
        const params: ParameterInClass[] = [];
        const nonParamAttrsByTag: Schema.NonParameterAttributesByTag = {};
        const relParams: { [rel: string]: true } = {};
        const relParamNames: string[] = [];
        const tagsByTag: Schema.TagsByTag = {};
        let lastClass = 0;

        if (cls.assumptions) {
            for (let a of cls.assumptions) {
                let tagName: string | undefined;
                let assumption: Schema.ClassAssumption;

                if ('tag' in a) {
                    tagName = a.tag.trim();
                    tagName = tagName && tagName.substring(1, tagName.length - 1).trim();

                    assumption = 'attributes' in a ? { tag: tagName, attributes: a.attributes } : { tag: tagName };
                } else {
                    assumption = a;
                }

                assumptions.push(assumption);
            }
        }

        if (cls.constraints) {
            for (let c of cls.constraints) {
                classConstraints.push(this._resolveConstraint(className, c));
            }
        }

        if (cls.parameters) {
            for (let p of cls.parameters) {
                if ('rel' in p) {
                    relParams[p.rel] = true;
                    relParamNames.push(p.rel);
                } else {
                    params.push(this._resolveParameter(className, p));
                }
            }
        }

        for (let tagsName of Object.keys(cls.tags)) {
            const tagNames = this._parseTagNames(className, tagsName);

            if (!tagNames.length) {
                throw new Error(`No tags specified in class '${ className }'`);
            }

            for (let t of tagNames) {
                if (t in tagsByTag) {
                    throw new Error(`Duplicate tag name '<${ t }>' in class ${ className }`);
                }

                tagsByTag[t] = tagsName;
            }

            const tag = cls.tags[tagsName];
            const tagAttrs: Schema.NonParameterAttribute = {};

            if (tag.attributes) {
                for (let a of tag.attributes)  {
                    let attr: Attribute;

                    if ('ref' in a) {
                        attr = this._attributes[a.ref];

                        if (!attr) {
                            throw new Error(`Invalid attribute reference '${ a.ref }' in class '${ className }'`);
                        }
                    } else {
                        attr = a;
                    }

                    lastClass++;
                    const attrClass = lastClass + '';

                    if ('one' in attr) {
                        for (let a2 of attr.one) {
                            addTagAttribute(tagAttrs, attrClass, a2);
                        }
                    } else {
                        addTagAttribute(tagAttrs, attrClass, attr);
                    }
                }
            }

            const thisTagConstraints: Schema.Constraint[] = [];

            if (tag.constraints) {
                for (let c of tag.constraints) {
                    thisTagConstraints.push(this._resolveConstraint(className, c));
                }
            }

            relativeParams[tagsName] = {};

            if (tag.parameters) {
                const tagRelParams: ResolvedParametersInClass = relativeParams[tagsName];

                for (let rel of Object.keys(tag.parameters)) {
                    if (!(relParams[rel])) {
                        throw new Error(`Invalid relative parameter reference '${ rel }' in '${ tagsName }' in class ${ className }`);
                    }

                    tagRelParams[rel] = this._resolveParameter(className, tag.parameters[rel]);
                }

                if (Object.keys(tagRelParams).length !== relParamNames.length) {
                    for (let rel of relParamNames) {
                        if (!tagRelParams[rel]) {
                            throw new Error(`Missing relative parameter '${ rel }' in '${ tagsName }' in class ${ className }`);
                        }
                    }
                }
            } else if (relParamNames.length > 0) {
                throw new Error(`Missing relative parameters in '${ tagsName }' in class ${ className }`);
            }

            nonParamAttrsByTag[tagsName] = tagAttrs;

            if (thisTagConstraints.length > 0) {
                tagConstraints[tagsName] = thisTagConstraints;
            }
        }

        const commonParams: Schema.TagRuntimeParameters = {};
        const commonParamConstraints: Schema.TagConstraints = {};
        const commonParamOptionalConstraints: Schema.TagConstraints = {};
        const commonAttributes: Schema.AttributeToParameter = {};
        const allParamsMap: ParametersMap = {};
        const allParamsByTag: Schema.RuntimeParameters = {};
        const paramConstraintsByTag: ParamConstraintsByTag = {};
        const paramOptionalConstraintsByTag: ParamConstraintsByTag = {};
        const attrToParamByTag: Schema.AttributeToParameterByTag = {};
        const mandatoryParams: Schema.MandatoryParameters = {};
        const variantsInClass: Schema.VariantsInClass = {};

        for (let p of params) {
            const paramsMap: ParametersMap = {};

            lastClass++;
            const paramClass = lastClass + '';

            this._setParameter(className, p, commonParams, paramClass, allParamsMap, paramsMap, commonAttributes, commonParamConstraints);

            const paramNames = Object.keys(paramsMap);

            variantsInClass[paramClass] = paramNames.length;

            if (!p.optional) {
                mandatoryParams[paramClass] = paramNames;
            } else if (typeof p.optional !== 'boolean') {
                commonParamOptionalConstraints[paramNames.join(', ')] = [p.optional as Schema.ConstraintEntry];
            }
        }

        let firstTagParams: Schema.TagRuntimeParameters | undefined;
        let firstTagOnlyParams: Schema.TagRuntimeParameters | undefined;
        let firstTagsName: string | undefined;
        let firstOptionalFlags: { [paramName: string]: boolean } | undefined;

        for (let tagsName of Object.keys(relativeParams)) {
            const tagRelParams = relativeParams[tagsName];
            const tagRelParamRels = Object.keys(tagRelParams);
            const tagParamConstraints: Schema.TagConstraints = { ...commonParamConstraints };
            const tagParamOptionalConstraints: Schema.TagConstraints = { ...commonParamOptionalConstraints };
            const tagParams: Schema.TagRuntimeParameters = {};
            const tagAttributes: Schema.AttributeToParameter = { ...commonAttributes };
            const optionalFlags: { [paramName: string]: boolean } = {};

            for (let rel of tagRelParamRels) {
                const tagParamsMap: { [name: string]: true } = {};
                const p = tagRelParams[rel];

                lastClass++;
                const paramClass = lastClass + '';

                this._setParameter(
                    className,
                    p,
                    tagParams,
                    paramClass,
                    firstTagParams === undefined ? allParamsMap : {},
                    tagParamsMap,
                    tagAttributes,
                    tagParamConstraints,
                    tagsName
                );

                const paramNames = Object.keys(tagParamsMap);

                variantsInClass[paramClass] = paramNames.length;

                if (!p.optional) {
                    mandatoryParams[paramClass] = paramNames;
                } else if (typeof p.optional !== 'boolean') {
                    tagParamOptionalConstraints[paramNames.join(', ')] = [p.optional as Schema.ConstraintEntry];
                }

                for (let paramName of paramNames) {
                    optionalFlags[paramName] = !!p.optional;
                }
            }

            allParamsByTag[tagsName] = { ...commonParams, ...tagParams };
            paramConstraintsByTag[tagsName] = tagParamConstraints;
            paramOptionalConstraintsByTag[tagsName] = tagParamOptionalConstraints;
            attrToParamByTag[tagsName] = tagAttributes;

            if ((firstTagOnlyParams === undefined) || (firstTagsName === undefined) || (firstOptionalFlags === undefined)) {
                firstTagParams = allParamsByTag[tagsName];
                firstTagOnlyParams = tagParams;
                firstTagsName = tagsName;
                firstOptionalFlags = optionalFlags;
            } else {
                let aTagsName: string;
                let bTagsName: string;
                let aParams: Schema.TagRuntimeParameters;
                let bParams: Schema.TagRuntimeParameters;
                let aOptional: { [paramName: string]: boolean };
                let bOptional: { [paramName: string]: boolean };

                if (Object.keys(firstTagOnlyParams) > Object.keys(tagParams)) {
                    aTagsName = firstTagsName;
                    bTagsName = tagsName;
                    aParams = firstTagOnlyParams;
                    bParams = tagParams;
                    aOptional = firstOptionalFlags;
                    bOptional = optionalFlags;
                } else {
                    aTagsName = tagsName;
                    bTagsName = firstTagsName;
                    aParams = tagParams;
                    bParams = firstTagOnlyParams;
                    aOptional = optionalFlags;
                    bOptional = firstOptionalFlags;
                }

                for (let paramName of Object.keys(aParams)) {
                    if (!(paramName in bParams)) {
                        throw new Error(
                            `Inconsistently resolved relative parameters: parameter '${
                                paramName
                            }' is present in '${ aTagsName }' and not present in '${ bTagsName }' in class ${ className }`
                        );
                    }

                    if (aOptional[paramName] !== bOptional[paramName]) {
                        throw new Error(
                            `Parameter '${ paramName }' is ${ aOptional[paramName] ? '' : 'not '}optional in '${
                                aTagsName
                            }' and ${ bOptional[paramName] ? '' : 'not '}optional in '${ bTagsName }' in class ${ className }`
                        );
                    }
                }
            }
        }

        const code: string[] = [];

        code.push(this._generateParametersType(className, firstTagParams || {}, mandatoryParams, variantsInClass));
        code.push(this._generateClassCode(
            className,
            tagsByTag,
            allParamsByTag,
            attrToParamByTag,
            mandatoryParams,
            nonParamAttrsByTag,
            classConstraints,
            tagConstraints,
            paramConstraintsByTag,
            paramOptionalConstraintsByTag
        ));

        if (assumptions.length) {
            code.push(this._generateAssume(className, assumptions));
        }

        return code.join('\n');

        function addTagAttribute(tagAttrs: Schema.NonParameterAttribute, attrClass: string, attr: AttributeEntry) {
            if (tagAttrs[attr.name]) {
                throw new Error(`Duplicate attribute '${ attr.name }' in class '${ className }'`);
            }

            let defaultValue: string | undefined;
            let value: { [value: string]: true } | undefined;

            if (attr.value instanceof Array) {
                if (attr.value.length === 0) {
                    throw new Error(`No values for attribute '${ attr.name }' in class '${ className }'`);
                }

                defaultValue = attr.value[0];
                value = {};

                for (let v of attr.value) {
                    value[v] = true;
                }
            } else if (typeof attr.value === 'string') {
                defaultValue = attr.value;
                value = {};
                value[attr.value] = true;
            }

            tagAttrs[attr.name] = {
                class: attrClass,
                attr: { name: attr.name, default: defaultValue, value, optional: attr.optional }
            };
        }
    }

    private _setParameter(className: string, param: ParameterInClass, params: Schema.TagRuntimeParameters, paramClass: string,
        allParamsMap: ParametersMap, paramsMap: ParametersMap, attrToParam: Schema.AttributeToParameter,
        paramConstraints: Schema.TagConstraints, tagsName?: string): void {

        if ('one' in param) {
            for (let p of param.one) {
                params[p.name] = {
                    class: paramClass,
                    param: this._processParameter(className, p, allParamsMap, paramsMap, attrToParam, paramConstraints, tagsName)
                };
            }
        } else {
            const { optional, ...p } = param;

            params[p.name] = {
                class: paramClass,
                param: this._processParameter(className, p, allParamsMap, paramsMap, attrToParam, paramConstraints, tagsName)
            };
        }
    }

    private _processParameter(className: string, param: Schema.ParameterEntry, allParamsMap: ParametersMap, paramsMap: ParametersMap,
            attrToParam: Schema.AttributeToParameter, paramConstraints: Schema.TagConstraints, tagsName?: string): Schema.ParameterEntry {

        if (allParamsMap[param.name]) {
            throw new Error(`Duplicate parameter '${ param.name }' in class '${ className }'`);
        }

        if (!param.attributes.length) {
            throw new Error(`In param '${ param.name }' of class '${ className }': attributes array cannot be empty`);
        }

        let attributesInParameter: Schema.AttributeInParameter[] = [];

        let allOptional = true;

        for (let a of param.attributes) {
            if (attrToParam[a.name]) {
                throw new Error(
                    `Duplicate attribute '${ a.name }' set by parameter '${
                        param.name
                    }' ${ tagsName ? `in '${ tagsName }' ` : '' }in class '${ className }'`
                );
            }

            const { constraints, ...a2 } = a;

            attrToParam[a.name] = param.name;
            attributesInParameter.push(a2);

            if (!a2.optional) {
                allOptional = false;
            }

            if (constraints && constraints.length) {
                paramConstraints[param.name] = constraints.map(c => this._resolveConstraint(className, c));
            }
        }

        if (allOptional) {
            throw new Error(`One attribute has to be not optional in parameter '${ param.name }' in class '${ className }'`);
        }

        allParamsMap[param.name] = true;
        paramsMap[param.name] = true;

        return { name: param.name, attributes: attributesInParameter };
    }

    private _resolveConstraint(className: string, constraint: Schema.Constraint | Schema.ConstraintRef): Schema.Constraint {
        if ('ref' in constraint) {
            const ref = this._constraints[constraint.ref];

            if (!ref) {
                throw new Error(`Invalid constraint reference '${ constraint.ref }' in class '${ className }'`);
            }

            return ref;
        }

        return constraint;
    }

    private _resolveParameter(className: string, p: ParameterInClass | ParameterInClassRef): ParameterInClass {
        let param: ParameterInClass;

        if ('ref' in p) {
            const ref = this._parameters[p.ref];

            if (!ref) {
                throw new Error(`Invalid parameter reference '${ p.ref }' in class '${ className }'`);
            }

            param = { ...ref, optional: p.optional };
        } else {
            param = { ...p };
        }

        if (param.optional && (typeof param.optional !== 'boolean')) {
            param.optional = this._resolveConstraint(className, param.optional);
        }

        return param;
    }

    private _generateParametersType(className: string, params: Schema.TagRuntimeParameters, mandatoryParams: Schema.MandatoryParameters,
            variantsInClass: Schema.VariantsInClass): string {

        type ParamVariant = { signature: string, cls: string, param: string };

        const common: string[] = [];
        const variants: { [cls: string]: ParamVariant[] } = {};
        let hasVariants = false;

        for (let n of Object.keys(params)) {
            const p = params[n];

            const variantsCount = variantsInClass[p.class];
            const optional = !(p.class in mandatoryParams);

            if (variantsCount > 1) {
                if (!variants[p.class]) {
                    variants[p.class] = [];
                }

                variants[p.class].push({
                    signature: this._generateParameterSignature(className, p.param, optional),
                    cls: p.class,
                    param: p.param.name
                });

                hasVariants = true;
            } else {
                common.push(this._generateParameterSignature(className, p.param, optional));
            }
        }

        const commonProps = `    ${ common.join('\n    ') }\n`;
        const code: string[] = [];

        if (hasVariants) {
            combineVariants(Object.keys(variants).map(cls => variants[cls]), 0, []);
        } else {
            code.push(`{\n${ commonProps }}`);
        }

        return `export type ${ className }_Params = ${ code.join(' | ') }`;

        function combineVariants(arr: ParamVariant[][], offset: number, cur: string[]) {
            if (offset === arr.length) {
                code.push(`{\n    ${ cur.join('\n    ') }\n${ commonProps }}`);
            } else {
                const a = arr[offset];

                for (let i = 0; i < a.length; i++) {
                    const v: string[] = [];

                    for (let j = 0; j < a.length; j++) {
                        v.push(i === j ? a[j].signature : `${ a[j].param }?: never;`);
                    }

                    cur.push(v.join('\n    '));
                    combineVariants(arr, offset + 1, cur);
                    cur.pop();
                }
            }
        }
    }

    private _generateParameterSignature(className: string, param: Schema.ParameterEntry, optional?: boolean): string {
        interface ParamTypes { [key: string]: true; }
        let types: ParamTypes | undefined;
        let curTypes: ParamTypes;

        for (let a of param.attributes) {
            curTypes = {};

            if (a.value) {
                if (!a.value.length) {
                    throw new Error(`In param '${ param.name }' of class '${ className }': values array cannot be empty`);
                }

                for (let val of a.value) {
                    curTypes[JSON.stringify(val.parameter)] = true;
                }
            } else {
                curTypes['string'] = true;
            }

            if (types === undefined) {
                types = curTypes;
            } else if (!isTypesEqual(types, curTypes)) {
                throw new Error(
                    `In param '${
                        param.name
                    }' of class '${
                        className
                    }': parameter values have to be consistent in all attributes of this parameter`
                );
            }
        }

        return `${ param.name }${ optional ? '?' : ''}: ${ Object.keys(types!).join(' | ') };`;

        function isTypesEqual(t1: ParamTypes, t2: ParamTypes): boolean {
            const t1Keys = Object.keys(t1);

            if (t1Keys.length !== Object.keys(t2).length) {
                return false;
            }

            for (let key of t1Keys) {
                if (!(key in t2)) {
                    return false;
                }
            }

            return true;
        }
    }

    private _parseTagNames(className: string, names: string): string[] {
        return names.split(/\s*,\s*/).map(name => {
            if (!tagNameRegExp.test(name)) {
                throw new Error(`Invalid tag name '${ name }' in class '${ className }'`);
            }

            return name.substring(1, name.length - 1).trim().toLowerCase();
        });
    }

    private _generateClassCode(className: string, tagsByTag: Schema.TagsByTag, allParams: Schema.RuntimeParameters,
            attrToParamByTag: Schema.AttributeToParameterByTag, mandatoryParams: Schema.MandatoryParameters,
            nonParamAttrs: Schema.NonParameterAttributesByTag, classConstraints: Schema.Constraint[], tagConstraints: Schema.TagConstraints,
            paramConstraintsByTag: ParamConstraintsByTag, paramOptionalConstraintsByTag: ParamConstraintsByTag): string {

        const paramNames = Object.keys(allParams);

        const paramToAttrByTag: Schema.AttributeToParameterByTag = {};
        const tagNames = Object.keys(attrToParamByTag);

        for (let tagName of tagNames) {
            const attrToParam = attrToParamByTag[tagName];
            const paramToAttr: Schema.AttributeToParameter = {};

            for (let attrName of Object.keys(attrToParam)) {
                paramToAttr[attrToParam[attrName]] = attrName;
            }

            paramToAttrByTag[tagName] = paramToAttr;
        }

        return `
export class ${ className } extends Schema.AttributeSchema<${ className }_Params> {
    static className = ${ JSON.stringify(className) };
    private static _tagsByTag: Schema.TagsByTag = ${ JSON.stringify(tagsByTag) };
    private static _allParamsByTag = Schema.AttributeSchema._assignTagNames(${
        this._stringify(allParams, 4) }, ${ className }._tagsByTag);
    private static _attrToParamByTag = Schema.AttributeSchema._assignTagNames(${
        this._stringify(attrToParamByTag, 4) }, ${ className }._tagsByTag);
    private static _paramToAttrByTag = Schema.AttributeSchema._assignTagNames(${
        this._stringify(paramToAttrByTag, 4) }, ${ className }._tagsByTag);
    private static _nonParamAttrsByTag = Schema.AttributeSchema._assignTagNames(${
        this._stringify(nonParamAttrs, 4) }, ${ className }._tagsByTag);
    private static _mandatoryParams = ${ this._stringify(mandatoryParams, 4) };

    protected _className = ${ className }.className;
    protected _allParamsByTag = ${ className }._allParamsByTag;
    protected _attrToParamByTag = ${ className }._attrToParamByTag;
    protected _mandatoryParams = ${ className }._mandatoryParams;
    protected _nonParamAttrsByTag = ${ className }._nonParamAttrsByTag;

    constructor(tagName: string${ paramNames.length ? `, params: ${ className }_Params` : '' }) {
        super(tagName, ${ paramNames.length ? 'params' : '{}' });

        if (${ this._devCondition }) {
            const classConstraints: Schema.Constraint[] = ${ this._stringify(classConstraints, 4).split('\n').join('\n        ') };

            const tagConstraints: Schema.TagConstraints = Schema.AttributeSchema._assignTagNames(${
                this._stringify(tagConstraints, 4).split('\n').join('\n        ')
            }, ${ className }._tagsByTag)[tagName];

            const paramConstraints: Schema.TagConstraints = Schema.AttributeSchema._assignTagNames(${
                this._stringify(paramConstraintsByTag, 4).split('\n').join('\n        ')
            }, ${ className }._tagsByTag)[tagName];

            const paramOptionalConstraints: Schema.TagConstraints = Schema.AttributeSchema._assignTagNames(${
                this._stringify(paramOptionalConstraintsByTag, 4).split('\n').join('\n        ')
            }, ${ className }._tagsByTag)[tagName];

            this.getConstraints = () => {
                const constraints: Schema.ParamConstraint[] = classConstraints.slice(0);

                if (tagConstraints) {
                    Array.prototype.push.apply(constraints, tagConstraints);
                }

                for (let paramName of Object.keys(paramConstraints)) {
                    if (paramName in this._params) {
                        Array.prototype.push.apply(constraints, paramConstraints[paramName].map(c => {
                            return { ...c, name: paramName, value: this._params[paramName as keyof ${ className }_Params] };
                        }));
                    }
                }

                for (let paramName of Object.keys(paramOptionalConstraints)) {
                    const paramNames = paramName.split(', ');
                    const paramNamesText = paramNames.map(p => \`'\${ p }'\`).join(' or ');

                    if (!(paramNames.some(n => n in this._params))) {
                        Array.prototype.push.apply(
                            constraints,
                            paramOptionalConstraints[paramName].map(c => { return { ...c, param: paramNamesText }; })
                        );
                    }
                }

                return constraints;
            };
        }
    }

    static fromAttributes(tagName: string, attributes: HTMLElementAttributes): ${ className } {
        const pd = Schema.AttributeSchema._getParamsFromAttributes<${ className }_Params>(
            tagName,
            attributes,
            ${ className }.className,
            ${ className }._allParamsByTag,
            ${ className }._attrToParamByTag,
            ${ className }._paramToAttrByTag,
            ${ className }._mandatoryParams,
            ${ className }._nonParamAttrsByTag
        );

        const instance = new ${ className }(tagName${ paramNames.length ? ', pd.params' : '' });

        instance._setDefaults(pd.defaults);

        return instance;
    }
}
`;
    }

    private _generateAssume(className: string, assumptions: Schema.ClassAssumption[]): string {
        return `if (${ this._devCondition }) {
    ${ className }.assume = function(tagName: string, attributes: HTMLElementAttributes): Schema.AssumptionSpecificity | undefined {
        const assumptions: Schema.ClassAssumption[] = ${ this._stringify(assumptions, 8) };

        for (let a of assumptions) {
            let tagMatch = false;
            let attributeMatch = 0;

            if ('tag' in a) {
                if (a.tag !== tagName) {
                    continue;
                }

                tagMatch = true;
            }

            if ('attributes' in a) {
                for (let attr of a.attributes) {
                    if (!(attr.name in attributes) || (attributes[attr.name] !== attr.value)) {
                        attributeMatch = 0;
                        break;
                    }

                    attributeMatch++;
                }

                if (attributeMatch === 0) {
                    continue;
                }
            } else if (!tagMatch) {
                continue;
            }

            return { tag: tagMatch, attributes: attributeMatch };
        }

        return undefined;
    };
}`;
    }

    private _stringify(what: any, indent: number): string {
        return JSON.stringify(what, undefined, 4).split('\n').join('\n' + (new Array(indent + 1)).join(' '));
    }
}
