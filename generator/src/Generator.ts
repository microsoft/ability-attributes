/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import Ajv = require('ajv');
import * as fs from 'fs';
import * as path from 'path';

import {
    AttributeToParameter,
    Constraint,
    ConstraintEntry,
    ConstraintRef,
    MandatoryParameters,
    NonParameterAttribute,
    NonParameterAttributes,
    ParameterEntry,
    Parameters as ResolvedParams,
    TagConstraints,
    VariantsInClass
} from 'ability-attributes';

interface ParameterInClassEntry extends ParameterEntry {
    optional?: boolean | Constraint | ConstraintRef;
}

type Parameter = ParameterEntry | { one: ParameterEntry[]; };

interface ParameterRef {
    ref: string;
    optional?: boolean | Constraint | ConstraintRef;
}

type ParameterInClass =
    ParameterInClassEntry |
    {
        one: ParameterEntry[];
        optional?: boolean | Constraint | ConstraintRef;
    };

interface Parameters {
    [key: string]: Parameter;
}

interface AttributeEntry {
    name: string;
    value: string | string[];
}

type Attribute = AttributeEntry | { one: AttributeEntry[]; };

interface Attributes {
    [key: string]: Attribute;
}

interface AttributeRef {
    ref: string;
}

interface Constraints {
    [key: string]: Constraint;
}

interface Tag {
    constraints?: (Constraint | ConstraintRef)[];
    attributes?: (Attribute | AttributeRef)[];
}

interface AttributeInAssumption {
    name: string;
    value: string;
}

type ClassAssumption = {
    tag: string;
    attributes: AttributeInAssumption[];
} | {
    tag: string;
} | {
    attributes: AttributeInAssumption[];
};

