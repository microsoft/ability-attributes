/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AssumptionSpecificity, ATTRIBUTE_NAME_CLASS, AttributeSchemaClass } from './DevEnvTypes';
import { AccessibilityAttributes, HTMLElementAttributes } from './HTML';

export { AssumptionSpecificity, AttributeSchemaClass };

export interface ParameterValue {
    parameter: string | number | boolean | null;
    attribute: string | boolean;
}

export interface AttributeInParameter {
    name: string;
    value?: ParameterValue[];
    constraints?: (Constraint | ConstraintRef)[];
    optional?: boolean;
}

export interface ParameterEntry {
    name: string;
    attributes: AttributeInParameter[];
}

export interface TagRuntimeParameters {
    [name: string]: {
        class: string,
        param: ParameterEntry
    };
}

export interface RuntimeParameters {
    [tagName: string]: TagRuntimeParameters;
}

export interface AttributeToParameter {
    [name: string]: string;
}

export interface AttributeToParameterByTag {
    [tagName: string]: AttributeToParameter;
}

export interface MandatoryParameters {
    [paramClass: string]: string[];
}

export interface VariantsInClass {
    [paramClass: string]: number;
}

export interface AttributeEntry {
    name: string;
    default?: string;
    value?: { [value: string]: boolean };
    optional?: boolean;
}

export interface NonParameterAttribute {
    [attrName: string]: {
        class: string,
        attr: AttributeEntry
    };
}

export interface NonParameterAttributesByTag {
    [tagName: string]: NonParameterAttribute;
}

export interface AttributeDefaults {
    [attrName: string]: string;
}

export interface ConstraintRef {
    ref: string;
}

export type ConstraintEntry = {
    xpath: string;
    description: string;
} | {
    js: string;
    description: string;
};

export type Constraint = ConstraintEntry | { one: ConstraintEntry[]; };

export interface TagConstraints {
    [tagName: string]: Constraint[];
}

export type ParamConstraint = (ConstraintEntry | { one: ConstraintEntry[] }) & {
    param?: string;
    name?: string;
    value?: string | number | boolean | null;
};

export interface AttributeInAssumption {
    name: string;
    value: string;
}

export type ClassAssumption = {
    tag: string;
    attributes: AttributeInAssumption[];
} | {
    tag: string;
} | {
    attributes: AttributeInAssumption[];
};

export interface TagsByTag {
    [tagName: string]: string;
}

export abstract class AttributeSchema<P extends { [name: string]: any }> {
    protected abstract _className: string;
    protected abstract _allParamsByTag: RuntimeParameters;
    protected abstract _attrToParamByTag: AttributeToParameterByTag;
    protected abstract _mandatoryParams: MandatoryParameters;
    protected abstract _nonParamAttrsByTag: NonParameterAttributesByTag;
    protected _tagName: string;
    protected _params: P;
    protected _paramNames: string[];
    protected _defaults?: AttributeDefaults;

    getConstraints?: () => ParamConstraint[];

    constructor(tagName: string, params: P) {
        this._tagName = tagName.toLowerCase();
        this._params = params;
        this._paramNames = Object.keys(params).filter(name => params[name] !== undefined);
    }

    static assume?: (tagName: string, attributes: HTMLElementAttributes) => AssumptionSpecificity | undefined;

    private static _error(message: string, className: string): void {
        throw new Error(`${ message } in class '${ className }'`);
    }

    private _error(message: string): void {
        AttributeSchema._error(message, this._className);
    }

    protected _setDefaults(defaults: AttributeDefaults): void {
        this._defaults = defaults;
    }

    protected static _assignTagNames(byTag: { [tagsName: string]: any }, tagsByTag: TagsByTag): { [tagName: string]: any } {
        const tagNames = Object.keys(tagsByTag);
        const ret: { [tagName: string]: any } = {};

        for (let tagName of tagNames) {
            ret[tagName] = byTag[tagsByTag[tagName]];
        }

        return ret;
    }

    getAttributes(): HTMLElementAttributes {
        const params = this._params;
        const allParams = this._allParamsByTag[this._tagName];
        const classes: { [cls: string]: string } = {};
        const attrs: HTMLElementAttributes = {};
        const attrToParam = this._attrToParamByTag[this._tagName];
        const nonParamAttrs = this._nonParamAttrsByTag[this._tagName];

        if (__DEV__) {
            attrs[ATTRIBUTE_NAME_CLASS] = this._className;
        }

        if (!allParams || !nonParamAttrs) {
            if (__DEV__) {
                this._error(`Illegal tag '${ this._tagName }'`);
            }

            return attrs;
        }

        for (let paramName of this._paramNames) {
            const paramDef = allParams[paramName];

            if (!paramDef) {
                if (__DEV__) {
                    this._error(`Unknown param '${ paramName }'`);
                }

                continue;
            }

            if (paramDef.class in classes) {
                if (__DEV__) {
                    this._error(`Only one of '${ paramName }' or '${ classes[paramDef.class] }' parameters can be present`);
                }

                continue;
            }

            classes[paramDef.class] = paramName;

            for (let a of paramDef.param.attributes) {
                if (a.optional) {
                    continue;
                }

                const values = a.value;

                if (values) {
                    let illegalValue = true;

                    for (let value of values) {
                        if (value.parameter === params[paramName]) {
                            attrs[a.name] = (typeof value.attribute === 'boolean') ? '' : value.attribute;
                            illegalValue = false;
                            break;
                        }
                    }

                    if (__DEV__ && illegalValue) {
                        this._error(`Illegal parameter value '${ params[paramName] }' of parameter '${ paramName }'`);
                    }
                } else {
                    attrs[a.name] = params[paramName];
                }
            }
        }

        if (__DEV__) {
            for (let c of Object.keys(this._mandatoryParams)) {
                if (!(c in classes)) {
                    this._error(`Missing mandatory parameter ${ this._mandatoryParams[c].map(p => `'${ p }'`).join(' or ') }`);
                }
            }
        }

        for (let a of Object.keys(nonParamAttrs)) {
            const attr = nonParamAttrs[a].attr;

            if (!(a in attrs)) {
                if (this._defaults && (a in this._defaults)) {
                    attrs[a] = this._defaults[a];
                } else if (attr.default !== undefined) {
                    if (!attr.optional) {
                        attrs[a] = attr.default;
                    }
                } else if (__DEV__) {
                    this._error(`Schema error, attribute '${ a }' does not have a value`);
                }
            } else if (__DEV__ && (!attr.value || !(attrs[a] in attr.value))) {
                this._error(`Schema error, parameter '${ attrToParam[a] }' sets illegal value of attribute '${ a }'`);
            }
        }

        return attrs;
    }

