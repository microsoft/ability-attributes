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
}

type Parameter = Schema.ParameterEntry | { one: Schema.ParameterEntry[]; };

interface ParameterRel {
    rel: string;
}

interface ParameterInClassRef {
    ref: string;
    optional?: boolean | Schema.Constraint | Schema.ConstraintRef;
}

type ParameterInClass =
    ParameterInClassEntry |
    {
        one: Schema.ParameterEntry[];
        optional?: boolean | Schema.Constraint | Schema.ConstraintRef;
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

interface Class {
    assumptions?: Schema.ClassAssumption[];
    constraints?: (Schema.Constraint | Schema.ConstraintRef)[];
    parameters?: (ParameterInClass | ParameterInClassRef | ParameterRel)[];
    tags: { [tag: string]: Tag };
}

interface Classes {
    [name: string]: Class;
}

interface Schema {
    version: string;
    namespace?: string;
    constraints?: Constraints;
    parameters?: Parameters;
    attributes?: Attributes;
    classes: Classes;
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
    private _schema: Schema;
    private _constraints: Constraints;
    private _parameters: Parameters;
    private _attributes: Attributes;
    private _devCondition: string;

    constructor(schema: string, devCondition?: string) {
        this._schemaFilename = schema;
        this._schema = JSON.parse(fs.readFileSync(schema).toString()) as Schema;
        this._validate();
        this._constraints = this._schema.constraints || {};
        this._parameters = this._schema.parameters || {};
        this._attributes = this._schema.attributes || {};
        this._devCondition = devCondition || `process.env.NODE_ENV !== 'production'`;
    }

    private _validate(): void {
        if (!validateSchema(this._schema)) {
            const errors: { [message: string]: boolean } = {};

            throw new Error(`${ this._schemaFilename }:\n\n${ validateSchema.errors && validateSchema.errors.length
                ? validateSchema.errors.map(formatError).filter(e => { const r = e in errors; errors[e] = true; return !r; }).join('\n')
                : 'Schema validation error' }`);
        }
    }

    generate(): string {
        const code: string[] = [];
        const classes: { [name: string]: true } = {};

        code.push(`/* tslint:disable */
/* eslint-disable */
/* !!! THIS FILE IS GENERATED, DO NOT EDIT !!! */
import {
    DevEnv,
    HTMLElementAttributes,
    Schema
} from 'ability-attributes';`);

        for (let className of Object.keys(this._schema.classes)) {
            if (className in classes) {
                throw new Error(`Duplicate class '${ className }'`);
            }

            classes[className] = true;

            code.push(this._generateClass(className, this._schema.classes[className]));
        }

        code.push(`if (${ this._devCondition }) {
${
    Object.keys(this._schema.classes).map(c => `    DevEnv.addClass('${ c }', ${ c });`).join('\n')
}\n}`);

        return code.join('\n\n');
    }

    private _generateClass(className: string, cls: Class): string {
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
