/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

'use strict';

const path = require('path');
const fs = require('fs');

module.exports = function (babel) {
    var t = babel.types;
    var SEEN_SYMBOL = Symbol();

    var CSS_TEXT = t.stringLiteral(fs.readFileSync(path.resolve(__filename, '..', '..', 'src/ErrorReporter.css')).toString());

    return {
        visitor: {
            CallExpression: {
                exit: function (path) {
                    var node = path.node;

                    if (node[SEEN_SYMBOL]) {
                        return;
                    }

                    if (path.get('callee').isIdentifier({ name: 'getErrorReporterCSS' })) {
                        node[SEEN_SYMBOL] = true;
                        path.replaceWith(CSS_TEXT);
                    }
                }
            }
        }
    };
};
