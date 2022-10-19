/**
 * @fileoverview Rule to avoid of using ajax events
 * @author Julia Ziębińska
 */

"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = require('./utils/ast-utils');
const ajaxTable = ['ajax', 'get', 'getJSON', 'getScript', 'post']


//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

/** @type {import('../shared/types').Rule} */
module.exports = {
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Disallows ajax utilities: ajax, get, getJSON, getScript, post. Prefer Window.fetch.',
            category: "Code improvements",
            recommended: false,
            url: "https://eslint.org/docs/rules/no-ajax-events"
        },
        messages: {
            suggestion: "You can replace most of the jQuery methods, for more go to https://youmightnotneedjquery.com/"
        },
        schema: []
    },
    create: function (context) {
        return {
            "Program:exit": function (node) {
                const scope = context.getScope();
                const line = scope.block.tokens.map((token) => token.value).join('')

                const ajaxRegex = /[$][.](ajax|get|getJSON|getScript|post)[(][)]/gm

                if (line.match(ajaxRegex)) {
                    context.report({
                        node: node,
                        messageId: 'suggestion',
                    });
                }
            }
        };
    }
}