    protected static _getParamsFromAttributes<P extends { [name: string]: any }>(
            tagName: string, attributes: HTMLElementAttributes, className: string, allParamsByTag: RuntimeParameters,
            attrToParamByTag: AttributeToParameterByTag, paramToAttrByTag: AttributeToParameterByTag, mandatoryParams: MandatoryParameters,
            nonParamAttrs: NonParameterAttributesByTag): { params: P, defaults: AttributeDefaults } {

        const allParams = allParamsByTag[tagName];
        const attrToParam = attrToParamByTag[tagName];
        const paramToAttr = paramToAttrByTag[tagName];
        const nonParamAttrsForTag = nonParamAttrs[tagName];

        if (__DEV__ && !nonParamAttrsForTag) {
            AttributeSchema._error(`Illegal tag '${ tagName }'`, className);
        }

        const params: { [name: string]: string | number | boolean | null } = {};
        const classes: { [cls: string]: string } = {};
        const attributesUsed: { [name: string]: true } = {};
        const defaults: AttributeDefaults = {};
        const attrNames = Object.keys(attributes);

        for (let attrName of attrNames) {
            if (!attributesUsed[attrName] && (attrName in attrToParam)) {
                const paramName = attrToParam[attrName];
                const param = allParams[paramName];

                if (__DEV__ && (param.class in classes)) {
                    AttributeSchema._error(
                        `Only one of '${ attrName }' and '${ classes[param.class] }' attributes can be present`,
                        className
                    );
                }

                classes[param.class] = attrName;
                let paramVal: ParameterValue['parameter'] | undefined;

                for (let a of param.param.attributes) {
                    if (a.value) {
                        let illegalValue = true;

                        for (let value of a.value) {
                            const expected = value.attribute;
                            const attrVal = attributes[a.name];

                            const valueMatched = (!a.optional && (expected === false) && (attrVal === undefined)) ||
                                ((expected === true) && ((attrVal === '') || (attrVal === attrName))) ||
                                (expected === attrVal);

                            if (valueMatched || (paramVal === value.parameter)) {
                                if (__DEV__ && (paramVal !== undefined) && (paramVal !== value.parameter)) {
                                    AttributeSchema._error(
                                        `Inconsistent value of parameter '${
                                            param.param.name
                                        }': '${ paramVal }' != '${ value.parameter }'`,
                                        className
                                    );
                                }

                                if (valueMatched || ((attrVal === undefined) && a.optional)) {
                                    illegalValue = false;
                                }

                                if (paramVal === undefined) {
                                    paramVal = value.parameter;
                                    break;
                                }
                            }
                        }

                        if (__DEV__ && illegalValue) {
                            AttributeSchema._error(
                                `Illegal attribute value '${ attributes[a.name] }' of attribute '${ a.name }'`,
                                className
                            );
                        }
                    } else {
                        paramVal = attributes[attrName];
                    }

                    attributesUsed[a.name] = true;
                }

                if (paramVal !== undefined) {
                    params[paramName] = paramVal;
                }
            }
        }

        for (let c of Object.keys(mandatoryParams)) {
            if (__DEV__ && !(c in classes)) {
                AttributeSchema._error(`Missing mandatory attribute ${
                    mandatoryParams[c].map(p => `'${ paramToAttr[p] }'`).join(' or ')
                }`, className);
            }
        }

        for (let a of Object.keys(nonParamAttrsForTag)) {
            if (a in attributesUsed) {
                continue;
            }

            const attr = nonParamAttrsForTag[a].attr;
            const v = attributes[a];

            if (__DEV__ && !(a in attributes) && !((v === undefined) && attr.optional)) {
                AttributeSchema._error(`Missing mandatory attribute '${ a }'`, className);
            }

            attributesUsed[a] = true;

            if ((v === undefined) && attr.optional) {
                continue;
            }

            if (attr.value) {
                if (v in attr.value) {
                    defaults[a] = v;
                } else if (__DEV__) {
                    AttributeSchema._error(`Illegal attribute value '${ v }' of attribute '${ a }'`, className);
                }
            } else {
                defaults[a] = v;
            }
        }

        if (__DEV__) {
            for (let attrName of attrNames) {
                if (!(attrName in attributesUsed) && (attrName in AccessibilityAttributes)) {
                    AttributeSchema._error(`Illegal attribute '${ attrName }' for tag '${ tagName }'`, className);
                }
            }
        }

        return { params: params as P, defaults };
    }
}