interface Class {
    assumptions?: ClassAssumption[];
    constraints?: (Constraint | ConstraintRef)[];
    parameters?: (ParameterInClass | ParameterRef)[];
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
/* !!! THIS FILE IS GENERATED, DO NOT EDIT !!! */
import {
    AssumptionSpecificity,
    AttributeSchema,
    Constraint,
    DevEnv,
    HTMLElementAttributes,
    ParamConstraint,
    TagConstraints
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
        const assumptions: ClassAssumption[] = [];
        const classConstraints: Constraint[] = [];
        const tagConstraints: TagConstraints = {};
        const paramOptionalConstraints: TagConstraints = {};
        const paramConstraints: TagConstraints = {};
        const params: ParameterInClass[] = [];
        const nonParamAttrs: NonParameterAttributes = {};
        let lastClass = 0;

        if (cls.assumptions) {
            for (let a of cls.assumptions) {
                let tagName: string | undefined;
                let assumption: ClassAssumption;

                if ('tag' in a) {
                    tagName = a.tag.trim();
                    tagName = tagName.substring(1, tagName.length - 1).trim();

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

                params.push(param);
            }
        }

        for (let tag of Object.keys(cls.tags)) {
            const tagNames = this._parseTagNames(className, tag);

            if (!tagNames.length) {
                throw new Error(`No tags specified in class '${ className }'`);
            }

            const tmp = cls.tags[tag];
            const tagAttrs: NonParameterAttribute = {};

            if (tmp.attributes) {
                for (let a of tmp.attributes)  {
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

            const thisTagConstraints: Constraint[] = [];

            if (tmp.constraints) {
                for (let c of tmp.constraints) {
                    thisTagConstraints.push(this._resolveConstraint(className, c));
                }
            }

            for (let tagName of tagNames) {
                if (tagName in nonParamAttrs) {
                    throw new Error(`Duplicate tag name '${ tagName }' in class ${ className }`);
                }

                nonParamAttrs[tagName] = tagAttrs;

                if (thisTagConstraints.length > 0) {
                    tagConstraints[tagName] = thisTagConstraints;
                }
            }
        }

        const allParams: ResolvedParams = {};
        const attrToParam: AttributeToParameter = {};
        const mandatoryParams: MandatoryParameters = {};
        const variantsInClass: VariantsInClass = {};

        for (let p of params) {
            let paramNames: string[] = [];

            lastClass++;
            const paramClass = lastClass + '';

            if ('one' in p) {
                for (let p2 of p.one) {
                    if (allParams[p2.name]) {
                        throw new Error(`Duplicate parameter '${ p2.name }' in class '${ className }'`);
                    }

                    if (attrToParam[p2.attribute]) {
                        throw new Error(`Duplicate attribute '${ p2.attribute }' in class '${ className }'`);
                    }

                    const { constraints, ...p3 } = p2;

                    allParams[p3.name] = { class: paramClass, param: p3 };
                    attrToParam[p3.attribute] = p3.name;

                    paramNames.push(p3.name);

                    if (constraints && constraints.length) {
                        paramConstraints[p3.name] = constraints.map(c => this._resolveConstraint(className, c));
                    }
                }
            } else {
                if (allParams[p.name]) {
                    throw new Error(`Duplicate parameter '${ p.name }' in class '${ className }'`);
                }

                if (attrToParam[p.attribute]) {
                    throw new Error(`Duplicate attribute '${ p.attribute }' in class '${ className }'`);
                }

                const { optional, constraints, ...p2 } = p;

                allParams[p2.name] = { class: paramClass, param: p2 };
                attrToParam[p2.attribute] = p.name;

                paramNames.push(p2.name);

                if (constraints && constraints.length) {
                    paramConstraints[p2.name] = constraints.map(c => this._resolveConstraint(className, c));
                }
            }

            variantsInClass[paramClass] = paramNames.length;

            if (!p.optional) {
                mandatoryParams[paramClass] = paramNames;
            } else if (typeof p.optional !== 'boolean') {
                paramOptionalConstraints[paramNames.join(', ')] = [p.optional as ConstraintEntry];
            }
        }

        const code: string[] = [];

        code.push(this._generateParametersType(className, allParams, mandatoryParams, variantsInClass));
        code.push(this._generateClassCode(
            className,
            allParams,
            attrToParam,
            mandatoryParams,
            nonParamAttrs,
            classConstraints,
            tagConstraints,
            paramConstraints,
            paramOptionalConstraints
        ));

        if (assumptions.length) {
            code.push(this._generateAssume(className, assumptions));
        }

        return code.join('\n');

        function addTagAttribute(tagAttrs: NonParameterAttribute, attrClass: string, attr: AttributeEntry) {
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
                attr: { name: attr.name, default: defaultValue, value }
            };
        }
    }

    private _resolveConstraint(className: string, constraint: Constraint | ConstraintRef): Constraint {
        if ('ref' in constraint) {
            const ref = this._constraints[constraint.ref];

            if (!ref) {
                throw new Error(`Invalid constraint reference '${ constraint.ref }' in class '${ className }'`);
            }

            return ref;
        }

        return constraint;
    }

    private _generateParametersType(className: string, params: ResolvedParams, mandatoryParams: MandatoryParameters,
            variantsInClass: VariantsInClass): string {

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

    private _generateParameterSignature(className: string, param: ParameterEntry, optional?: boolean): string {
        const types: { [key: string]: true } = {};

        if (param.value) {
            if (!param.value.length) {
                throw new Error(`In param '${ param.name }' of class '${ className }': values array cannot be empty`);
            }

            for (let val of param.value) {
                types[JSON.stringify(val.parameter)] = true;
            }
        } else {
            types['string'] = true;
        }

        return `${ param.name }${ optional ? '?' : ''}: ${ Object.keys(types).join(' | ') };`;
    }

    private _parseTagNames(className: string, names: string): string[] {
        return names.split(/\s*,\s*/).map(name => {
            if (!tagNameRegExp.test(name)) {
                throw new Error(`Invalid tag name '${ name }' in class '${ className }'`);
            }

            return name.substring(1, name.length - 1).trim().toLowerCase();
        });
    }

    private _generateClassCode(className: string, allParams: ResolvedParams, attrToParam: AttributeToParameter,
            mandatoryParams: MandatoryParameters, nonParamAttrs: NonParameterAttributes,
            classConstraints: Constraint[], tagConstraints: TagConstraints, paramConstraints: TagConstraints,
            paramOptionalConstraints: TagConstraints): string {

        const paramNames = Object.keys(allParams);

        const paramToAttr: AttributeToParameter = {};

        for (let attrName of Object.keys(attrToParam)) {
            paramToAttr[attrToParam[attrName]] = attrName;
        }

        return `
export class ${ className } extends AttributeSchema<${ className }_Params> {
    static className = ${ JSON.stringify(className) };
    private static _allParams = ${ this._stringify(allParams, 4) };
    private static _attrToParam = ${ this._stringify(attrToParam, 4) };
    private static _paramToAttr = ${ this._stringify(paramToAttr, 4) };
    private static _mandatoryParams = ${ this._stringify(mandatoryParams, 4) };
    private static _nonParamAttrs = ${ this._stringify(nonParamAttrs, 4) };

    protected _className = ${ className }.className;
    protected _allParams = ${ className }._allParams;
    protected _attrToParam = ${ className }._attrToParam;
    protected _mandatoryParams = ${ className }._mandatoryParams;
    protected _nonParamAttrs = ${ className }._nonParamAttrs;

    constructor(tagName: string${ paramNames.length ? `, params: ${ className }_Params` : '' }) {
        super(tagName, ${ paramNames.length ? 'params' : '{}' });

        if (${ this._devCondition }) {
            const classConstraints: Constraint[] = ${ this._stringify(classConstraints, 4).split('\n').join('\n        ') };

            const tagConstraints: TagConstraints = ${ this._stringify(tagConstraints, 4).split('\n').join('\n        ') };

            const paramConstraints: TagConstraints = ${ this._stringify(paramConstraints, 4).split('\n').join('\n        ') };

            const paramOptionalConstraints: TagConstraints = ${
                this._stringify(paramOptionalConstraints, 4).split('\n').join('\n        ') };

            this.getConstraints = () => {
                const constraints: ParamConstraint[] = classConstraints.slice(0);

                const t = tagConstraints[tagName];

                if (t) {
                    Array.prototype.push.apply(constraints, t);
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
        const pd = AttributeSchema._getParamsFromAttributes<${ className }_Params>(
            tagName,
            attributes,
            ${ className }.className,
            ${ className }._allParams,
            ${ className }._attrToParam,
            ${ className }._paramToAttr,
            ${ className }._mandatoryParams,
            ${ className }._nonParamAttrs
        );

        const instance = new ${ className }(tagName${ paramNames.length ? ', pd.params' : '' });

        instance._setDefaults(pd.defaults);

        return instance;
    }
}
`;
    }

    private _generateAssume(className: string, assumptions: ClassAssumption[]): string {
        return `if (${ this._devCondition }) {
    ${ className }.assume = function(tagName: string, attributes: HTMLElementAttributes): AssumptionSpecificity | undefined {
        const assumptions = ${ this._stringify(assumptions, 8) };

        for (let a of assumptions) {
            let tagMatch = false;
            let attributeMatch = 0;

            if (a.tag) {
                if (a.tag !== tagName) {
                    continue;
                }

                tagMatch = true;
            }

            if (a.attributes) {
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
