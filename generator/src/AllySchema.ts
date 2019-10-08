/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as commander from 'commander';
import * as fs from 'fs';
import * as path from 'path';

import { CodeGenerator } from './index';

const version: string = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json')).toString()).version;

commander
    .version(version, '-v, --version')
    .arguments('<file>')
    .action(function (fileName: string) {
        let code: string;

        try {
            code = new CodeGenerator(fileName, commander.condition).generate();
        } catch (e) {
            console.error(e.message);
            process.exit(1);
            return;
        }

        if (commander.output) {
            fs.writeFileSync(commander.output, code);
        } else {
            console.log(code);
        }
    })
    .option('-c, --condition <code>', 'development environment condition')
    .option('-o, --output <file>', 'output file');

commander.parse(process.argv);
