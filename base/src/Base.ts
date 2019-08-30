/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AssumptionSpecificity } from './DevEnvTypes';
import { AccessibilityAttributes, HTMLElementAttributes } from './HTML';

export interface ParameterValue {
    parameter: string | number | boolean | null;
    attribute: string;
}

export interface ParameterEntry {
    name: string;
    attribute: string;
    value?: ParameterValue[];
    constraints?: (Constraint | ConstraintRef)[];
}

export interface Parameters {
    [name: string]: {
        class: string,
        param: ParameterEntry
    };
}

export interface AttributeToParameter {
    [name: string]: string;
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
}

export interface NonParameterAttribute {
    [attrName: string]: {
        class: string,
        attr: AttributeEntry
    };
}

export interface NonParameterAttributes {
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

export abstract class AttributeSchema<P extends { [name: string]: any }> {
    protected abstract _className: string;
    protected abstract _allParams: Parameters;
    protected abstract _attrToParam: AttributeToParameter;
    protected abstract _mandatoryParams: MandatoryParameters;
    protected abstract _nonParamAttrs: NonParameterAttributes;
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

    getAttributes(): HTMLElementAttributes {
        const params = this._params;
        const allParams = this._allParams;
        const classes: { [cls: string]: string } = {};
        const attrs: HTMLElementAttributes = {};
        const nonParamAttrs = this._nonParamAttrs[this._tagName];

        if (!nonParamAttrs) {
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

            const values = paramDef.param.value;

            if (values) {
                let illegalValue = true;

                for (let value of values) {
                    if (value.parameter === params[paramName]) {
                        attrs[paramDef.param.attribute] = value.attribute;
                        illegalValue = false;
                        break;
                    }
                }

                if (__DEV__ && illegalValue) {
                    this._error(`Illegal parameter value '${ params[paramName] }' of parameter '${ paramName }'`);
                }
            } else {
                attrs[paramDef.param.attribute] = params[paramName];
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
                const v = this._defaults && (a in this._defaults) ? this._defaults[a] : attr.default;

                if (v) {
                    attrs[a] = v;
                } else if (__DEV__) {
                    this._error(`Schema error, attribute '${ a }' does not have a value`);
                }
            } else if (__DEV__ && (!attr.value || !(attrs[a] in attr.value))) {
                this._error(`Schema error, parameter '${ this._attrToParam[a] }' sets illegal value of attribute '${ a }'`);
            }
        }

        return attrs;
    }

    protected static _getParamsFromAttributes<P extends { [name: string]: any }>(
            tagName: string, attributes: HTMLElementAttributes, className: string, allParams: Parameters,
            attrToParam: AttributeToParameter, paramToAttr: AttributeToParameter, mandatoryParams: MandatoryParameters,
            nonParamAttrs: NonParameterAttributes): { params: P, defaults: AttributeDefaults } {

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
            if (attrName in attrToParam) {
                const paramName = attrToParam[attrName];
                const param = allParams[paramName];

                if (__DEV__ && (param.class in classes)) {
                    AttributeSchema._error(
                        `Only one of '${ attrName }' or '${ classes[param.class] }' attributes can be present`,
                        className
                    );
                }

                classes[param.class] = attrName;

                if (param.param.value) {
                    let illegalValue = true;

                    for (let value of param.param.value) {
                        if (value.attribute === attributes[attrName]) {
                            params[paramName] = value.parameter;
                            illegalValue = false;
                            break;
                        }
                    }

                    if (__DEV__ && illegalValue) {
                        AttributeSchema._error(
                            `Illegal attribute value '${ attributes[attrName] }' of attribute '${ attrName }'`,
                            className
                        );
                    }
                } else {
                    params[paramName] = attributes[attrName];
                }

                attributesUsed[attrName] = true;
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

            if (__DEV__ && !(a in attributes)) {
                AttributeSchema._error(`Missing mandatory attribute '${ a }'`, className);
            }

            attributesUsed[a] = true;

            const attr = nonParamAttrsForTag[a].attr;
            const v = attributes[a];

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
