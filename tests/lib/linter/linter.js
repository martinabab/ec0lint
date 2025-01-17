/**
 * @fileoverview Tests for ec0lint object.
 * @author Nicholas C. Zakas
 */

"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const assert = require("chai").assert,
    sinon = require("sinon"),
    espree = require("espree"),
    esprima = require("esprima"),
    testParsers = require("../../fixtures/parsers/linter-test-parsers");

const { Linter } = require("../../../lib/linter");
const { FlatConfigArray } = require("../../../lib/config/flat-config-array");

//------------------------------------------------------------------------------
// Constants
//------------------------------------------------------------------------------

const TEST_CODE = "var answer = 6 * 7;",
    BROKEN_TEST_CODE = "var;";

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Get variables in the current scope
 * @param {Object} scope current scope
 * @param {string} name name of the variable to look for
 * @returns {ASTNode|null} The variable object
 * @private
 */
function getVariable(scope, name) {
    return scope.variables.find(v => v.name === name) || null;
}

/**
 * `ec0lint-env` comments are processed by doing a full source text match before parsing.
 * As a result, if this source file contains `ec0lint- env` followed by an environment in a string,
 * it will actually enable the given envs for this source file. This variable is used to avoid having a string
 * like that appear in the code.
 */
const ESLINT_ENV = "ec0lint-env";

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("Linter", () => {
    const filename = "filename.js";

    /** @type {InstanceType<import("../../../lib/linter/linter.js").Linter>} */
    let linter;

    beforeEach(() => {
        linter = new Linter();
    });

    afterEach(() => {
        sinon.verifyAndRestore();
    });

    describe("Static Members", () => {
        describe("version", () => {
            it("should return same version as instance property", () => {
                assert.strictEqual(Linter.version, linter.version);
            });
        });
    });

    describe("when using events", () => {
        const code = TEST_CODE;

        it("an error should be thrown when an error occurs inside of an event handler", () => {
            const config = { rules: { checker: "error" } };

            linter.defineRule("checker", () => ({
                Program() {
                    throw new Error("Intentional error.");
                }
            }));

            assert.throws(() => {
                linter.verify(code, config, filename);
            }, `Intentional error.\nOccurred while linting ${filename}:1\nRule: "checker"`);
        });

        it("does not call rule listeners with a `this` value", () => {
            const spy = sinon.spy();

            linter.defineRule("checker", () => ({ Program: spy }));
            linter.verify("foo", { rules: { checker: "error" } });
            assert(spy.calledOnce, "Rule should have been called");
            assert.strictEqual(spy.firstCall.thisValue, void 0, "this value should be undefined");
        });

        it("has all the `parent` properties on nodes when the rule listeners are created", () => {
            const spy = sinon.spy(context => {
                const ast = context.getSourceCode().ast;

                assert.strictEqual(ast.body[0].parent, ast);
                assert.strictEqual(ast.body[0].expression.parent, ast.body[0]);
                assert.strictEqual(ast.body[0].expression.left.parent, ast.body[0].expression);
                assert.strictEqual(ast.body[0].expression.right.parent, ast.body[0].expression);

                return {};
            });

            linter.defineRule("checker", spy);

            linter.verify("foo + bar", { rules: { checker: "error" } });
            assert(spy.calledOnce);
        });
    });

    describe("context.getSourceLines()", () => {

        it("should get proper lines when using \\n as a line break", () => {
            const code = "a;\nb;";
            const spy = sinon.spy(context => {
                assert.deepStrictEqual(context.getSourceLines(), ["a;", "b;"]);
                return {};
            });

            linter.defineRule("checker", spy);
            linter.verify(code, { rules: { checker: "error" } });
            assert(spy.calledOnce);
        });

        it("should get proper lines when using \\r\\n as a line break", () => {
            const code = "a;\r\nb;";
            const spy = sinon.spy(context => {
                assert.deepStrictEqual(context.getSourceLines(), ["a;", "b;"]);
                return {};
            });

            linter.defineRule("checker", spy);
            linter.verify(code, { rules: { checker: "error" } });
            assert(spy.calledOnce);
        });

        it("should get proper lines when using \\r as a line break", () => {
            const code = "a;\rb;";
            const spy = sinon.spy(context => {
                assert.deepStrictEqual(context.getSourceLines(), ["a;", "b;"]);
                return {};
            });

            linter.defineRule("checker", spy);
            linter.verify(code, { rules: { checker: "error" } });
            assert(spy.calledOnce);
        });

        it("should get proper lines when using \\u2028 as a line break", () => {
            const code = "a;\u2028b;";
            const spy = sinon.spy(context => {
                assert.deepStrictEqual(context.getSourceLines(), ["a;", "b;"]);
                return {};
            });

            linter.defineRule("checker", spy);
            linter.verify(code, { rules: { checker: "error" } });
            assert(spy.calledOnce);
        });

        it("should get proper lines when using \\u2029 as a line break", () => {
            const code = "a;\u2029b;";
            const spy = sinon.spy(context => {
                assert.deepStrictEqual(context.getSourceLines(), ["a;", "b;"]);
                return {};
            });

            linter.defineRule("checker", spy);
            linter.verify(code, { rules: { checker: "error" } });
            assert(spy.calledOnce);
        });


    });

    describe("getSourceCode()", () => {
        const code = TEST_CODE;

        it("should retrieve SourceCode object after reset", () => {
            linter.verify(code, {}, filename, true);

            const sourceCode = linter.getSourceCode();

            assert.isObject(sourceCode);
            assert.strictEqual(sourceCode.text, code);
            assert.isObject(sourceCode.ast);
        });

        it("should retrieve SourceCode object without reset", () => {
            linter.verify(code, {}, filename);

            const sourceCode = linter.getSourceCode();

            assert.isObject(sourceCode);
            assert.strictEqual(sourceCode.text, code);
            assert.isObject(sourceCode.ast);
        });

    });

    describe("getSuppressedMessages()", () => {
        it("should have no suppressed messages", () => {
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(suppressedMessages.length, 0);
        });
    });

    describe("context.getSource()", () => {
        const code = TEST_CODE;

        it("should retrieve all text when used without parameters", () => {

            const config = { rules: { checker: "error" } };
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(() => {
                    assert.strictEqual(context.getSource(), TEST_CODE);
                });
                return { Program: spy };
            });

            linter.verify(code, config);
            assert(spy && spy.calledOnce);
        });

        it("should retrieve all text for root node", () => {
            const config = { rules: { checker: "error" } };
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(node => {
                    assert.strictEqual(context.getSource(node), TEST_CODE);
                });
                return { Program: spy };
            });

            linter.verify(code, config);
            assert(spy && spy.calledOnce);
        });

        it("should clamp to valid range when retrieving characters before start of source", () => {
            const config = { rules: { checker: "error" } };
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(node => {
                    assert.strictEqual(context.getSource(node, 2, 0), TEST_CODE);
                });
                return { Program: spy };
            });

            linter.verify(code, config);
            assert(spy && spy.calledOnce);
        });

        it("should retrieve all text for binary expression", () => {
            const config = { rules: { checker: "error" } };
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(node => {
                    assert.strictEqual(context.getSource(node), "6 * 7");
                });
                return { BinaryExpression: spy };
            });

            linter.verify(code, config);
            assert(spy && spy.calledOnce);
        });

        it("should retrieve all text plus two characters before for binary expression", () => {
            const config = { rules: { checker: "error" } };
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(node => {
                    assert.strictEqual(context.getSource(node, 2), "= 6 * 7");
                });
                return { BinaryExpression: spy };
            });

            linter.verify(code, config);
            assert(spy && spy.calledOnce);
        });

        it("should retrieve all text plus one character after for binary expression", () => {
            const config = { rules: { checker: "error" } };
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(node => {
                    assert.strictEqual(context.getSource(node, 0, 1), "6 * 7;");
                });
                return { BinaryExpression: spy };
            });

            linter.verify(code, config);
            assert(spy && spy.calledOnce);
        });

        it("should retrieve all text plus two characters before and one character after for binary expression", () => {
            const config = { rules: { checker: "error" } };
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(node => {
                    assert.strictEqual(context.getSource(node, 2, 1), "= 6 * 7;");
                });
                return { BinaryExpression: spy };
            });

            linter.verify(code, config);
            assert(spy && spy.calledOnce);
        });

    });

    describe("when calling context.getAncestors", () => {
        const code = TEST_CODE;

        it("should retrieve all ancestors when used", () => {

            const config = { rules: { checker: "error" } };
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(() => {
                    const ancestors = context.getAncestors();

                    assert.strictEqual(ancestors.length, 3);
                });
                return { BinaryExpression: spy };
            });

            linter.verify(code, config, filename, true);
            assert(spy && spy.calledOnce);
        });

        it("should retrieve empty ancestors for root node", () => {
            const config = { rules: { checker: "error" } };
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(() => {
                    const ancestors = context.getAncestors();

                    assert.strictEqual(ancestors.length, 0);
                });

                return { Program: spy };
            });

            linter.verify(code, config);
            assert(spy && spy.calledOnce);
        });
    });

    describe("when calling context.getNodeByRangeIndex", () => {
        const code = TEST_CODE;

        it("should retrieve a node starting at the given index", () => {
            const config = { rules: { checker: "error" } };
            const spy = sinon.spy(context => {
                assert.strictEqual(context.getNodeByRangeIndex(4).type, "Identifier");
                return {};
            });

            linter.defineRule("checker", spy);
            linter.verify(code, config);
            assert(spy.calledOnce);
        });

        it("should retrieve a node containing the given index", () => {
            const config = { rules: { checker: "error" } };
            const spy = sinon.spy(context => {
                assert.strictEqual(context.getNodeByRangeIndex(6).type, "Identifier");
                return {};
            });

            linter.defineRule("checker", spy);
            linter.verify(code, config);
            assert(spy.calledOnce);
        });

        it("should retrieve a node that is exactly the given index", () => {
            const config = { rules: { checker: "error" } };
            const spy = sinon.spy(context => {
                const node = context.getNodeByRangeIndex(13);

                assert.strictEqual(node.type, "Literal");
                assert.strictEqual(node.value, 6);
                return {};
            });

            linter.defineRule("checker", spy);
            linter.verify(code, config);
            assert(spy.calledOnce);
        });

        it("should retrieve a node ending with the given index", () => {
            const config = { rules: { checker: "error" } };
            const spy = sinon.spy(context => {
                assert.strictEqual(context.getNodeByRangeIndex(9).type, "Identifier");
                return {};
            });

            linter.defineRule("checker", spy);
            linter.verify(code, config);
            assert(spy.calledOnce);
        });

        it("should retrieve the deepest node containing the given index", () => {
            const config = { rules: { checker: "error" } };
            const spy = sinon.spy(context => {
                const node1 = context.getNodeByRangeIndex(14);

                assert.strictEqual(node1.type, "BinaryExpression");

                const node2 = context.getNodeByRangeIndex(3);

                assert.strictEqual(node2.type, "VariableDeclaration");
                return {};
            });

            linter.defineRule("checker", spy);
            linter.verify(code, config);
            assert(spy.calledOnce);
        });

        it("should return null if the index is outside the range of any node", () => {
            const config = { rules: { checker: "error" } };
            const spy = sinon.spy(context => {
                const node1 = context.getNodeByRangeIndex(-1);

                assert.isNull(node1);

                const node2 = context.getNodeByRangeIndex(-99);

                assert.isNull(node2);
                return {};
            });

            linter.defineRule("checker", spy);
            linter.verify(code, config);
            assert(spy.calledOnce);
        });
    });


    describe("when calling context.getScope", () => {
        const code = "function foo() { q: for(;;) { break q; } } function bar () { var q = t; } var baz = (() => { return 1; });";

        it("should retrieve the global scope correctly from a Program", () => {
            const config = { rules: { checker: "error" }, parserOptions: { ecmaVersion: 6 } };
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(() => {
                    const scope = context.getScope();

                    assert.strictEqual(scope.type, "global");
                });
                return { Program: spy };
            });

            linter.verify(code, config);
            assert(spy && spy.calledOnce);
        });

        it("should retrieve the function scope correctly from a FunctionDeclaration", () => {
            const config = { rules: { checker: "error" }, parserOptions: { ecmaVersion: 6 } };
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(() => {
                    const scope = context.getScope();

                    assert.strictEqual(scope.type, "function");
                });
                return { FunctionDeclaration: spy };
            });

            linter.verify(code, config);
            assert(spy && spy.calledTwice);
        });

        it("should retrieve the function scope correctly from a LabeledStatement", () => {
            const config = { rules: { checker: "error" }, parserOptions: { ecmaVersion: 6 } };
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(() => {
                    const scope = context.getScope();

                    assert.strictEqual(scope.type, "function");
                    assert.strictEqual(scope.block.id.name, "foo");
                });
                return { LabeledStatement: spy };
            });

            linter.verify(code, config);
            assert(spy && spy.calledOnce);
        });

        it("should retrieve the function scope correctly from within an ArrowFunctionExpression", () => {
            const config = { rules: { checker: "error" }, parserOptions: { ecmaVersion: 6 } };
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(() => {
                    const scope = context.getScope();

                    assert.strictEqual(scope.type, "function");
                    assert.strictEqual(scope.block.type, "ArrowFunctionExpression");
                });

                return { ReturnStatement: spy };
            });

            linter.verify(code, config);
            assert(spy && spy.calledOnce);
        });

        it("should retrieve the function scope correctly from within an SwitchStatement", () => {
            const config = { rules: { checker: "error" }, parserOptions: { ecmaVersion: 6 } };
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(() => {
                    const scope = context.getScope();

                    assert.strictEqual(scope.type, "switch");
                    assert.strictEqual(scope.block.type, "SwitchStatement");
                });

                return { SwitchStatement: spy };
            });

            linter.verify("switch(foo){ case 'a': var b = 'foo'; }", config);
            assert(spy && spy.calledOnce);
        });

        it("should retrieve the function scope correctly from within a BlockStatement", () => {
            const config = { rules: { checker: "error" }, parserOptions: { ecmaVersion: 6 } };
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(() => {
                    const scope = context.getScope();

                    assert.strictEqual(scope.type, "block");
                    assert.strictEqual(scope.block.type, "BlockStatement");
                });

                return { BlockStatement: spy };
            });

            linter.verify("var x; {let y = 1}", config);
            assert(spy && spy.calledOnce);
        });

        it("should retrieve the function scope correctly from within a nested block statement", () => {
            const config = { rules: { checker: "error" }, parserOptions: { ecmaVersion: 6 } };
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(() => {
                    const scope = context.getScope();

                    assert.strictEqual(scope.type, "block");
                    assert.strictEqual(scope.block.type, "BlockStatement");
                });

                return { BlockStatement: spy };
            });

            linter.verify("if (true) { let x = 1 }", config);
            assert(spy && spy.calledOnce);
        });

        it("should retrieve the function scope correctly from within a FunctionDeclaration", () => {
            const config = { rules: { checker: "error" }, parserOptions: { ecmaVersion: 6 } };
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(() => {
                    const scope = context.getScope();

                    assert.strictEqual(scope.type, "function");
                    assert.strictEqual(scope.block.type, "FunctionDeclaration");
                });

                return { FunctionDeclaration: spy };
            });

            linter.verify("function foo() {}", config);
            assert(spy && spy.calledOnce);
        });

        it("should retrieve the function scope correctly from within a FunctionExpression", () => {
            const config = { rules: { checker: "error" }, parserOptions: { ecmaVersion: 6 } };
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(() => {
                    const scope = context.getScope();

                    assert.strictEqual(scope.type, "function");
                    assert.strictEqual(scope.block.type, "FunctionExpression");
                });

                return { FunctionExpression: spy };
            });

            linter.verify("(function foo() {})();", config);
            assert(spy && spy.calledOnce);
        });

        it("should retrieve the catch scope correctly from within a CatchClause", () => {
            const config = { rules: { checker: "error" }, parserOptions: { ecmaVersion: 6 } };
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(() => {
                    const scope = context.getScope();

                    assert.strictEqual(scope.type, "catch");
                    assert.strictEqual(scope.block.type, "CatchClause");
                });

                return { CatchClause: spy };
            });

            linter.verify("try {} catch (err) {}", config);
            assert(spy && spy.calledOnce);
        });

        it("should retrieve module scope correctly from an ES6 module", () => {
            const config = { rules: { checker: "error" }, parserOptions: { ecmaVersion: 6, sourceType: "module" } };
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(() => {
                    const scope = context.getScope();

                    assert.strictEqual(scope.type, "module");
                });

                return { AssignmentExpression: spy };
            });

            linter.verify("var foo = {}; foo.bar = 1;", config);
            assert(spy && spy.calledOnce);
        });

        it("should retrieve function scope correctly when globalReturn is true", () => {
            const config = { rules: { checker: "error" }, parserOptions: { ecmaVersion: 6, ecmaFeatures: { globalReturn: true } } };
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(() => {
                    const scope = context.getScope();

                    assert.strictEqual(scope.type, "function");
                });

                return { AssignmentExpression: spy };
            });

            linter.verify("var foo = {}; foo.bar = 1;", config);
            assert(spy && spy.calledOnce);
        });
    });

    describe("marking variables as used", () => {
        it("should mark variables in current scope as used", () => {
            const code = "var a = 1, b = 2;";
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(() => {
                    assert.isTrue(context.markVariableAsUsed("a"));

                    const scope = context.getScope();

                    assert.isTrue(getVariable(scope, "a").eslintUsed);
                    assert.notOk(getVariable(scope, "b").eslintUsed);
                });

                return { "Program:exit": spy };
            });

            linter.verify(code, { rules: { checker: "error" } });
            assert(spy && spy.calledOnce);
        });
        it("should mark variables in function args as used", () => {
            const code = "function abc(a, b) { return 1; }";
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(() => {
                    assert.isTrue(context.markVariableAsUsed("a"));

                    const scope = context.getScope();

                    assert.isTrue(getVariable(scope, "a").eslintUsed);
                    assert.notOk(getVariable(scope, "b").eslintUsed);
                });

                return { ReturnStatement: spy };
            });

            linter.verify(code, { rules: { checker: "error" } });
            assert(spy && spy.calledOnce);
        });
        it("should mark variables in higher scopes as used", () => {
            const code = "var a, b; function abc() { return 1; }";
            let returnSpy, exitSpy;

            linter.defineRule("checker", context => {
                returnSpy = sinon.spy(() => {
                    assert.isTrue(context.markVariableAsUsed("a"));
                });
                exitSpy = sinon.spy(() => {
                    const scope = context.getScope();

                    assert.isTrue(getVariable(scope, "a").eslintUsed);
                    assert.notOk(getVariable(scope, "b").eslintUsed);
                });

                return { ReturnStatement: returnSpy, "Program:exit": exitSpy };
            });

            linter.verify(code, { rules: { checker: "error" } });
            assert(returnSpy && returnSpy.calledOnce);
            assert(exitSpy && exitSpy.calledOnce);
        });

        it("should mark variables in Node.js environment as used", () => {
            const code = "var a = 1, b = 2;";
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(() => {
                    const globalScope = context.getScope(),
                        childScope = globalScope.childScopes[0];

                    assert.isTrue(context.markVariableAsUsed("a"));

                    assert.isTrue(getVariable(childScope, "a").eslintUsed);
                    assert.isUndefined(getVariable(childScope, "b").eslintUsed);
                });

                return { "Program:exit": spy };
            });

            linter.verify(code, { rules: { checker: "error" }, env: { node: true } });
            assert(spy && spy.calledOnce);
        });

        it("should mark variables in modules as used", () => {
            const code = "var a = 1, b = 2;";
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(() => {
                    const globalScope = context.getScope(),
                        childScope = globalScope.childScopes[0];

                    assert.isTrue(context.markVariableAsUsed("a"));

                    assert.isTrue(getVariable(childScope, "a").eslintUsed);
                    assert.isUndefined(getVariable(childScope, "b").eslintUsed);
                });

                return { "Program:exit": spy };
            });

            linter.verify(code, { rules: { checker: "error" }, parserOptions: { ecmaVersion: 6, sourceType: "module" } }, filename, true);
            assert(spy && spy.calledOnce);
        });

        it("should return false if the given variable is not found", () => {
            const code = "var a = 1, b = 2;";
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(() => {
                    assert.isFalse(context.markVariableAsUsed("c"));
                });

                return { "Program:exit": spy };
            });

            linter.verify(code, { rules: { checker: "error" } });
            assert(spy && spy.calledOnce);
        });
    });

    describe("when evaluating code", () => {
        const code = TEST_CODE;

        it("events for each node type should fire", () => {
            const config = { rules: { checker: "error" } };

            // spies for various AST node types
            const spyLiteral = sinon.spy(),
                spyVariableDeclarator = sinon.spy(),
                spyVariableDeclaration = sinon.spy(),
                spyIdentifier = sinon.spy(),
                spyBinaryExpression = sinon.spy();

            linter.defineRule("checker", () => ({
                Literal: spyLiteral,
                VariableDeclarator: spyVariableDeclarator,
                VariableDeclaration: spyVariableDeclaration,
                Identifier: spyIdentifier,
                BinaryExpression: spyBinaryExpression
            }));

            const messages = linter.verify(code, config, filename, true);
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 0);
            assert.strictEqual(suppressedMessages.length, 0);
            sinon.assert.calledOnce(spyVariableDeclaration);
            sinon.assert.calledOnce(spyVariableDeclarator);
            sinon.assert.calledOnce(spyIdentifier);
            sinon.assert.calledTwice(spyLiteral);
            sinon.assert.calledOnce(spyBinaryExpression);
        });

        it("should throw an error if a rule reports a problem without a message", () => {
            linter.defineRule("invalid-report", context => ({
                Program(node) {
                    context.report({ node });
                }
            }));

            assert.throws(
                () => linter.verify("foo", { rules: { "invalid-report": "error" } }),
                TypeError,
                "Missing `message` property in report() call; add a message that describes the linting problem."
            );
        });
    });

    describe("when config has shared settings for rules", () => {
        const code = "test-rule";

        it("should pass settings to all rules", () => {
            linter.defineRule(code, context => ({
                Literal(node) {
                    context.report(node, context.settings.info);
                }
            }));

            const config = { rules: {}, settings: { info: "Hello" } };

            config.rules[code] = 1;

            const messages = linter.verify("0", config, filename);
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 1);
            assert.strictEqual(messages[0].message, "Hello");
            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should not have any settings if they were not passed in", () => {
            linter.defineRule(code, context => ({
                Literal(node) {
                    if (Object.getOwnPropertyNames(context.settings).length !== 0) {
                        context.report(node, "Settings should be empty");
                    }
                }
            }));

            const config = { rules: {} };

            config.rules[code] = 1;

            const messages = linter.verify("0", config, filename);
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 0);
            assert.strictEqual(suppressedMessages.length, 0);
        });
    });

    describe("when config has parseOptions", () => {

        it("should pass ecmaFeatures to all rules when provided on config", () => {

            const parserOptions = {
                ecmaFeatures: {
                    jsx: true,
                    globalReturn: true
                }
            };

            linter.defineRule("test-rule", sinon.mock().withArgs(
                sinon.match({ parserOptions })
            ).returns({}));

            const config = { rules: { "test-rule": 2 }, parserOptions };

            linter.verify("0", config, filename);
        });

        it("should pass parserOptions to all rules when default parserOptions is used", () => {

            const parserOptions = {};

            linter.defineRule("test-rule", sinon.mock().withArgs(
                sinon.match({ parserOptions })
            ).returns({}));

            const config = { rules: { "test-rule": 2 } };

            linter.verify("0", config, filename);
        });

    });

    describe("when a custom parser is defined using defineParser", () => {

        it("should be able to define a custom parser", () => {
            const parser = {
                parseForESLint: function parse(code, options) {
                    return {
                        ast: esprima.parse(code, options),
                        services: {
                            test: {
                                getMessage() {
                                    return "Hi!";
                                }
                            }
                        }
                    };
                }
            };

            linter.defineParser("test-parser", parser);
            const config = { rules: {}, parser: "test-parser" };
            const messages = linter.verify("0", config, filename);
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 0);
            assert.strictEqual(suppressedMessages.length, 0);
        });

    });

    describe("when config has parser", () => {

        it("should pass parser as parserPath to all rules when provided on config", () => {

            const alternateParser = "esprima";

            linter.defineParser("esprima", esprima);
            linter.defineRule("test-rule", sinon.mock().withArgs(
                sinon.match({ parserPath: alternateParser })
            ).returns({}));

            const config = { rules: { "test-rule": 2 }, parser: alternateParser };

            linter.verify("0", config, filename);
        });

        it("should use parseForESLint() in custom parser when custom parser is specified", () => {
            const config = { rules: {}, parser: "enhanced-parser" };

            linter.defineParser("enhanced-parser", testParsers.enhancedParser);
            const messages = linter.verify("0", config, filename);
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 0);
            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should expose parser services when using parseForESLint() and services are specified", () => {
            linter.defineParser("enhanced-parser", testParsers.enhancedParser);
            linter.defineRule("test-service-rule", context => ({
                Literal(node) {
                    context.report({
                        node,
                        message: context.parserServices.test.getMessage()
                    });
                }
            }));

            const config = { rules: { "test-service-rule": 2 }, parser: "enhanced-parser" };
            const messages = linter.verify("0", config, filename);
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 1);
            assert.strictEqual(messages[0].message, "Hi!");
            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should use the same parserServices if source code object is reused", () => {
            linter.defineParser("enhanced-parser", testParsers.enhancedParser);
            linter.defineRule("test-service-rule", context => ({
                Literal(node) {
                    context.report({
                        node,
                        message: context.parserServices.test.getMessage()
                    });
                }
            }));

            const config = { rules: { "test-service-rule": 2 }, parser: "enhanced-parser" };
            const messages = linter.verify("0", config, filename);
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 1);
            assert.strictEqual(messages[0].message, "Hi!");
            assert.strictEqual(suppressedMessages.length, 0);

            const messages2 = linter.verify(linter.getSourceCode(), config, filename);
            const suppressedMessages2 = linter.getSuppressedMessages();

            assert.strictEqual(messages2.length, 1);
            assert.strictEqual(messages2[0].message, "Hi!");
            assert.strictEqual(suppressedMessages2.length, 0);
        });

        it("should pass parser as parserPath to all rules when default parser is used", () => {
            linter.defineRule("test-rule", sinon.mock().withArgs(
                sinon.match({ parserPath: "espree" })
            ).returns({}));

            const config = { rules: { "test-rule": 2 } };

            linter.verify("0", config, filename);
        });

    });


    describe("when passing in configuration values for rules", () => {
        const code = "var answer = 6 * 7";

        it("should process empty config", () => {
            const config = {};
            const messages = linter.verify(code, config, filename, true);
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 0);
            assert.strictEqual(suppressedMessages.length, 0);
        });
    });

    describe("when evaluating code containing /*global */ and /*globals */ blocks", () => {

        it("variables should be available in global scope", () => {
            const config = { rules: { checker: "error" }, globals: { Array: "off", ConfigGlobal: "writeable" } };
            const code = `
                /*global a b:true c:false d:readable e:writeable Math:off */
                function foo() {}
                /*globals f:true*/
                /* global ConfigGlobal : readable */
            `;
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(() => {
                    const scope = context.getScope();
                    const a = getVariable(scope, "a"),
                        b = getVariable(scope, "b"),
                        c = getVariable(scope, "c"),
                        d = getVariable(scope, "d"),
                        e = getVariable(scope, "e"),
                        f = getVariable(scope, "f"),
                        mathGlobal = getVariable(scope, "Math"),
                        arrayGlobal = getVariable(scope, "Array"),
                        configGlobal = getVariable(scope, "ConfigGlobal");

                    assert.strictEqual(a.name, "a");
                    assert.strictEqual(a.writeable, false);
                    assert.strictEqual(b.name, "b");
                    assert.strictEqual(b.writeable, true);
                    assert.strictEqual(c.name, "c");
                    assert.strictEqual(c.writeable, false);
                    assert.strictEqual(d.name, "d");
                    assert.strictEqual(d.writeable, false);
                    assert.strictEqual(e.name, "e");
                    assert.strictEqual(e.writeable, true);
                    assert.strictEqual(f.name, "f");
                    assert.strictEqual(f.writeable, true);
                    assert.strictEqual(mathGlobal, null);
                    assert.strictEqual(arrayGlobal, null);
                    assert.strictEqual(configGlobal.name, "ConfigGlobal");
                    assert.strictEqual(configGlobal.writeable, false);
                });

                return { Program: spy };
            });

            linter.verify(code, config);
            assert(spy && spy.calledOnce);
        });
    });

    describe("when evaluating code containing a /*global */ block with sloppy whitespace", () => {
        const code = "/* global  a b  : true   c:  false*/";

        it("variables should be available in global scope", () => {
            const config = { rules: { checker: "error" } };
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(() => {
                    const scope = context.getScope(),
                        a = getVariable(scope, "a"),
                        b = getVariable(scope, "b"),
                        c = getVariable(scope, "c");

                    assert.strictEqual(a.name, "a");
                    assert.strictEqual(a.writeable, false);
                    assert.strictEqual(b.name, "b");
                    assert.strictEqual(b.writeable, true);
                    assert.strictEqual(c.name, "c");
                    assert.strictEqual(c.writeable, false);
                });

                return { Program: spy };
            });

            linter.verify(code, config);
            assert(spy && spy.calledOnce);
        });
    });

    describe("when evaluating code containing a /*global */ block with specific variables", () => {
        const code = "/* global toString hasOwnProperty valueOf: true */";

        it("should not throw an error if comment block has global variables which are Object.prototype contains", () => {
            const config = { rules: { checker: "error" } };

            linter.verify(code, config);
        });
    });

    describe("when evaluating code containing /*ec0lint-env */ block", () => {
        it("variables should be available in global scope", () => {
            const code = `/*${ESLINT_ENV} node*/ function f() {} /*${ESLINT_ENV} browser, foo*/`;
            const config = { rules: { checker: "error" } };
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(() => {
                    const scope = context.getScope(),
                        exports = getVariable(scope, "exports"),
                        window = getVariable(scope, "window");

                    assert.strictEqual(exports.writeable, true);
                    assert.strictEqual(window.writeable, false);
                });

                return { Program: spy };
            });

            linter.verify(code, config);
            assert(spy && spy.calledOnce);
        });
    });

    describe("when evaluating code containing /*ec0lint-env */ block with sloppy whitespace", () => {
        const code = `/* ${ESLINT_ENV} ,, node  , no-browser ,,  */`;

        it("variables should be available in global scope", () => {
            const config = { rules: { checker: "error" } };
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(() => {
                    const scope = context.getScope(),
                        exports = getVariable(scope, "exports"),
                        window = getVariable(scope, "window");

                    assert.strictEqual(exports.writeable, true);
                    assert.strictEqual(window, null);
                });

                return { Program: spy };
            });

            linter.verify(code, config);
            assert(spy && spy.calledOnce);
        });
    });

    describe("when evaluating code containing /*exported */ block", () => {

        it("we should behave nicely when no matching variable is found", () => {
            const code = "/* exported horse */";
            const config = { rules: {} };

            linter.verify(code, config, filename, true);
        });

        it("variables should be exported", () => {
            const code = "/* exported horse */\n\nvar horse = 'circus'";
            const config = { rules: { checker: "error" } };
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(() => {
                    const scope = context.getScope(),
                        horse = getVariable(scope, "horse");

                    assert.strictEqual(horse.eslintUsed, true);
                });

                return { Program: spy };
            });

            linter.verify(code, config);
            assert(spy && spy.calledOnce);
        });

        it("undefined variables should not be exported", () => {
            const code = "/* exported horse */\n\nhorse = 'circus'";
            const config = { rules: { checker: "error" } };
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(() => {
                    const scope = context.getScope(),
                        horse = getVariable(scope, "horse");

                    assert.strictEqual(horse, null);
                });

                return { Program: spy };
            });

            linter.verify(code, config);
            assert(spy && spy.calledOnce);
        });

        it("variables should be exported in strict mode", () => {
            const code = "/* exported horse */\n'use strict';\nvar horse = 'circus'";
            const config = { rules: { checker: "error" } };
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(() => {
                    const scope = context.getScope(),
                        horse = getVariable(scope, "horse");

                    assert.strictEqual(horse.eslintUsed, true);
                });

                return { Program: spy };
            });

            linter.verify(code, config);
            assert(spy && spy.calledOnce);
        });

        it("variables should not be exported in the es6 module environment", () => {
            const code = "/* exported horse */\nvar horse = 'circus'";
            const config = { rules: { checker: "error" }, parserOptions: { ecmaVersion: 6, sourceType: "module" } };
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(() => {
                    const scope = context.getScope(),
                        horse = getVariable(scope, "horse");

                    assert.strictEqual(horse, null); // there is no global scope at all
                });

                return { Program: spy };
            });

            linter.verify(code, config);
            assert(spy && spy.calledOnce);
        });

        it("variables should not be exported when in the node environment", () => {
            const code = "/* exported horse */\nvar horse = 'circus'";
            const config = { rules: { checker: "error" }, env: { node: true } };
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(() => {
                    const scope = context.getScope(),
                        horse = getVariable(scope, "horse");

                    assert.strictEqual(horse, null); // there is no global scope at all
                });

                return { Program: spy };
            });

            linter.verify(code, config);
            assert(spy && spy.calledOnce);
        });
    });

    describe("when evaluating code containing a line comment", () => {
        const code = "//global a \n function f() {}";

        it("should not introduce a global variable", () => {
            const config = { rules: { checker: "error" } };
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(() => {
                    const scope = context.getScope();

                    assert.strictEqual(getVariable(scope, "a"), null);
                });

                return { Program: spy };
            });

            linter.verify(code, config);
            assert(spy && spy.calledOnce);
        });
    });

    describe("when evaluating code containing normal block comments", () => {
        const code = "/**/  /*a*/  /*b:true*/  /*foo c:false*/";

        it("should not introduce a global variable", () => {
            const config = { rules: { checker: "error" } };
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(() => {
                    const scope = context.getScope();

                    assert.strictEqual(getVariable(scope, "a"), null);
                    assert.strictEqual(getVariable(scope, "b"), null);
                    assert.strictEqual(getVariable(scope, "foo"), null);
                    assert.strictEqual(getVariable(scope, "c"), null);
                });

                return { Program: spy };
            });

            linter.verify(code, config);
            assert(spy && spy.calledOnce);
        });
    });

    describe("when evaluating any code", () => {
        const code = "x";

        it("builtin global variables should be available in the global scope", () => {
            const config = { rules: { checker: "error" } };
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(() => {
                    const scope = context.getScope();

                    assert.notStrictEqual(getVariable(scope, "Object"), null);
                    assert.notStrictEqual(getVariable(scope, "Array"), null);
                    assert.notStrictEqual(getVariable(scope, "undefined"), null);
                });

                return { Program: spy };
            });

            linter.verify(code, config);
            assert(spy && spy.calledOnce);
        });

        it("ES6 global variables should not be available by default", () => {
            const config = { rules: { checker: "error" } };
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(() => {
                    const scope = context.getScope();

                    assert.strictEqual(getVariable(scope, "Promise"), null);
                    assert.strictEqual(getVariable(scope, "Symbol"), null);
                    assert.strictEqual(getVariable(scope, "WeakMap"), null);
                });

                return { Program: spy };
            });

            linter.verify(code, config);
            assert(spy && spy.calledOnce);
        });

        it("ES6 global variables should be available in the es6 environment", () => {
            const config = { rules: { checker: "error" }, env: { es6: true } };
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(() => {
                    const scope = context.getScope();

                    assert.notStrictEqual(getVariable(scope, "Promise"), null);
                    assert.notStrictEqual(getVariable(scope, "Symbol"), null);
                    assert.notStrictEqual(getVariable(scope, "WeakMap"), null);
                });

                return { Program: spy };
            });

            linter.verify(code, config);
            assert(spy && spy.calledOnce);
        });

        it("ES6 global variables can be disabled when the es6 environment is enabled", () => {
            const config = { rules: { checker: "error" }, globals: { Promise: "off", Symbol: "off", WeakMap: "off" }, env: { es6: true } };
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(() => {
                    const scope = context.getScope();

                    assert.strictEqual(getVariable(scope, "Promise"), null);
                    assert.strictEqual(getVariable(scope, "Symbol"), null);
                    assert.strictEqual(getVariable(scope, "WeakMap"), null);
                });

                return { Program: spy };
            });

            linter.verify(code, config);
            assert(spy && spy.calledOnce);
        });
    });

    describe("at any time", () => {
        const code = "new-rule";

        it("can add a rule dynamically", () => {
            linter.defineRule(code, context => ({
                Literal(node) {
                    context.report(node, "message");
                }
            }));

            const config = { rules: {} };

            config.rules[code] = 1;

            const messages = linter.verify("0", config, filename);
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 1);
            assert.strictEqual(messages[0].ruleId, code);
            assert.strictEqual(messages[0].nodeType, "Literal");

            assert.strictEqual(suppressedMessages.length, 0);
        });
    });

    describe("at any time", () => {
        const code = ["new-rule-0", "new-rule-1"];

        it("can add multiple rules dynamically", () => {
            const config = { rules: {} };
            const newRules = {};

            code.forEach(item => {
                config.rules[item] = 1;
                newRules[item] = function (context) {
                    return {
                        Literal(node) {
                            context.report(node, "message");
                        }
                    };
                };
            });
            linter.defineRules(newRules);

            const messages = linter.verify("0", config, filename);
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, code.length);
            code.forEach(item => {
                assert.ok(messages.some(message => message.ruleId === item));
            });
            messages.forEach(message => {
                assert.strictEqual(message.nodeType, "Literal");
            });

            assert.strictEqual(suppressedMessages.length, 0);
        });
    });

    describe("at any time", () => {
        const code = "filename-rule";

        it("has access to the filename", () => {
            linter.defineRule(code, context => ({
                Literal(node) {
                    context.report(node, context.getFilename());
                }
            }));

            const config = { rules: {} };

            config.rules[code] = 1;

            const messages = linter.verify("0", config, filename);
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages[0].message, filename);
            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("has access to the physicalFilename", () => {
            linter.defineRule(code, context => ({
                Literal(node) {
                    context.report(node, context.getPhysicalFilename());
                }
            }));

            const config = { rules: {} };

            config.rules[code] = 1;

            const messages = linter.verify("0", config, filename);
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages[0].message, filename);
            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("defaults filename to '<input>'", () => {
            linter.defineRule(code, context => ({
                Literal(node) {
                    context.report(node, context.getFilename());
                }
            }));

            const config = { rules: {} };

            config.rules[code] = 1;

            const messages = linter.verify("0", config);
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages[0].message, "<input>");
            assert.strictEqual(suppressedMessages.length, 0);
        });
    });

    describe("when evaluating code with invalid comments to enable rules", () => {
        it("should report a violation when the config violates a rule's schema", () => {
            const messages = linter.verify("/* ec0lint lighter-http: [error, {nonExistentPropertyName: true}]*/", {});
            const suppressedMessages = linter.getSuppressedMessages();

            assert.deepStrictEqual(
                messages,
                [
                    {
                        severity: 2,
                        ruleId: "lighter-http",
                        message: "Configuration for rule \"lighter-http\" is invalid:\n\tValue [{\"nonExistentPropertyName\":true}] should NOT have more than 0 items.\n",
                        line: 1,
                        column: 1,
                        endLine: 1,
                        endColumn: 68,
                        nodeType: null
                    }
                ]
            );

            assert.strictEqual(suppressedMessages.length, 0);
        });
    });

    describe("when evaluating code with comments to disable rules", () => {
        let code, messages, suppressedMessages;

        it("should report an error when disabling a non-existent rule in inline comment", () => {
            code = "/*ec0lint foo:0*/ ;";
            messages = linter.verify(code, {}, filename);
            suppressedMessages = linter.getSuppressedMessages();
            assert.strictEqual(messages.length, 1);
            assert.strictEqual(messages[0].message, "Definition for rule 'foo' was not found.");
            assert.strictEqual(suppressedMessages.length, 0);

            code = "/*ec0lint-disable foo*/ ;";
            messages = linter.verify(code, {}, filename);
            suppressedMessages = linter.getSuppressedMessages();
            assert.strictEqual(messages.length, 1);
            assert.strictEqual(messages[0].message, "Definition for rule 'foo' was not found.");
            assert.strictEqual(suppressedMessages.length, 0);

            code = "/*ec0lint-disable-line foo*/ ;";
            messages = linter.verify(code, {}, filename);
            suppressedMessages = linter.getSuppressedMessages();
            assert.strictEqual(messages.length, 1);
            assert.strictEqual(messages[0].message, "Definition for rule 'foo' was not found.");
            assert.strictEqual(suppressedMessages.length, 0);

            code = "/*ec0lint-disable-next-line foo*/ ;";
            messages = linter.verify(code, {}, filename);
            suppressedMessages = linter.getSuppressedMessages();
            assert.strictEqual(messages.length, 1);
            assert.strictEqual(messages[0].message, "Definition for rule 'foo' was not found.");
            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should not report an error, when disabling a non-existent rule in config", () => {
            messages = linter.verify("", { rules: { foo: 0 } }, filename);
            suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 0);
            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should report an error, when config a non-existent rule in config", () => {
            messages = linter.verify("", { rules: { foo: 1 } }, filename);
            suppressedMessages = linter.getSuppressedMessages();
            assert.strictEqual(messages.length, 1);
            assert.strictEqual(messages[0].severity, 2);
            assert.strictEqual(messages[0].message, "Definition for rule 'foo' was not found.");
            assert.strictEqual(suppressedMessages.length, 0);

            messages = linter.verify("", { rules: { foo: 2 } }, filename);
            suppressedMessages = linter.getSuppressedMessages();
            assert.strictEqual(messages.length, 1);
            assert.strictEqual(messages[0].severity, 2);
            assert.strictEqual(messages[0].message, "Definition for rule 'foo' was not found.");
            assert.strictEqual(suppressedMessages.length, 0);
        });
    });

    describe("when evaluating code with comments to disable and enable configurable rule as part of plugin", () => {

        beforeEach(() => {
            linter.defineRule("test-plugin/test-rule", context => ({
                Literal(node) {
                    if (node.value === "trigger violation") {
                        context.report(node, "Reporting violation.");
                    }
                }
            }));
        });

        it("should not report a violation when inline comment enables plugin rule and there's no violation", () => {
            const config = { rules: {} };
            const code = "/*ec0lint test-plugin/test-rule: 2*/ var a = \"no violation\";";

            const messages = linter.verify(code, config, filename);
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 0);
            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should not report a violation when inline comment disables plugin rule", () => {
            const code = "/*ec0lint test-plugin/test-rule:0*/ var a = \"trigger violation\"";
            const config = { rules: { "test-plugin/test-rule": 1 } };

            const messages = linter.verify(code, config, filename);
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 0);
            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should report a violation when the report is right before the comment", () => {
            const code = " /* ec0lint-disable */ ";

            linter.defineRule("checker", context => ({
                Program() {
                    context.report({ loc: { line: 1, column: 0 }, message: "foo" });
                }
            }));
            const problems = linter.verify(code, { rules: { checker: "error" } });
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(problems.length, 1);
            assert.strictEqual(problems[0].message, "foo");
            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should not report a violation when the report is right at the start of the comment", () => {
            const code = " /* ec0lint-disable */ ";

            linter.defineRule("checker", context => ({
                Program() {
                    context.report({ loc: { line: 1, column: 1 }, message: "foo" });
                }
            }));
            const problems = linter.verify(code, { rules: { checker: "error" } });
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(problems.length, 0);

            assert.strictEqual(suppressedMessages.length, 1);
            assert.strictEqual(suppressedMessages[0].message, "foo");
            assert.strictEqual(suppressedMessages[0].suppressions.length, 1);
            assert.strictEqual(suppressedMessages[0].suppressions[0].justification, "");
        });
    });

    describe("when evaluating a file with a hashbang", () => {

        it("should have a comment with the hashbang in it", () => {
            const code = "#!bin/program\n\nvar foo;;";
            const config = { rules: { checker: "error" } };
            const spy = sinon.spy(context => {
                const comments = context.getAllComments();

                assert.strictEqual(comments.length, 1);
                assert.strictEqual(comments[0].type, "Shebang");
                return {};
            });

            linter.defineRule("checker", spy);
            linter.verify(code, config);
            assert(spy.calledOnce);
        });

        it("should comment hashbang without breaking offset", () => {
            const code = "#!/usr/bin/env node\n'123';";
            const config = { rules: { checker: "error" } };
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(node => {
                    assert.strictEqual(context.getSource(node), "'123';");
                });
                return { ExpressionStatement: spy };
            });

            linter.verify(code, config);
            assert(spy && spy.calledOnce);
        });

    });

    describe("when evaluating broken code", () => {
        const code = BROKEN_TEST_CODE;

        it("should report a violation with a useful parse error prefix", () => {
            const messages = linter.verify(code);
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 1);
            assert.strictEqual(messages[0].severity, 2);
            assert.isNull(messages[0].ruleId);
            assert.strictEqual(messages[0].line, 1);
            assert.strictEqual(messages[0].column, 4);
            assert.isTrue(messages[0].fatal);
            assert.match(messages[0].message, /^Parsing error:/u);

            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should report source code where the issue is present", () => {
            const inValidCode = [
                "var x = 20;",
                "if (x ==4 {",
                "    x++;",
                "}"
            ];
            const messages = linter.verify(inValidCode.join("\n"));
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 1);
            assert.strictEqual(messages[0].severity, 2);
            assert.isTrue(messages[0].fatal);
            assert.match(messages[0].message, /^Parsing error:/u);

            assert.strictEqual(suppressedMessages.length, 0);
        });
    });

    describe("when using an invalid (undefined) rule", () => {
        linter = new Linter();

        const code = TEST_CODE;
        let results, result, warningResult, arrayOptionResults, objectOptionResults, resultsMultiple;

        beforeEach(() => {
            results = linter.verify(code, { rules: { foobar: 2 } });
            result = results[0];
            warningResult = linter.verify(code, { rules: { foobar: 1 } })[0];
            arrayOptionResults = linter.verify(code, { rules: { foobar: [2, "always"] } });
            objectOptionResults = linter.verify(code, { rules: { foobar: [1, { bar: false }] } });
            resultsMultiple = linter.verify(code, { rules: { foobar: 2, barfoo: 1 } });
        });

        it("should report a problem", () => {
            assert.isNotNull(result);
            assert.isArray(results);
            assert.isObject(result);
            assert.property(result, "ruleId");
            assert.strictEqual(result.ruleId, "foobar");
        });

        it("should report that the rule does not exist", () => {
            assert.property(result, "message");
            assert.strictEqual(result.message, "Definition for rule 'foobar' was not found.");
        });

        it("should report at the correct severity", () => {
            assert.property(result, "severity");
            assert.strictEqual(result.severity, 2);
            assert.strictEqual(warningResult.severity, 2); // this is 2, since the rulename is very likely to be wrong
        });

        it("should accept any valid rule configuration", () => {
            assert.isObject(arrayOptionResults[0]);
            assert.isObject(objectOptionResults[0]);
        });

        it("should report multiple missing rules", () => {
            assert.isArray(resultsMultiple);

            assert.deepStrictEqual(
                resultsMultiple[1],
                {
                    ruleId: "barfoo",
                    message: "Definition for rule 'barfoo' was not found.",
                    line: 1,
                    column: 1,
                    endLine: 1,
                    endColumn: 2,
                    severity: 2,
                    nodeType: null
                }
            );
        });
    });

    describe("when calling getRules", () => {
        it("should return all loaded rules", () => {
            const rules = linter.getRules();

            assert.isAbove(rules.size, 0);
            assert.isObject(rules.get("lighter-http"));
        });
    });

    describe("when calling version", () => {
        it("should return current version number", () => {
            const version = linter.version;

            assert.isString(version);
            assert.isTrue(parseInt(version[0], 10) >= 0);
        });
    });

    describe("when evaluating an empty string", () => {
        it("runs rules", () => {
            linter.defineRule("no-programs", context => ({
                Program(node) {
                    context.report({ node, message: "No programs allowed." });
                }
            }));

            assert.strictEqual(
                linter.verify("", { rules: { "no-programs": "error" } }).length,
                1
            );
        });
    });

    describe("when evaluating code with comments to change config when allowInlineConfig is enabled", () => {

        it("should report a violation for global variable declarations", () => {
            const code = [
                "/* global foo */"
            ].join("\n");
            const config = {
                rules: {
                    test: 2
                }
            };
            let ok = false;

            linter.defineRules({
                test(context) {
                    return {
                        Program() {
                            const scope = context.getScope();
                            const sourceCode = context.getSourceCode();
                            const comments = sourceCode.getAllComments();

                            assert.strictEqual(1, comments.length);

                            const foo = getVariable(scope, "foo");

                            assert.notOk(foo);

                            ok = true;
                        }
                    };
                }
            });

            linter.verify(code, config, { allowInlineConfig: false });
            assert(ok);
        });

    });

    describe("when evaluating code with 'noInlineComment'", () => {
        for (const directive of [
            "globals foo",
            "global foo",
            "exported foo",
            "ec0lint lighter-http: error",
            "ec0lint-disable lighter-http",
            "ec0lint-disable-line lighter-http",
            "ec0lint-disable-next-line lighter-http",
            "ec0lint-enable lighter-http",
            "ec0lint-env es6"
        ]) {
            it(`should warn '/* ${directive} */' if 'noInlineConfig' was given.`, () => {
                const messages = linter.verify(`/* ${directive} */`, { noInlineConfig: true });
                const suppressedMessages = linter.getSuppressedMessages();

                assert.deepStrictEqual(messages.length, 1);
                assert.deepStrictEqual(messages[0].fatal, void 0);
                assert.deepStrictEqual(messages[0].ruleId, null);
                assert.deepStrictEqual(messages[0].severity, 1);
                assert.deepStrictEqual(messages[0].message, `'/*${directive.split(" ")[0]}*/' has no effect because you have 'noInlineConfig' setting in your config.`);

                assert.strictEqual(suppressedMessages.length, 0);
            });
        }

        for (const directive of [
            "ec0lint-disable-line lighter-http",
            "ec0lint-disable-next-line lighter-http"
        ]) {
            it(`should warn '// ${directive}' if 'noInlineConfig' was given.`, () => {
                const messages = linter.verify(`// ${directive}`, { noInlineConfig: true });
                const suppressedMessages = linter.getSuppressedMessages();

                assert.deepStrictEqual(messages.length, 1);
                assert.deepStrictEqual(messages[0].fatal, void 0);
                assert.deepStrictEqual(messages[0].ruleId, null);
                assert.deepStrictEqual(messages[0].severity, 1);
                assert.deepStrictEqual(messages[0].message, `'//${directive.split(" ")[0]}' has no effect because you have 'noInlineConfig' setting in your config.`);

                assert.strictEqual(suppressedMessages.length, 0);
            });
        }

        it("should not warn if 'noInlineConfig' and '--no-inline-config' were given.", () => {
            const messages = linter.verify("/* globals foo */", { noInlineConfig: true }, { allowInlineConfig: false });
            const suppressedMessages = linter.getSuppressedMessages();

            assert.deepStrictEqual(messages.length, 0);
            assert.strictEqual(suppressedMessages.length, 0);
        });
    });

    describe("when receiving cwd in options during instantiation", () => {
        const code = "a;\nb;";
        const config = { rules: { checker: "error" } };

        it("should get cwd correctly in the context", () => {
            const cwd = "cwd";
            const linterWithOption = new Linter({ cwd });
            let spy;

            linterWithOption.defineRule("checker", context => {
                spy = sinon.spy(() => {
                    assert.strictEqual(context.getCwd(), cwd);
                });
                return { Program: spy };
            });

            linterWithOption.verify(code, config);
            assert(spy && spy.calledOnce);
        });

        it("should assign process.cwd() to it if cwd is undefined", () => {
            let spy;
            const linterWithOption = new Linter({});

            linterWithOption.defineRule("checker", context => {

                spy = sinon.spy(() => {
                    assert.strictEqual(context.getCwd(), process.cwd());
                });
                return { Program: spy };
            });

            linterWithOption.verify(code, config);
            assert(spy && spy.calledOnce);
        });

        it("should assign process.cwd() to it if the option is undefined", () => {
            let spy;

            linter.defineRule("checker", context => {

                spy = sinon.spy(() => {
                    assert.strictEqual(context.getCwd(), process.cwd());
                });
                return { Program: spy };
            });

            linter.verify(code, config);
            assert(spy && spy.calledOnce);
        });
    });

    describe("reportUnusedDisable option", () => {
        it("reports problems for unused ec0lint-disable comments", () => {
            const messages = linter.verify("/* ec0lint-disable */", {}, { reportUnusedDisableDirectives: true });
            const suppressedMessages = linter.getSuppressedMessages();

            assert.deepStrictEqual(
                messages,
                [
                    {
                        ruleId: null,
                        message: "Unused ec0lint-disable directive (no problems were reported).",
                        line: 1,
                        column: 1,
                        fix: {
                            range: [0, 21],
                            text: " "
                        },
                        severity: 2,
                        nodeType: null
                    }
                ]
            );

            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("reports problems for unused ec0lint-disable comments (error)", () => {
            const messages = linter.verify("/* ec0lint-disable */", {}, { reportUnusedDisableDirectives: "error" });
            const suppressedMessages = linter.getSuppressedMessages();

            assert.deepStrictEqual(
                messages,
                [
                    {
                        ruleId: null,
                        message: "Unused ec0lint-disable directive (no problems were reported).",
                        line: 1,
                        column: 1,
                        fix: {
                            range: [0, 21],
                            text: " "
                        },
                        severity: 2,
                        nodeType: null
                    }
                ]
            );

            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("reports problems for unused ec0lint-disable comments (warn)", () => {
            const messages = linter.verify("/* ec0lint-disable */", {}, { reportUnusedDisableDirectives: "warn" });
            const suppressedMessages = linter.getSuppressedMessages();

            assert.deepStrictEqual(
                messages,
                [
                    {
                        ruleId: null,
                        message: "Unused ec0lint-disable directive (no problems were reported).",
                        line: 1,
                        column: 1,
                        fix: {
                            range: [0, 21],
                            text: " "
                        },
                        severity: 1,
                        nodeType: null
                    }
                ]
            );

            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("reports problems for unused ec0lint-disable comments (in config)", () => {
            const messages = linter.verify("/* ec0lint-disable */", { reportUnusedDisableDirectives: true });
            const suppressedMessages = linter.getSuppressedMessages();

            assert.deepStrictEqual(
                messages,
                [
                    {
                        ruleId: null,
                        message: "Unused ec0lint-disable directive (no problems were reported).",
                        line: 1,
                        column: 1,
                        fix: {
                            range: [0, 21],
                            text: " "
                        },
                        severity: 1,
                        nodeType: null
                    }
                ]
            );

            assert.strictEqual(suppressedMessages.length, 0);
        });

        describe("autofix", () => {
            const alwaysReportsRule = {
                create(context) {
                    return {
                        Program(node) {
                            context.report({ message: "bad code", loc: node.loc.end });
                        }
                    };
                }
            };

            const neverReportsRule = {
                create() {
                    return {};
                }
            };

            const ruleCount = 3;
            const usedRules = Array.from(
                { length: ruleCount },
                (_, index) => `used${index ? `-${index}` : ""}` // "used", "used-1", "used-2"
            );
            const unusedRules = usedRules.map(name => `un${name}`); // "unused", "unused-1", "unused-2"

            const config = {
                reportUnusedDisableDirectives: true,
                rules: {
                    ...Object.fromEntries(usedRules.map(name => [name, "error"])),
                    ...Object.fromEntries(unusedRules.map(name => [name, "error"]))
                }
            };

            beforeEach(() => {
                linter.defineRules(Object.fromEntries(usedRules.map(name => [name, alwaysReportsRule])));
                linter.defineRules(Object.fromEntries(unusedRules.map(name => [name, neverReportsRule])));
            });

            const tests = [

                //-----------------------------------------------
                // Removing the entire comment
                //-----------------------------------------------

                {
                    code: "// ec0lint-disable-line unused",
                    output: " "
                },
                {
                    code: "foo// ec0lint-disable-line unused",
                    output: "foo "
                },
                {
                    code: "// ec0lint-disable-line ,unused,",
                    output: " "
                },
                {
                    code: "// ec0lint-disable-line unused-1, unused-2",
                    output: " "
                },
                {
                    code: "// ec0lint-disable-line ,unused-1,, unused-2,, -- comment",
                    output: " "
                },
                {
                    code: "// ec0lint-disable-next-line unused\n",
                    output: " \n"
                },
                {
                    code: "// ec0lint-disable-next-line unused\nfoo",
                    output: " \nfoo"
                },
                {
                    code: "/* ec0lint-disable \nunused\n*/",
                    output: " "
                },

                //-----------------------------------------------
                // Removing only individual rules
                //-----------------------------------------------

                // content before the first rule should not be changed
                {
                    code: "//ec0lint-disable-line unused, used",
                    output: "//ec0lint-disable-line used"
                },
                {
                    code: "// ec0lint-disable-line unused, used",
                    output: "// ec0lint-disable-line used"
                },
                {
                    code: "//  ec0lint-disable-line unused, used",
                    output: "//  ec0lint-disable-line used"
                },
                {
                    code: "/*\nec0lint-disable unused, used*/",
                    output: "/*\nec0lint-disable used*/"
                },
                {
                    code: "/*\n ec0lint-disable unused, used*/",
                    output: "/*\n ec0lint-disable used*/"
                },
                {
                    code: "/*\r\nec0lint-disable unused, used*/",
                    output: "/*\r\nec0lint-disable used*/"
                },
                {
                    code: "/*\u2028ec0lint-disable unused, used*/",
                    output: "/*\u2028ec0lint-disable used*/"
                },
                {
                    code: "/*\u00A0ec0lint-disable unused, used*/",
                    output: "/*\u00A0ec0lint-disable used*/"
                },
                {
                    code: "// ec0lint-disable-line  unused, used",
                    output: "// ec0lint-disable-line  used"
                },
                {
                    code: "/* ec0lint-disable\nunused, used*/",
                    output: "/* ec0lint-disable\nused*/"
                },
                {
                    code: "/* ec0lint-disable\n unused, used*/",
                    output: "/* ec0lint-disable\n used*/"
                },
                {
                    code: "/* ec0lint-disable\r\nunused, used*/",
                    output: "/* ec0lint-disable\r\nused*/"
                },
                {
                    code: "/* ec0lint-disable\u2028unused, used*/",
                    output: "/* ec0lint-disable\u2028used*/"
                },
                {
                    code: "/* ec0lint-disable\u00A0unused, used*/",
                    output: "/* ec0lint-disable\u00A0used*/"
                },

                // when removing the first rule, the comma and all whitespace up to the next rule (or next lone comma) should also be removed
                {
                    code: "// ec0lint-disable-line unused,used",
                    output: "// ec0lint-disable-line used"
                },
                {
                    code: "// ec0lint-disable-line unused, used",
                    output: "// ec0lint-disable-line used"
                },
                {
                    code: "// ec0lint-disable-line unused , used",
                    output: "// ec0lint-disable-line used"
                },
                {
                    code: "// ec0lint-disable-line unused,  used",
                    output: "// ec0lint-disable-line used"
                },
                {
                    code: "// ec0lint-disable-line unused  ,used",
                    output: "// ec0lint-disable-line used"
                },
                {
                    code: "/* ec0lint-disable unused\n,\nused */",
                    output: "/* ec0lint-disable used */"
                },
                {
                    code: "/* ec0lint-disable unused \n \n,\n\n used */",
                    output: "/* ec0lint-disable used */"
                },
                {
                    code: "/* ec0lint-disable unused\u2028,\u2028used */",
                    output: "/* ec0lint-disable used */"
                },
                {
                    code: "// ec0lint-disable-line unused\u00A0,\u00A0used",
                    output: "// ec0lint-disable-line used"
                },
                {
                    code: "// ec0lint-disable-line unused,,used",
                    output: "// ec0lint-disable-line ,used"
                },
                {
                    code: "// ec0lint-disable-line unused, ,used",
                    output: "// ec0lint-disable-line ,used"
                },
                {
                    code: "// ec0lint-disable-line unused,, used",
                    output: "// ec0lint-disable-line , used"
                },
                {
                    code: "// ec0lint-disable-line unused,used ",
                    output: "// ec0lint-disable-line used "
                },
                {
                    code: "// ec0lint-disable-next-line unused,used\n",
                    output: "// ec0lint-disable-next-line used\n"
                },

                // when removing a rule in the middle, one comma and all whitespace between commas should also be removed
                {
                    code: "// ec0lint-disable-line used-1,unused,used-2",
                    output: "// ec0lint-disable-line used-1,used-2"
                },
                {
                    code: "// ec0lint-disable-line used-1, unused,used-2",
                    output: "// ec0lint-disable-line used-1,used-2"
                },
                {
                    code: "// ec0lint-disable-line used-1,unused ,used-2",
                    output: "// ec0lint-disable-line used-1,used-2"
                },
                {
                    code: "// ec0lint-disable-line used-1,  unused  ,used-2",
                    output: "// ec0lint-disable-line used-1,used-2"
                },
                {
                    code: "/* ec0lint-disable used-1,\nunused\n,used-2 */",
                    output: "/* ec0lint-disable used-1,used-2 */"
                },
                {
                    code: "/* ec0lint-disable used-1,\n\n unused \n \n ,used-2 */",
                    output: "/* ec0lint-disable used-1,used-2 */"
                },
                {
                    code: "/* ec0lint-disable used-1,\u2028unused\u2028,used-2 */",
                    output: "/* ec0lint-disable used-1,used-2 */"
                },
                {
                    code: "// ec0lint-disable-line used-1,\u00A0unused\u00A0,used-2",
                    output: "// ec0lint-disable-line used-1,used-2"
                },

                // when removing a rule in the middle, content around commas should not be changed
                {
                    code: "// ec0lint-disable-line used-1, unused ,used-2",
                    output: "// ec0lint-disable-line used-1,used-2"
                },
                {
                    code: "// ec0lint-disable-line used-1,unused, used-2",
                    output: "// ec0lint-disable-line used-1, used-2"
                },
                {
                    code: "// ec0lint-disable-line used-1 ,unused,used-2",
                    output: "// ec0lint-disable-line used-1 ,used-2"
                },
                {
                    code: "// ec0lint-disable-line used-1 ,unused, used-2",
                    output: "// ec0lint-disable-line used-1 , used-2"
                },
                {
                    code: "// ec0lint-disable-line used-1  , unused ,  used-2",
                    output: "// ec0lint-disable-line used-1  ,  used-2"
                },
                {
                    code: "/* ec0lint-disable used-1\n,unused,\nused-2 */",
                    output: "/* ec0lint-disable used-1\n,\nused-2 */"
                },
                {
                    code: "/* ec0lint-disable used-1\u2028,unused,\u2028used-2 */",
                    output: "/* ec0lint-disable used-1\u2028,\u2028used-2 */"
                },
                {
                    code: "// ec0lint-disable-line used-1\u00A0,unused,\u00A0used-2",
                    output: "// ec0lint-disable-line used-1\u00A0,\u00A0used-2"
                },
                {
                    code: "// ec0lint-disable-line , unused ,used",
                    output: "// ec0lint-disable-line ,used"
                },
                {
                    code: "/* ec0lint-disable\n, unused ,used */",
                    output: "/* ec0lint-disable\n,used */"
                },
                {
                    code: "/* ec0lint-disable used-1,\n,unused,used-2 */",
                    output: "/* ec0lint-disable used-1,\n,used-2 */"
                },
                {
                    code: "/* ec0lint-disable used-1,unused,\n,used-2 */",
                    output: "/* ec0lint-disable used-1,\n,used-2 */"
                },
                {
                    code: "/* ec0lint-disable used-1,\n,unused,\n,used-2 */",
                    output: "/* ec0lint-disable used-1,\n,\n,used-2 */"
                },
                {
                    code: "// ec0lint-disable-line used, unused,",
                    output: "// ec0lint-disable-line used,"
                },
                {
                    code: "// ec0lint-disable-next-line used, unused,\n",
                    output: "// ec0lint-disable-next-line used,\n"
                },
                {
                    code: "// ec0lint-disable-line used, unused, ",
                    output: "// ec0lint-disable-line used, "
                },
                {
                    code: "// ec0lint-disable-line used, unused, -- comment",
                    output: "// ec0lint-disable-line used, -- comment"
                },
                {
                    code: "/* ec0lint-disable used, unused,\n*/",
                    output: "/* ec0lint-disable used,\n*/"
                },

                // when removing the last rule, the comma and all whitespace up to the previous rule (or previous lone comma) should also be removed
                {
                    code: "// ec0lint-disable-line used,unused",
                    output: "// ec0lint-disable-line used"
                },
                {
                    code: "// ec0lint-disable-line used, unused",
                    output: "// ec0lint-disable-line used"
                },
                {
                    code: "// ec0lint-disable-line used ,unused",
                    output: "// ec0lint-disable-line used"
                },
                {
                    code: "// ec0lint-disable-line used , unused",
                    output: "// ec0lint-disable-line used"
                },
                {
                    code: "// ec0lint-disable-line used,  unused",
                    output: "// ec0lint-disable-line used"
                },
                {
                    code: "// ec0lint-disable-line used  ,unused",
                    output: "// ec0lint-disable-line used"
                },
                {
                    code: "/* ec0lint-disable used\n,\nunused */",
                    output: "/* ec0lint-disable used */"
                },
                {
                    code: "/* ec0lint-disable used \n \n,\n\n unused */",
                    output: "/* ec0lint-disable used */"
                },
                {
                    code: "/* ec0lint-disable used\u2028,\u2028unused */",
                    output: "/* ec0lint-disable used */"
                },
                {
                    code: "// ec0lint-disable-line used\u00A0,\u00A0unused",
                    output: "// ec0lint-disable-line used"
                },
                {
                    code: "// ec0lint-disable-line used,,unused",
                    output: "// ec0lint-disable-line used,"
                },
                {
                    code: "// ec0lint-disable-line used, ,unused",
                    output: "// ec0lint-disable-line used,"
                },
                {
                    code: "/* ec0lint-disable used,\n,unused */",
                    output: "/* ec0lint-disable used, */"
                },
                {
                    code: "/* ec0lint-disable used\n, ,unused */",
                    output: "/* ec0lint-disable used\n, */"
                },

                // content after the last rule should not be changed
                {
                    code: "// ec0lint-disable-line used,unused",
                    output: "// ec0lint-disable-line used"
                },
                {
                    code: "// ec0lint-disable-line used,unused ",
                    output: "// ec0lint-disable-line used "
                },
                {
                    code: "// ec0lint-disable-line used,unused  ",
                    output: "// ec0lint-disable-line used  "
                },
                {
                    code: "// ec0lint-disable-line used,unused -- comment",
                    output: "// ec0lint-disable-line used -- comment"
                },
                {
                    code: "// ec0lint-disable-next-line used,unused\n",
                    output: "// ec0lint-disable-next-line used\n"
                },
                {
                    code: "// ec0lint-disable-next-line used,unused \n",
                    output: "// ec0lint-disable-next-line used \n"
                },
                {
                    code: "/* ec0lint-disable used,unused\u2028*/",
                    output: "/* ec0lint-disable used\u2028*/"
                },
                {
                    code: "// ec0lint-disable-line used,unused\u00A0",
                    output: "// ec0lint-disable-line used\u00A0"
                },

                // multiply rules to remove
                {
                    code: "// ec0lint-disable-line used, unused-1, unused-2",
                    output: "// ec0lint-disable-line used"
                },
                {
                    code: "// ec0lint-disable-line unused-1, used, unused-2",
                    output: "// ec0lint-disable-line used"
                },
                {
                    code: "// ec0lint-disable-line unused-1, unused-2, used",
                    output: "// ec0lint-disable-line used"
                },
                {
                    code: "// ec0lint-disable-line used-1, unused-1, used-2, unused-2",
                    output: "// ec0lint-disable-line used-1, used-2"
                },
                {
                    code: "// ec0lint-disable-line unused-1, used-1, unused-2, used-2",
                    output: "// ec0lint-disable-line used-1, used-2"
                },
                {
                    code: `
                        /* ec0lint-disable unused-1,
                           used-1,
                           unused-2,
                           used-2
                        */
                    `,
                    output: `
                        /* ec0lint-disable used-1,
                           used-2
                        */
                    `
                },
                {
                    code: `
                        /* ec0lint-disable
                               unused-1,
                               used-1,
                               unused-2,
                               used-2
                        */
                    `,
                    output: `
                        /* ec0lint-disable
                               used-1,
                               used-2
                        */
                    `
                },
                {
                    code: `
                        /* ec0lint-disable
                               used-1,
                               unused-1,
                               used-2,
                               unused-2
                        */
                    `,
                    output: `
                        /* ec0lint-disable
                               used-1,
                               used-2
                        */
                    `
                },
                {
                    code: `
                        /* ec0lint-disable
                               used-1,
                               unused-1,
                               used-2,
                               unused-2,
                        */
                    `,
                    output: `
                        /* ec0lint-disable
                               used-1,
                               used-2,
                        */
                    `
                },
                {
                    code: `
                        /* ec0lint-disable
                               ,unused-1
                               ,used-1
                               ,unused-2
                               ,used-2
                        */
                    `,
                    output: `
                        /* ec0lint-disable
                               ,used-1
                               ,used-2
                        */
                    `
                },
                {
                    code: `
                        /* ec0lint-disable
                               ,used-1
                               ,unused-1
                               ,used-2
                               ,unused-2
                        */
                    `,
                    output: `
                        /* ec0lint-disable
                               ,used-1
                               ,used-2
                        */
                    `
                },
                {
                    code: `
                        /* ec0lint-disable
                               used-1,
                               unused-1,
                               used-2,
                               unused-2

                               -- comment
                        */
                    `,
                    output: `
                        /* ec0lint-disable
                               used-1,
                               used-2

                               -- comment
                        */
                    `
                },

                // duplicates in the list
                {
                    code: "// ec0lint-disable-line unused, unused, used",
                    output: "// ec0lint-disable-line used"
                },
                {
                    code: "// ec0lint-disable-line unused, used, unused",
                    output: "// ec0lint-disable-line used"
                },
                {
                    code: "// ec0lint-disable-line used, unused, unused, used",
                    output: "// ec0lint-disable-line used, used"
                }
            ];

            for (const { code, output } of tests) {
                it(code, () => {
                    assert.strictEqual(
                        linter.verifyAndFix(code, config).output,
                        output
                    );
                });
            }
        });
    });

    describe("when evaluating code with hashbang", () => {
        it("should comment hashbang without breaking offset", () => {
            const code = "#!/usr/bin/env node\n'123';";
            const config = { rules: { checker: "error" } };
            let spy;

            linter.defineRule("checker", context => {
                spy = sinon.spy(node => {
                    assert.strictEqual(context.getSource(node), "'123';");
                });
                return { ExpressionStatement: spy };
            });

            linter.verify(code, config);
            assert(spy && spy.calledOnce);
        });
    });

    describe("verify()", () => {
        describe("filenames", () => {
            it("should allow filename to be passed on options object", () => {
                const filenameChecker = sinon.spy(context => {
                    assert.strictEqual(context.getFilename(), "foo.js");
                    return {};
                });

                linter.defineRule("checker", filenameChecker);
                linter.verify("foo;", { rules: { checker: "error" } }, { filename: "foo.js" });
                assert(filenameChecker.calledOnce);
            });

            it("should allow filename to be passed as third argument", () => {
                const filenameChecker = sinon.spy(context => {
                    assert.strictEqual(context.getFilename(), "bar.js");
                    return {};
                });

                linter.defineRule("checker", filenameChecker);
                linter.verify("foo;", { rules: { checker: "error" } }, "bar.js");
                assert(filenameChecker.calledOnce);
            });

            it("should default filename to <input> when options object doesn't have filename", () => {
                const filenameChecker = sinon.spy(context => {
                    assert.strictEqual(context.getFilename(), "<input>");
                    return {};
                });

                linter.defineRule("checker", filenameChecker);
                linter.verify("foo;", { rules: { checker: "error" } }, {});
                assert(filenameChecker.calledOnce);
            });

            it("should default filename to <input> when only two arguments are passed", () => {
                const filenameChecker = sinon.spy(context => {
                    assert.strictEqual(context.getFilename(), "<input>");
                    return {};
                });

                linter.defineRule("checker", filenameChecker);
                linter.verify("foo;", { rules: { checker: "error" } });
                assert(filenameChecker.calledOnce);
            });
        });

        describe("physicalFilenames", () => {
            it("should be same as `filename` passed on options object, if no processors are used", () => {
                const physicalFilenameChecker = sinon.spy(context => {
                    assert.strictEqual(context.getPhysicalFilename(), "foo.js");
                    return {};
                });

                linter.defineRule("checker", physicalFilenameChecker);
                linter.verify("foo;", { rules: { checker: "error" } }, { filename: "foo.js" });
                assert(physicalFilenameChecker.calledOnce);
            });

            it("should default physicalFilename to <input> when options object doesn't have filename", () => {
                const physicalFilenameChecker = sinon.spy(context => {
                    assert.strictEqual(context.getPhysicalFilename(), "<input>");
                    return {};
                });

                linter.defineRule("checker", physicalFilenameChecker);
                linter.verify("foo;", { rules: { checker: "error" } }, {});
                assert(physicalFilenameChecker.calledOnce);
            });

            it("should default physicalFilename to <input> when only two arguments are passed", () => {
                const physicalFilenameChecker = sinon.spy(context => {
                    assert.strictEqual(context.getPhysicalFilename(), "<input>");
                    return {};
                });

                linter.defineRule("checker", physicalFilenameChecker);
                linter.verify("foo;", { rules: { checker: "error" } });
                assert(physicalFilenameChecker.calledOnce);
            });
        });

        describe("ecmaVersion", () => {

            it("should not support ES6 when no ecmaVersion provided", () => {
                const messages = linter.verify("let x = 0;");
                const suppressedMessages = linter.getSuppressedMessages();

                assert.strictEqual(messages.length, 1);
                assert.strictEqual(suppressedMessages.length, 0);
            });

            it("supports ECMAScript version 'latest'", () => {
                const messages = linter.verify("let x = 5 ** 7;", {
                    parserOptions: { ecmaVersion: "latest" }
                });
                const suppressedMessages = linter.getSuppressedMessages();

                assert.strictEqual(messages.length, 0);
                assert.strictEqual(suppressedMessages.length, 0);
            });

            it("the 'latest' is equal to espree.latestEcmaVersion", () => {
                let ecmaVersion = null;
                const config = { rules: { "ecma-version": 2 }, parserOptions: { ecmaVersion: "latest" } };

                linter.defineRule("ecma-version", context => ({
                    Program() {
                        ecmaVersion = context.parserOptions.ecmaVersion;
                    }
                }));
                linter.verify("", config);
                assert.strictEqual(ecmaVersion, espree.latestEcmaVersion, "ecmaVersion should be 13");
            });

            it("the 'latest' is not normalized for custom parsers", () => {
                let ecmaVersion = null;
                const config = { rules: { "ecma-version": 2 }, parser: "custom-parser", parserOptions: { ecmaVersion: "latest" } };

                linter.defineParser("custom-parser", testParsers.enhancedParser);
                linter.defineRule("ecma-version", context => ({
                    Program() {
                        ecmaVersion = context.parserOptions.ecmaVersion;
                    }
                }));
                linter.verify("", config);
                assert.strictEqual(ecmaVersion, "latest", "ecmaVersion should be latest");
            });

            it("the 'latest' is equal to espree.latestEcmaVersion on languageOptions", () => {
                let ecmaVersion = null;
                const config = { rules: { "ecma-version": 2 }, parserOptions: { ecmaVersion: "latest" } };

                linter.defineRule("ecma-version", context => ({
                    Program() {
                        ecmaVersion = context.languageOptions.ecmaVersion;
                    }
                }));
                linter.verify("", config);
                assert.strictEqual(ecmaVersion, espree.latestEcmaVersion + 2009, "ecmaVersion should be 2022");
            });

            it("the 'next' is equal to espree.latestEcmaVersion on languageOptions with custom parser", () => {
                let ecmaVersion = null;
                const config = { rules: { "ecma-version": 2 }, parser: "custom-parser", parserOptions: { ecmaVersion: "next" } };

                linter.defineParser("custom-parser", testParsers.stubParser);
                linter.defineRule("ecma-version", context => ({
                    Program() {
                        ecmaVersion = context.languageOptions.ecmaVersion;
                    }
                }));
                linter.verify("", config);
                assert.strictEqual(ecmaVersion, espree.latestEcmaVersion + 2009, "ecmaVersion should be 2022");
            });

            it("missing ecmaVersion is equal to 5 on languageOptions with custom parser", () => {
                let ecmaVersion = null;
                const config = { rules: { "ecma-version": 2 }, parser: "custom-parser" };

                linter.defineParser("custom-parser", testParsers.enhancedParser);
                linter.defineRule("ecma-version", context => ({
                    Program() {
                        ecmaVersion = context.languageOptions.ecmaVersion;
                    }
                }));
                linter.verify("", config);
                assert.strictEqual(ecmaVersion, 5, "ecmaVersion should be 5");
            });

            it("should pass normalized ecmaVersion to ec0lint-scope", () => {
                let blockScope = null;

                linter.defineRule("block-scope", context => ({
                    BlockStatement() {
                        blockScope = context.getScope();
                    }
                }));
                linter.defineParser("custom-parser", {
                    parse: (...args) => espree.parse(...args)
                });

                // Use standard parser
                linter.verify("{}", {
                    rules: { "block-scope": 2 },
                    parserOptions: { ecmaVersion: "latest" }
                });

                assert.strictEqual(blockScope.type, "block");

                linter.verify("{}", {
                    rules: { "block-scope": 2 },
                    parserOptions: {} // ecmaVersion defaults to 5
                });
                assert.strictEqual(blockScope.type, "global");

                // Use custom parser
                linter.verify("{}", {
                    rules: { "block-scope": 2 },
                    parser: "custom-parser",
                    parserOptions: { ecmaVersion: "latest" }
                });

                assert.strictEqual(blockScope.type, "block");

                linter.verify("{}", {
                    rules: { "block-scope": 2 },
                    parser: "custom-parser",
                    parserOptions: {} // ecmaVersion defaults to 5
                });
                assert.strictEqual(blockScope.type, "global");
            });

            describe("it should properly parse let declaration when", () => {
                it("the ECMAScript version number is 6", () => {
                    const messages = linter.verify("let x = 5;", {
                        parserOptions: {
                            ecmaVersion: 6
                        }
                    });
                    const suppressedMessages = linter.getSuppressedMessages();

                    assert.strictEqual(messages.length, 0);
                    assert.strictEqual(suppressedMessages.length, 0);
                });

                it("the ECMAScript version number is 2015", () => {
                    const messages = linter.verify("let x = 5;", {
                        parserOptions: {
                            ecmaVersion: 2015
                        }
                    });
                    const suppressedMessages = linter.getSuppressedMessages();

                    assert.strictEqual(messages.length, 0);
                    assert.strictEqual(suppressedMessages.length, 0);
                });
            });

            it("should fail to parse exponentiation operator when the ECMAScript version number is 2015", () => {
                const messages = linter.verify("x ** y;", {
                    parserOptions: {
                        ecmaVersion: 2015
                    }
                });
                const suppressedMessages = linter.getSuppressedMessages();

                assert.strictEqual(messages.length, 1);
                assert.strictEqual(suppressedMessages.length, 0);
            });

            describe("should properly parse exponentiation operator when", () => {
                it("the ECMAScript version number is 7", () => {
                    const messages = linter.verify("x ** y;", {
                        parserOptions: {
                            ecmaVersion: 7
                        }
                    });
                    const suppressedMessages = linter.getSuppressedMessages();

                    assert.strictEqual(messages.length, 0);
                    assert.strictEqual(suppressedMessages.length, 0);
                });

                it("the ECMAScript version number is 2016", () => {
                    const messages = linter.verify("x ** y;", {
                        parserOptions: {
                            ecmaVersion: 2016
                        }
                    });
                    const suppressedMessages = linter.getSuppressedMessages();

                    assert.strictEqual(messages.length, 0);
                    assert.strictEqual(suppressedMessages.length, 0);
                });
            });
        });

        it("should properly parse object spread when ecmaVersion is 2018", () => {

            const messages = linter.verify("var x = { ...y };", {
                parserOptions: {
                    ecmaVersion: 2018
                }
            }, filename);
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 0);
            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should properly parse global return when passed ecmaFeatures", () => {

            const messages = linter.verify("return;", {
                parserOptions: {
                    ecmaFeatures: {
                        globalReturn: true
                    }
                }
            }, filename);
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 0);
            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should properly parse global return when in Node.js environment", () => {

            const messages = linter.verify("return;", {
                env: {
                    node: true
                }
            }, filename);
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 0);
            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should not parse global return when in Node.js environment with globalReturn explicitly off", () => {

            const messages = linter.verify("return;", {
                env: {
                    node: true
                },
                parserOptions: {
                    ecmaFeatures: {
                        globalReturn: false
                    }
                }
            }, filename);
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 1);
            assert.strictEqual(messages[0].message, "Parsing error: 'return' outside of function");

            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should not parse global return when Node.js environment is false", () => {

            const messages = linter.verify("return;", {}, filename);
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 1);
            assert.strictEqual(messages[0].message, "Parsing error: 'return' outside of function");

            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should properly parse sloppy-mode code when impliedStrict is false", () => {

            const messages = linter.verify("var private;", {}, filename);
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 0);
            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should not parse sloppy-mode code when impliedStrict is true", () => {

            const messages = linter.verify("var private;", {
                parserOptions: {
                    ecmaFeatures: {
                        impliedStrict: true
                    }
                }
            }, filename);
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 1);
            assert.strictEqual(messages[0].message, "Parsing error: The keyword 'private' is reserved");

            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should properly parse valid code when impliedStrict is true", () => {

            const messages = linter.verify("var foo;", {
                parserOptions: {
                    ecmaFeatures: {
                        impliedStrict: true
                    }
                }
            }, filename);
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 0);
            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should properly parse JSX when passed ecmaFeatures", () => {

            const messages = linter.verify("var x = <div/>;", {
                parserOptions: {
                    ecmaFeatures: {
                        jsx: true
                    }
                }
            }, filename);
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 0);
            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should report an error when JSX code is encountered and JSX is not enabled", () => {
            const code = "var myDivElement = <div className=\"foo\" />;";
            const messages = linter.verify(code, {}, "filename");
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 1);
            assert.strictEqual(messages[0].line, 1);
            assert.strictEqual(messages[0].column, 20);
            assert.strictEqual(messages[0].message, "Parsing error: Unexpected token <");

            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should not report an error when JSX code is encountered and JSX is enabled", () => {
            const code = "var myDivElement = <div className=\"foo\" />;";
            const messages = linter.verify(code, { parserOptions: { ecmaFeatures: { jsx: true } } }, "filename");
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 0);
            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should not report an error when JSX code contains a spread operator and JSX is enabled", () => {
            const code = "var myDivElement = <div {...this.props} />;";
            const messages = linter.verify(code, { parserOptions: { ecmaVersion: 6, ecmaFeatures: { jsx: true } } }, "filename");
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 0);
            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should not allow the use of reserved words as variable names in ES3", () => {
            const code = "var char;";
            const messages = linter.verify(code, { parserOptions: { ecmaVersion: 3 } }, filename);
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 1);
            assert.strictEqual(messages[0].severity, 2);
            assert.isTrue(messages[0].fatal);
            assert.match(messages[0].message, /^Parsing error:.*'char'/u);

            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should not allow the use of reserved words as property names in member expressions in ES3", () => {
            const code = "obj.char;";
            const messages = linter.verify(code, { parserOptions: { ecmaVersion: 3 } }, filename);
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 1);
            assert.strictEqual(messages[0].severity, 2);
            assert.isTrue(messages[0].fatal);
            assert.match(messages[0].message, /^Parsing error:.*'char'/u);

            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should not allow the use of reserved words as property names in object literals in ES3", () => {
            const code = "var obj = { char: 1 };";
            const messages = linter.verify(code, { parserOptions: { ecmaVersion: 3 } }, filename);
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 1);
            assert.strictEqual(messages[0].severity, 2);
            assert.isTrue(messages[0].fatal);
            assert.match(messages[0].message, /^Parsing error:.*'char'/u);

            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should allow the use of reserved words as variable and property names in ES3 when allowReserved is true", () => {
            const code = "var char; obj.char; var obj = { char: 1 };";
            const messages = linter.verify(code, { parserOptions: { ecmaVersion: 3, allowReserved: true } }, filename);
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 0);
            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should not allow the use of reserved words as variable names in ES > 3", () => {
            const ecmaVersions = [void 0, ...espree.supportedEcmaVersions.filter(ecmaVersion => ecmaVersion > 3)];

            ecmaVersions.forEach(ecmaVersion => {
                const code = "var enum;";
                const messages = linter.verify(code, { parserOptions: { ecmaVersion } }, filename);
                const suppressedMessages = linter.getSuppressedMessages();

                assert.strictEqual(messages.length, 1);
                assert.strictEqual(messages[0].severity, 2);
                assert.isTrue(messages[0].fatal);
                assert.match(messages[0].message, /^Parsing error:.*'enum'/u);

                assert.strictEqual(suppressedMessages.length, 0);
            });
        });

        it("should allow the use of reserved words as property names in ES > 3", () => {
            const ecmaVersions = [void 0, ...espree.supportedEcmaVersions.filter(ecmaVersion => ecmaVersion > 3)];

            ecmaVersions.forEach(ecmaVersion => {
                const code = "obj.enum; obj.function; var obj = { enum: 1, function: 2 };";
                const messages = linter.verify(code, { parserOptions: { ecmaVersion } }, filename);
                const suppressedMessages = linter.getSuppressedMessages();

                assert.strictEqual(messages.length, 0);
                assert.strictEqual(suppressedMessages.length, 0);
            });
        });

        it("should not allow `allowReserved: true` in ES > 3", () => {
            const ecmaVersions = [void 0, ...espree.supportedEcmaVersions.filter(ecmaVersion => ecmaVersion > 3)];

            ecmaVersions.forEach(ecmaVersion => {
                const code = "";
                const messages = linter.verify(code, { parserOptions: { ecmaVersion, allowReserved: true } }, filename);
                const suppressedMessages = linter.getSuppressedMessages();

                assert.strictEqual(messages.length, 1);
                assert.strictEqual(messages[0].severity, 2);
                assert.isTrue(messages[0].fatal);
                assert.match(messages[0].message, /^Parsing error:.*allowReserved/u);

                assert.strictEqual(suppressedMessages.length, 0);
            });
        });

        it("should be able to use es6 features if there is a comment which has \"ec0lint-env es6\"", () => {
            const code = [
                "/* ec0lint-env es6 */",
                "var arrow = () => 0;",
                "var binary = 0b1010;",
                "{ let a = 0; const b = 1; }",
                "class A {}",
                "function defaultParams(a = 0) {}",
                "var {a = 1, b = 2} = {};",
                "for (var a of []) {}",
                "function* generator() { yield 0; }",
                "var computed = {[a]: 0};",
                "var duplicate = {dup: 0, dup: 1};",
                "var method = {foo() {}};",
                "var property = {a, b};",
                "var octal = 0o755;",
                "var u = /^.$/u.test('𠮷');",
                "var y = /hello/y.test('hello');",
                "function restParam(a, ...rest) {}",
                "class B { superInFunc() { super.foo(); } }",
                "var template = `hello, ${a}`;",
                "var unicode = '\\u{20BB7}';"
            ].join("\n");

            const messages = linter.verify(code, null, "ec0lint-env es6");
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 0);
            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should be able to return in global if there is a comment which enables the node environment with a comment", () => {
            const messages = linter.verify(`/* ${ESLINT_ENV} node */ return;`, null, "node environment");
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 0);
            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should attach a \"/*global\" comment node to declared variables", () => {
            const code = "/* global foo */\n/* global bar, baz */";
            let ok = false;

            linter.defineRules({
                test(context) {
                    return {
                        Program() {
                            const scope = context.getScope();
                            const sourceCode = context.getSourceCode();
                            const comments = sourceCode.getAllComments();

                            assert.strictEqual(2, comments.length);

                            const foo = getVariable(scope, "foo");

                            assert.strictEqual(foo.eslintExplicitGlobal, true);
                            assert.strictEqual(foo.eslintExplicitGlobalComments[0], comments[0]);

                            const bar = getVariable(scope, "bar");

                            assert.strictEqual(bar.eslintExplicitGlobal, true);
                            assert.strictEqual(bar.eslintExplicitGlobalComments[0], comments[1]);

                            const baz = getVariable(scope, "baz");

                            assert.strictEqual(baz.eslintExplicitGlobal, true);
                            assert.strictEqual(baz.eslintExplicitGlobalComments[0], comments[1]);

                            ok = true;
                        }
                    };
                }
            });

            linter.verify(code, { rules: { test: 2 } });
            assert(ok);
        });

        it("should not crash when we reuse the SourceCode object", () => {
            linter.verify("function render() { return <div className='test'>{hello}</div> }", { parserOptions: { ecmaVersion: 6, ecmaFeatures: { jsx: true } } });
            linter.verify(linter.getSourceCode(), { parserOptions: { ecmaVersion: 6, ecmaFeatures: { jsx: true } } });
        });

        it("should reuse the SourceCode object", () => {
            let ast1 = null,
                ast2 = null;

            linter.defineRule("save-ast1", () => ({
                Program(node) {
                    ast1 = node;
                }
            }));
            linter.defineRule("save-ast2", () => ({
                Program(node) {
                    ast2 = node;
                }
            }));

            linter.verify("function render() { return <div className='test'>{hello}</div> }", { parserOptions: { ecmaVersion: 6, ecmaFeatures: { jsx: true } }, rules: { "save-ast1": 2 } });
            linter.verify(linter.getSourceCode(), { parserOptions: { ecmaVersion: 6, ecmaFeatures: { jsx: true } }, rules: { "save-ast2": 2 } });

            assert(ast1 !== null);
            assert(ast2 !== null);
            assert(ast1 === ast2);
        });

        it("should allow 'await' as a property name in modules", () => {
            const result = linter.verify(
                "obj.await",
                { parserOptions: { ecmaVersion: 6, sourceType: "module" } }
            );
            const suppressedMessages = linter.getSuppressedMessages();

            assert(result.length === 0);
            assert.strictEqual(suppressedMessages.length, 0);
        });


        it("should not modify config object passed as argument", () => {
            const config = {};

            Object.freeze(config);
            linter.verify("var", config);
        });

        it("should pass 'id' to rule contexts with the rule id", () => {
            const spy = sinon.spy(context => {
                assert.strictEqual(context.id, "foo-bar-baz");
                return {};
            });

            linter.defineRule("foo-bar-baz", spy);
            linter.verify("x", { rules: { "foo-bar-baz": "error" } });
            assert(spy.calledOnce);
        });

        describe("descriptions in directive comments", () => {
            it("should ignore the part preceded by '--' in '/*ec0lint*/'.", () => {
                const aaa = sinon.stub().returns({});
                const bbb = sinon.stub().returns({});

                linter.defineRule("aaa", { create: aaa });
                linter.defineRule("bbb", { create: bbb });
                const messages = linter.verify(`
                    /*ec0lint aaa:error -- bbb:error */
                    console.log("hello")
                `, {});
                const suppressedMessages = linter.getSuppressedMessages();

                // Don't include syntax error of the comment.
                assert.deepStrictEqual(messages, []);

                // Use only `aaa`.
                assert.strictEqual(aaa.callCount, 1);
                assert.strictEqual(bbb.callCount, 0);

                assert.strictEqual(suppressedMessages.length, 0);
            });

            it("should not ignore the part preceded by '--' if the '--' is not surrounded by whitespaces.", () => {
                const rule = sinon.stub().returns({});

                linter.defineRule("a--rule", { create: rule });
                const messages = linter.verify(`
                    /*ec0lint a--rule:error */
                    console.log("hello")
                `, {});
                const suppressedMessages = linter.getSuppressedMessages();

                // Don't include syntax error of the comment.
                assert.deepStrictEqual(messages, []);

                // Use `a--rule`.
                assert.strictEqual(rule.callCount, 1);

                assert.strictEqual(suppressedMessages.length, 0);
            });

            it("should ignore the part preceded by '--' even if the '--' is longer than 2.", () => {
                const aaa = sinon.stub().returns({});
                const bbb = sinon.stub().returns({});

                linter.defineRule("aaa", { create: aaa });
                linter.defineRule("bbb", { create: bbb });
                const messages = linter.verify(`
                    /*ec0lint aaa:error -------- bbb:error */
                    console.log("hello")
                `, {});
                const suppressedMessages = linter.getSuppressedMessages();

                // Don't include syntax error of the comment.
                assert.deepStrictEqual(messages, []);

                // Use only `aaa`.
                assert.strictEqual(aaa.callCount, 1);
                assert.strictEqual(bbb.callCount, 0);

                assert.strictEqual(suppressedMessages.length, 0);
            });

            it("should ignore the part preceded by '--' with line breaks.", () => {
                const aaa = sinon.stub().returns({});
                const bbb = sinon.stub().returns({});

                linter.defineRule("aaa", { create: aaa });
                linter.defineRule("bbb", { create: bbb });
                const messages = linter.verify(`
                    /*ec0lint aaa:error
                        --------
                        bbb:error */
                    console.log("hello")
                `, {});
                const suppressedMessages = linter.getSuppressedMessages();

                // Don't include syntax error of the comment.
                assert.deepStrictEqual(messages, []);

                // Use only `aaa`.
                assert.strictEqual(aaa.callCount, 1);
                assert.strictEqual(bbb.callCount, 0);

                assert.strictEqual(suppressedMessages.length, 0);
            });
        });
    });

    describe("context.getScope()", () => {

        /**
         * Get the scope on the node `astSelector` specified.
         * @param {string} code The source code to verify.
         * @param {string} astSelector The AST selector to get scope.
         * @param {number} [ecmaVersion=5] The ECMAScript version.
         * @returns {{node: ASTNode, scope: escope.Scope}} Gotten scope.
         */
        function getScope(code, astSelector, ecmaVersion = 5) {
            let node, scope;

            linter.defineRule("get-scope", context => ({
                [astSelector](node0) {
                    node = node0;
                    scope = context.getScope();
                }
            }));
            linter.verify(
                code,
                {
                    parserOptions: { ecmaVersion },
                    rules: { "get-scope": 2 }
                }
            );

            return { node, scope };
        }

        it("should return 'function' scope on FunctionDeclaration (ES5)", () => {
            const { node, scope } = getScope("function f() {}", "FunctionDeclaration");

            assert.strictEqual(scope.type, "function");
            assert.strictEqual(scope.block, node);
        });

        it("should return 'function' scope on FunctionExpression (ES5)", () => {
            const { node, scope } = getScope("!function f() {}", "FunctionExpression");

            assert.strictEqual(scope.type, "function");
            assert.strictEqual(scope.block, node);
        });

        it("should return 'function' scope on the body of FunctionDeclaration (ES5)", () => {
            const { node, scope } = getScope("function f() {}", "BlockStatement");

            assert.strictEqual(scope.type, "function");
            assert.strictEqual(scope.block, node.parent);
        });

        it("should return 'function' scope on the body of FunctionDeclaration (ES2015)", () => {
            const { node, scope } = getScope("function f() {}", "BlockStatement", 2015);

            assert.strictEqual(scope.type, "function");
            assert.strictEqual(scope.block, node.parent);
        });

        it("should return 'function' scope on BlockStatement in functions (ES5)", () => {
            const { node, scope } = getScope("function f() { { var b; } }", "BlockStatement > BlockStatement");

            assert.strictEqual(scope.type, "function");
            assert.strictEqual(scope.block, node.parent.parent);
            assert.deepStrictEqual(scope.variables.map(v => v.name), ["arguments", "b"]);
        });

        it("should return 'block' scope on BlockStatement in functions (ES2015)", () => {
            const { node, scope } = getScope("function f() { { let a; var b; } }", "BlockStatement > BlockStatement", 2015);

            assert.strictEqual(scope.type, "block");
            assert.strictEqual(scope.upper.type, "function");
            assert.strictEqual(scope.block, node);
            assert.deepStrictEqual(scope.variables.map(v => v.name), ["a"]);
            assert.deepStrictEqual(scope.variableScope.variables.map(v => v.name), ["arguments", "b"]);
        });

        it("should return 'block' scope on nested BlockStatement in functions (ES2015)", () => {
            const { node, scope } = getScope("function f() { { let a; { let b; var c; } } }", "BlockStatement > BlockStatement > BlockStatement", 2015);

            assert.strictEqual(scope.type, "block");
            assert.strictEqual(scope.upper.type, "block");
            assert.strictEqual(scope.upper.upper.type, "function");
            assert.strictEqual(scope.block, node);
            assert.deepStrictEqual(scope.variables.map(v => v.name), ["b"]);
            assert.deepStrictEqual(scope.upper.variables.map(v => v.name), ["a"]);
            assert.deepStrictEqual(scope.variableScope.variables.map(v => v.name), ["arguments", "c"]);
        });

        it("should return 'function' scope on SwitchStatement in functions (ES5)", () => {
            const { node, scope } = getScope("function f() { switch (a) { case 0: var b; } }", "SwitchStatement");

            assert.strictEqual(scope.type, "function");
            assert.strictEqual(scope.block, node.parent.parent);
            assert.deepStrictEqual(scope.variables.map(v => v.name), ["arguments", "b"]);
        });

        it("should return 'switch' scope on SwitchStatement in functions (ES2015)", () => {
            const { node, scope } = getScope("function f() { switch (a) { case 0: let b; } }", "SwitchStatement", 2015);

            assert.strictEqual(scope.type, "switch");
            assert.strictEqual(scope.block, node);
            assert.deepStrictEqual(scope.variables.map(v => v.name), ["b"]);
        });

        it("should return 'function' scope on SwitchCase in functions (ES5)", () => {
            const { node, scope } = getScope("function f() { switch (a) { case 0: var b; } }", "SwitchCase");

            assert.strictEqual(scope.type, "function");
            assert.strictEqual(scope.block, node.parent.parent.parent);
            assert.deepStrictEqual(scope.variables.map(v => v.name), ["arguments", "b"]);
        });

        it("should return 'switch' scope on SwitchCase in functions (ES2015)", () => {
            const { node, scope } = getScope("function f() { switch (a) { case 0: let b; } }", "SwitchCase", 2015);

            assert.strictEqual(scope.type, "switch");
            assert.strictEqual(scope.block, node.parent);
            assert.deepStrictEqual(scope.variables.map(v => v.name), ["b"]);
        });

        it("should return 'catch' scope on CatchClause in functions (ES5)", () => {
            const { node, scope } = getScope("function f() { try {} catch (e) { var a; } }", "CatchClause");

            assert.strictEqual(scope.type, "catch");
            assert.strictEqual(scope.block, node);
            assert.deepStrictEqual(scope.variables.map(v => v.name), ["e"]);
        });

        it("should return 'catch' scope on CatchClause in functions (ES2015)", () => {
            const { node, scope } = getScope("function f() { try {} catch (e) { let a; } }", "CatchClause", 2015);

            assert.strictEqual(scope.type, "catch");
            assert.strictEqual(scope.block, node);
            assert.deepStrictEqual(scope.variables.map(v => v.name), ["e"]);
        });

        it("should return 'catch' scope on the block of CatchClause in functions (ES5)", () => {
            const { node, scope } = getScope("function f() { try {} catch (e) { var a; } }", "CatchClause > BlockStatement");

            assert.strictEqual(scope.type, "catch");
            assert.strictEqual(scope.block, node.parent);
            assert.deepStrictEqual(scope.variables.map(v => v.name), ["e"]);
        });

        it("should return 'block' scope on the block of CatchClause in functions (ES2015)", () => {
            const { node, scope } = getScope("function f() { try {} catch (e) { let a; } }", "CatchClause > BlockStatement", 2015);

            assert.strictEqual(scope.type, "block");
            assert.strictEqual(scope.block, node);
            assert.deepStrictEqual(scope.variables.map(v => v.name), ["a"]);
        });

        it("should return 'function' scope on ForStatement in functions (ES5)", () => {
            const { node, scope } = getScope("function f() { for (var i = 0; i < 10; ++i) {} }", "ForStatement");

            assert.strictEqual(scope.type, "function");
            assert.strictEqual(scope.block, node.parent.parent);
            assert.deepStrictEqual(scope.variables.map(v => v.name), ["arguments", "i"]);
        });

        it("should return 'for' scope on ForStatement in functions (ES2015)", () => {
            const { node, scope } = getScope("function f() { for (let i = 0; i < 10; ++i) {} }", "ForStatement", 2015);

            assert.strictEqual(scope.type, "for");
            assert.strictEqual(scope.block, node);
            assert.deepStrictEqual(scope.variables.map(v => v.name), ["i"]);
        });

        it("should return 'function' scope on the block body of ForStatement in functions (ES5)", () => {
            const { node, scope } = getScope("function f() { for (var i = 0; i < 10; ++i) {} }", "ForStatement > BlockStatement");

            assert.strictEqual(scope.type, "function");
            assert.strictEqual(scope.block, node.parent.parent.parent);
            assert.deepStrictEqual(scope.variables.map(v => v.name), ["arguments", "i"]);
        });

        it("should return 'block' scope on the block body of ForStatement in functions (ES2015)", () => {
            const { node, scope } = getScope("function f() { for (let i = 0; i < 10; ++i) {} }", "ForStatement > BlockStatement", 2015);

            assert.strictEqual(scope.type, "block");
            assert.strictEqual(scope.upper.type, "for");
            assert.strictEqual(scope.block, node);
            assert.deepStrictEqual(scope.variables.map(v => v.name), []);
            assert.deepStrictEqual(scope.upper.variables.map(v => v.name), ["i"]);
        });

        it("should return 'function' scope on ForInStatement in functions (ES5)", () => {
            const { node, scope } = getScope("function f() { for (var key in obj) {} }", "ForInStatement");

            assert.strictEqual(scope.type, "function");
            assert.strictEqual(scope.block, node.parent.parent);
            assert.deepStrictEqual(scope.variables.map(v => v.name), ["arguments", "key"]);
        });

        it("should return 'for' scope on ForInStatement in functions (ES2015)", () => {
            const { node, scope } = getScope("function f() { for (let key in obj) {} }", "ForInStatement", 2015);

            assert.strictEqual(scope.type, "for");
            assert.strictEqual(scope.block, node);
            assert.deepStrictEqual(scope.variables.map(v => v.name), ["key"]);
        });

        it("should return 'function' scope on the block body of ForInStatement in functions (ES5)", () => {
            const { node, scope } = getScope("function f() { for (var key in obj) {} }", "ForInStatement > BlockStatement");

            assert.strictEqual(scope.type, "function");
            assert.strictEqual(scope.block, node.parent.parent.parent);
            assert.deepStrictEqual(scope.variables.map(v => v.name), ["arguments", "key"]);
        });

        it("should return 'block' scope on the block body of ForInStatement in functions (ES2015)", () => {
            const { node, scope } = getScope("function f() { for (let key in obj) {} }", "ForInStatement > BlockStatement", 2015);

            assert.strictEqual(scope.type, "block");
            assert.strictEqual(scope.upper.type, "for");
            assert.strictEqual(scope.block, node);
            assert.deepStrictEqual(scope.variables.map(v => v.name), []);
            assert.deepStrictEqual(scope.upper.variables.map(v => v.name), ["key"]);
        });

        it("should return 'for' scope on ForOfStatement in functions (ES2015)", () => {
            const { node, scope } = getScope("function f() { for (let x of xs) {} }", "ForOfStatement", 2015);

            assert.strictEqual(scope.type, "for");
            assert.strictEqual(scope.block, node);
            assert.deepStrictEqual(scope.variables.map(v => v.name), ["x"]);
        });

        it("should return 'block' scope on the block body of ForOfStatement in functions (ES2015)", () => {
            const { node, scope } = getScope("function f() { for (let x of xs) {} }", "ForOfStatement > BlockStatement", 2015);

            assert.strictEqual(scope.type, "block");
            assert.strictEqual(scope.upper.type, "for");
            assert.strictEqual(scope.block, node);
            assert.deepStrictEqual(scope.variables.map(v => v.name), []);
            assert.deepStrictEqual(scope.upper.variables.map(v => v.name), ["x"]);
        });

        it("should shadow the same name variable by the iteration variable.", () => {
            const { node, scope } = getScope("let x; for (let x of x) {}", "ForOfStatement", 2015);

            assert.strictEqual(scope.type, "for");
            assert.strictEqual(scope.upper.type, "global");
            assert.strictEqual(scope.block, node);
            assert.strictEqual(scope.upper.variables[0].references.length, 0);
            assert.strictEqual(scope.references[0].identifier, node.left.declarations[0].id);
            assert.strictEqual(scope.references[1].identifier, node.right);
            assert.strictEqual(scope.references[1].resolved, scope.variables[0]);
        });
    });

    describe("Variables and references", () => {
        const code = [
            "a;",
            "function foo() { b; }",
            "Object;",
            "foo;",
            "var c;",
            "c;",
            "/* global d */",
            "d;",
            "e;",
            "f;"
        ].join("\n");
        let scope = null;

        beforeEach(() => {
            let ok = false;

            linter.defineRules({
                test(context) {
                    return {
                        Program() {
                            scope = context.getScope();
                            ok = true;
                        }
                    };
                }
            });
            linter.verify(code, { rules: { test: 2 }, globals: { e: true, f: false } });
            assert(ok);
        });

        afterEach(() => {
            scope = null;
        });

        it("Scope#through should contain references of undefined variables", () => {
            assert.strictEqual(scope.through.length, 2);
            assert.strictEqual(scope.through[0].identifier.name, "a");
            assert.strictEqual(scope.through[0].identifier.loc.start.line, 1);
            assert.strictEqual(scope.through[0].resolved, null);
            assert.strictEqual(scope.through[1].identifier.name, "b");
            assert.strictEqual(scope.through[1].identifier.loc.start.line, 2);
            assert.strictEqual(scope.through[1].resolved, null);
        });

        it("Scope#variables should contain global variables", () => {
            assert(scope.variables.some(v => v.name === "Object"));
            assert(scope.variables.some(v => v.name === "foo"));
            assert(scope.variables.some(v => v.name === "c"));
            assert(scope.variables.some(v => v.name === "d"));
            assert(scope.variables.some(v => v.name === "e"));
            assert(scope.variables.some(v => v.name === "f"));
        });

        it("Scope#set should contain global variables", () => {
            assert(scope.set.get("Object"));
            assert(scope.set.get("foo"));
            assert(scope.set.get("c"));
            assert(scope.set.get("d"));
            assert(scope.set.get("e"));
            assert(scope.set.get("f"));
        });

        it("Variables#references should contain their references", () => {
            assert.strictEqual(scope.set.get("Object").references.length, 1);
            assert.strictEqual(scope.set.get("Object").references[0].identifier.name, "Object");
            assert.strictEqual(scope.set.get("Object").references[0].identifier.loc.start.line, 3);
            assert.strictEqual(scope.set.get("Object").references[0].resolved, scope.set.get("Object"));
            assert.strictEqual(scope.set.get("foo").references.length, 1);
            assert.strictEqual(scope.set.get("foo").references[0].identifier.name, "foo");
            assert.strictEqual(scope.set.get("foo").references[0].identifier.loc.start.line, 4);
            assert.strictEqual(scope.set.get("foo").references[0].resolved, scope.set.get("foo"));
            assert.strictEqual(scope.set.get("c").references.length, 1);
            assert.strictEqual(scope.set.get("c").references[0].identifier.name, "c");
            assert.strictEqual(scope.set.get("c").references[0].identifier.loc.start.line, 6);
            assert.strictEqual(scope.set.get("c").references[0].resolved, scope.set.get("c"));
            assert.strictEqual(scope.set.get("d").references.length, 1);
            assert.strictEqual(scope.set.get("d").references[0].identifier.name, "d");
            assert.strictEqual(scope.set.get("d").references[0].identifier.loc.start.line, 8);
            assert.strictEqual(scope.set.get("d").references[0].resolved, scope.set.get("d"));
            assert.strictEqual(scope.set.get("e").references.length, 1);
            assert.strictEqual(scope.set.get("e").references[0].identifier.name, "e");
            assert.strictEqual(scope.set.get("e").references[0].identifier.loc.start.line, 9);
            assert.strictEqual(scope.set.get("e").references[0].resolved, scope.set.get("e"));
            assert.strictEqual(scope.set.get("f").references.length, 1);
            assert.strictEqual(scope.set.get("f").references[0].identifier.name, "f");
            assert.strictEqual(scope.set.get("f").references[0].identifier.loc.start.line, 10);
            assert.strictEqual(scope.set.get("f").references[0].resolved, scope.set.get("f"));
        });

        it("Reference#resolved should be their variable", () => {
            assert.strictEqual(scope.set.get("Object").references[0].resolved, scope.set.get("Object"));
            assert.strictEqual(scope.set.get("foo").references[0].resolved, scope.set.get("foo"));
            assert.strictEqual(scope.set.get("c").references[0].resolved, scope.set.get("c"));
            assert.strictEqual(scope.set.get("d").references[0].resolved, scope.set.get("d"));
            assert.strictEqual(scope.set.get("e").references[0].resolved, scope.set.get("e"));
            assert.strictEqual(scope.set.get("f").references[0].resolved, scope.set.get("f"));
        });
    });

    describe("context.getDeclaredVariables(node)", () => {

        /**
         * Assert `context.getDeclaredVariables(node)` is valid.
         * @param {string} code A code to check.
         * @param {string} type A type string of ASTNode. This method checks variables on the node of the type.
         * @param {Array<Array<string>>} expectedNamesList An array of expected variable names. The expected variable names is an array of string.
         * @returns {void}
         */
        function verify(code, type, expectedNamesList) {
            linter.defineRules({
                test(context) {

                    /**
                     * Assert `context.getDeclaredVariables(node)` is empty.
                     * @param {ASTNode} node A node to check.
                     * @returns {void}
                     */
                    function checkEmpty(node) {
                        assert.strictEqual(0, context.getDeclaredVariables(node).length);
                    }
                    const rule = {
                        Program: checkEmpty,
                        EmptyStatement: checkEmpty,
                        BlockStatement: checkEmpty,
                        ExpressionStatement: checkEmpty,
                        LabeledStatement: checkEmpty,
                        BreakStatement: checkEmpty,
                        ContinueStatement: checkEmpty,
                        WithStatement: checkEmpty,
                        SwitchStatement: checkEmpty,
                        ReturnStatement: checkEmpty,
                        ThrowStatement: checkEmpty,
                        TryStatement: checkEmpty,
                        WhileStatement: checkEmpty,
                        DoWhileStatement: checkEmpty,
                        ForStatement: checkEmpty,
                        ForInStatement: checkEmpty,
                        DebuggerStatement: checkEmpty,
                        ThisExpression: checkEmpty,
                        ArrayExpression: checkEmpty,
                        ObjectExpression: checkEmpty,
                        Property: checkEmpty,
                        SequenceExpression: checkEmpty,
                        UnaryExpression: checkEmpty,
                        BinaryExpression: checkEmpty,
                        AssignmentExpression: checkEmpty,
                        UpdateExpression: checkEmpty,
                        LogicalExpression: checkEmpty,
                        ConditionalExpression: checkEmpty,
                        CallExpression: checkEmpty,
                        NewExpression: checkEmpty,
                        MemberExpression: checkEmpty,
                        SwitchCase: checkEmpty,
                        Identifier: checkEmpty,
                        Literal: checkEmpty,
                        ForOfStatement: checkEmpty,
                        ArrowFunctionExpression: checkEmpty,
                        YieldExpression: checkEmpty,
                        TemplateLiteral: checkEmpty,
                        TaggedTemplateExpression: checkEmpty,
                        TemplateElement: checkEmpty,
                        ObjectPattern: checkEmpty,
                        ArrayPattern: checkEmpty,
                        RestElement: checkEmpty,
                        AssignmentPattern: checkEmpty,
                        ClassBody: checkEmpty,
                        MethodDefinition: checkEmpty,
                        MetaProperty: checkEmpty
                    };

                    rule[type] = function (node) {
                        const expectedNames = expectedNamesList.shift();
                        const variables = context.getDeclaredVariables(node);

                        assert(Array.isArray(expectedNames));
                        assert(Array.isArray(variables));
                        assert.strictEqual(expectedNames.length, variables.length);
                        for (let i = variables.length - 1; i >= 0; i--) {
                            assert.strictEqual(expectedNames[i], variables[i].name);
                        }
                    };
                    return rule;
                }
            });
            linter.verify(code, {
                rules: { test: 2 },
                parserOptions: {
                    ecmaVersion: 6,
                    sourceType: "module"
                }
            });

            // Check all expected names are asserted.
            assert.strictEqual(0, expectedNamesList.length);
        }

        it("VariableDeclaration", () => {
            const code = "\n var {a, x: [b], y: {c = 0}} = foo;\n let {d, x: [e], y: {f = 0}} = foo;\n const {g, x: [h], y: {i = 0}} = foo, {j, k = function(z) { let l; }} = bar;\n ";
            const namesList = [
                ["a", "b", "c"],
                ["d", "e", "f"],
                ["g", "h", "i", "j", "k"],
                ["l"]
            ];

            verify(code, "VariableDeclaration", namesList);
        });

        it("VariableDeclaration (on for-in/of loop)", () => {

            // TDZ scope is created here, so tests to exclude those.
            const code = "\n for (var {a, x: [b], y: {c = 0}} in foo) {\n let g;\n }\n for (let {d, x: [e], y: {f = 0}} of foo) {\n let h;\n }\n ";
            const namesList = [
                ["a", "b", "c"],
                ["g"],
                ["d", "e", "f"],
                ["h"]
            ];

            verify(code, "VariableDeclaration", namesList);
        });

        it("VariableDeclarator", () => {

            // TDZ scope is created here, so tests to exclude those.
            const code = "\n var {a, x: [b], y: {c = 0}} = foo;\n let {d, x: [e], y: {f = 0}} = foo;\n const {g, x: [h], y: {i = 0}} = foo, {j, k = function(z) { let l; }} = bar;\n ";
            const namesList = [
                ["a", "b", "c"],
                ["d", "e", "f"],
                ["g", "h", "i"],
                ["j", "k"],
                ["l"]
            ];

            verify(code, "VariableDeclarator", namesList);
        });

        it("FunctionDeclaration", () => {
            const code = "\n function foo({a, x: [b], y: {c = 0}}, [d, e]) {\n let z;\n }\n function bar({f, x: [g], y: {h = 0}}, [i, j = function(q) { let w; }]) {\n let z;\n }\n ";
            const namesList = [
                ["foo", "a", "b", "c", "d", "e"],
                ["bar", "f", "g", "h", "i", "j"]
            ];

            verify(code, "FunctionDeclaration", namesList);
        });

        it("FunctionExpression", () => {
            const code = "\n (function foo({a, x: [b], y: {c = 0}}, [d, e]) {\n let z;\n });\n (function bar({f, x: [g], y: {h = 0}}, [i, j = function(q) { let w; }]) {\n let z;\n });\n ";
            const namesList = [
                ["foo", "a", "b", "c", "d", "e"],
                ["bar", "f", "g", "h", "i", "j"],
                ["q"]
            ];

            verify(code, "FunctionExpression", namesList);
        });

        it("ArrowFunctionExpression", () => {
            const code = "\n (({a, x: [b], y: {c = 0}}, [d, e]) => {\n let z;\n });\n (({f, x: [g], y: {h = 0}}, [i, j]) => {\n let z;\n });\n ";
            const namesList = [
                ["a", "b", "c", "d", "e"],
                ["f", "g", "h", "i", "j"]
            ];

            verify(code, "ArrowFunctionExpression", namesList);
        });

        it("ClassDeclaration", () => {
            const code = "\n class A { foo(x) { let y; } }\n class B { foo(x) { let y; } }\n ";
            const namesList = [
                ["A", "A"], // outer scope's and inner scope's.
                ["B", "B"]
            ];

            verify(code, "ClassDeclaration", namesList);
        });

        it("ClassExpression", () => {
            const code = "\n (class A { foo(x) { let y; } });\n (class B { foo(x) { let y; } });\n ";
            const namesList = [
                ["A"],
                ["B"]
            ];

            verify(code, "ClassExpression", namesList);
        });

        it("CatchClause", () => {
            const code = "\n try {} catch ({a, b}) {\n let x;\n try {} catch ({c, d}) {\n let y;\n }\n }\n ";
            const namesList = [
                ["a", "b"],
                ["c", "d"]
            ];

            verify(code, "CatchClause", namesList);
        });

        it("ImportDeclaration", () => {
            const code = "\n import \"aaa\";\n import * as a from \"bbb\";\n import b, {c, x as d} from \"ccc\";\n ";
            const namesList = [
                [],
                ["a"],
                ["b", "c", "d"]
            ];

            verify(code, "ImportDeclaration", namesList);
        });

        it("ImportSpecifier", () => {
            const code = "\n import \"aaa\";\n import * as a from \"bbb\";\n import b, {c, x as d} from \"ccc\";\n ";
            const namesList = [
                ["c"],
                ["d"]
            ];

            verify(code, "ImportSpecifier", namesList);
        });

        it("ImportDefaultSpecifier", () => {
            const code = "\n import \"aaa\";\n import * as a from \"bbb\";\n import b, {c, x as d} from \"ccc\";\n ";
            const namesList = [
                ["b"]
            ];

            verify(code, "ImportDefaultSpecifier", namesList);
        });

        it("ImportNamespaceSpecifier", () => {
            const code = "\n import \"aaa\";\n import * as a from \"bbb\";\n import b, {c, x as d} from \"ccc\";\n ";
            const namesList = [
                ["a"]
            ];

            verify(code, "ImportNamespaceSpecifier", namesList);
        });
    });

    describe("suggestions", () => {
        it("provides suggestion information for tools to use", () => {
            linter.defineRule("rule-with-suggestions", {
                meta: { hasSuggestions: true },
                create: context => ({
                    Program(node) {
                        context.report({
                            node,
                            message: "Incorrect spacing",
                            suggest: [{
                                desc: "Insert space at the beginning",
                                fix: fixer => fixer.insertTextBefore(node, " ")
                            }, {
                                desc: "Insert space at the end",
                                fix: fixer => fixer.insertTextAfter(node, " ")
                            }]
                        });
                    }
                })
            });

            const messages = linter.verify("var a = 1;", { rules: { "rule-with-suggestions": "error" } });
            const suppressedMessages = linter.getSuppressedMessages();

            assert.deepStrictEqual(messages[0].suggestions, [{
                desc: "Insert space at the beginning",
                fix: {
                    range: [0, 0],
                    text: " "
                }
            }, {
                desc: "Insert space at the end",
                fix: {
                    range: [10, 10],
                    text: " "
                }
            }]);

            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("supports messageIds for suggestions", () => {
            linter.defineRule("rule-with-suggestions", {
                meta: {
                    messages: {
                        suggestion1: "Insert space at the beginning",
                        suggestion2: "Insert space at the end"
                    },
                    hasSuggestions: true
                },
                create: context => ({
                    Program(node) {
                        context.report({
                            node,
                            message: "Incorrect spacing",
                            suggest: [{
                                messageId: "suggestion1",
                                fix: fixer => fixer.insertTextBefore(node, " ")
                            }, {
                                messageId: "suggestion2",
                                fix: fixer => fixer.insertTextAfter(node, " ")
                            }]
                        });
                    }
                })
            });

            const messages = linter.verify("var a = 1;", { rules: { "rule-with-suggestions": "error" } });
            const suppressedMessages = linter.getSuppressedMessages();

            assert.deepStrictEqual(messages[0].suggestions, [{
                messageId: "suggestion1",
                desc: "Insert space at the beginning",
                fix: {
                    range: [0, 0],
                    text: " "
                }
            }, {
                messageId: "suggestion2",
                desc: "Insert space at the end",
                fix: {
                    range: [10, 10],
                    text: " "
                }
            }]);

            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should throw an error if suggestion is passed but `meta.hasSuggestions` property is not enabled", () => {
            linter.defineRule("rule-with-suggestions", {
                meta: { docs: {}, schema: [] },
                create: context => ({
                    Program(node) {
                        context.report({
                            node,
                            message: "hello world",
                            suggest: [{ desc: "convert to foo", fix: fixer => fixer.insertTextBefore(node, " ") }]
                        });
                    }
                })
            });

            assert.throws(() => {
                linter.verify("0", { rules: { "rule-with-suggestions": "error" } });
            }, "Rules with suggestions must set the `meta.hasSuggestions` property to `true`.");
        });

        it("should throw an error if suggestion is passed but `meta.hasSuggestions` property is not enabled and the rule has the obsolete `meta.docs.suggestion` property", () => {
            linter.defineRule("rule-with-meta-docs-suggestion", {
                meta: { docs: { suggestion: true }, schema: [] },
                create: context => ({
                    Program(node) {
                        context.report({
                            node,
                            message: "hello world",
                            suggest: [{ desc: "convert to foo", fix: fixer => fixer.insertTextBefore(node, " ") }]
                        });
                    }
                })
            });

            assert.throws(() => {
                linter.verify("0", { rules: { "rule-with-meta-docs-suggestion": "error" } });
            }, "Rules with suggestions must set the `meta.hasSuggestions` property to `true`. `meta.docs.suggestion` is ignored by ec0lint.");
        });
    });

    describe("mutability", () => {
        let linter1 = null;
        let linter2 = null;

        beforeEach(() => {
            linter1 = new Linter();
            linter2 = new Linter();
        });

        describe("rules", () => {
            it("with no changes, same rules are loaded", () => {
                assert.sameDeepMembers(Array.from(linter1.getRules().keys()), Array.from(linter2.getRules().keys()));
            });

            it("loading rule in one doesn't change the other", () => {
                linter1.defineRule("mock-rule", () => ({}));

                assert.isTrue(linter1.getRules().has("mock-rule"), "mock rule is present");
                assert.isFalse(linter2.getRules().has("mock-rule"), "mock rule is not present");
            });
        });
    });

    describe("processors", () => {
        let receivedFilenames = [];
        let receivedPhysicalFilenames = [];

        beforeEach(() => {
            receivedFilenames = [];
            receivedPhysicalFilenames = [];

            // A rule that always reports the AST with a message equal to the source text
            linter.defineRule("report-original-text", context => ({
                Program(ast) {
                    receivedFilenames.push(context.getFilename());
                    receivedPhysicalFilenames.push(context.getPhysicalFilename());
                    context.report({ node: ast, message: context.getSourceCode().text });
                }
            }));
        });

        describe("preprocessors", () => {
            it("should receive text and filename.", () => {
                const code = "foo bar baz";
                const preprocess = sinon.spy(text => text.split(" "));

                linter.verify(code, {}, { filename, preprocess });

                assert.strictEqual(preprocess.calledOnce, true);
                assert.deepStrictEqual(preprocess.args[0], [code, filename]);
            });

            it("should apply a preprocessor to the code, and lint each code sample separately", () => {
                const code = "foo bar baz";
                const problems = linter.verify(
                    code,
                    { rules: { "report-original-text": "error" } },
                    {

                        // Apply a preprocessor that splits the source text into spaces and lints each word individually
                        preprocess(input) {
                            return input.split(" ");
                        }
                    }
                );

                assert.strictEqual(problems.length, 3);
                assert.deepStrictEqual(problems.map(problem => problem.message), ["foo", "bar", "baz"]);
            });

            it("should apply a preprocessor to the code even if the preprocessor returned code block objects.", () => {
                const code = "foo bar baz";
                const problems = linter.verify(
                    code,
                    { rules: { "report-original-text": "error" } },
                    {
                        filename,

                        // Apply a preprocessor that splits the source text into spaces and lints each word individually
                        preprocess(input) {
                            return input.split(" ").map(text => ({
                                filename: "block.js",
                                text
                            }));
                        }
                    }
                );

                assert.strictEqual(problems.length, 3);
                assert.deepStrictEqual(problems.map(problem => problem.message), ["foo", "bar", "baz"]);

                // filename
                assert.strictEqual(receivedFilenames.length, 3);
                assert(/^filename\.js[/\\]0_block\.js/u.test(receivedFilenames[0]));
                assert(/^filename\.js[/\\]1_block\.js/u.test(receivedFilenames[1]));
                assert(/^filename\.js[/\\]2_block\.js/u.test(receivedFilenames[2]));

                // physical filename
                assert.strictEqual(receivedPhysicalFilenames.length, 3);
                assert.strictEqual(receivedPhysicalFilenames.every(name => name === filename), true);
            });

            it("should receive text even if a SourceCode object was given.", () => {
                const code = "foo";
                const preprocess = sinon.spy(text => text.split(" "));

                linter.verify(code, {});
                const sourceCode = linter.getSourceCode();

                linter.verify(sourceCode, {}, { filename, preprocess });

                assert.strictEqual(preprocess.calledOnce, true);
                assert.deepStrictEqual(preprocess.args[0], [code, filename]);
            });

            it("should receive text even if a SourceCode object was given (with BOM).", () => {
                const code = "\uFEFFfoo";
                const preprocess = sinon.spy(text => text.split(" "));

                linter.verify(code, {});
                const sourceCode = linter.getSourceCode();

                linter.verify(sourceCode, {}, { filename, preprocess });

                assert.strictEqual(preprocess.calledOnce, true);
                assert.deepStrictEqual(preprocess.args[0], [code, filename]);
            });
        });

        describe("postprocessors", () => {
            it("should receive result and filename.", () => {
                const code = "foo bar baz";
                const preprocess = sinon.spy(text => text.split(" "));
                const postprocess = sinon.spy(text => [text]);

                linter.verify(code, {}, { filename, postprocess, preprocess });

                assert.strictEqual(postprocess.calledOnce, true);
                assert.deepStrictEqual(postprocess.args[0], [[[], [], []], filename]);
            });

            it("should apply a postprocessor to the reported messages", () => {
                const code = "foo bar baz";

                const problems = linter.verify(
                    code,
                    { rules: { "report-original-text": "error" } },
                    {
                        preprocess: input => input.split(" "),

                        /*
                         * Apply a postprocessor that updates the locations of the reported problems
                         * to make sure they correspond to the locations in the original text.
                         */
                        postprocess(problemLists) {
                            problemLists.forEach(problemList => assert.strictEqual(problemList.length, 1));
                            return problemLists.reduce(
                                (combinedList, problemList, index) =>
                                    combinedList.concat(
                                        problemList.map(
                                            problem =>
                                                Object.assign(
                                                    {},
                                                    problem,
                                                    {
                                                        message: problem.message.toUpperCase(),
                                                        column: problem.column + index * 4
                                                    }
                                                )
                                        )
                                    ),
                                []
                            );
                        }
                    }
                );

                assert.strictEqual(problems.length, 3);
                assert.deepStrictEqual(problems.map(problem => problem.message), ["FOO", "BAR", "BAZ"]);
                assert.deepStrictEqual(problems.map(problem => problem.column), [1, 5, 9]);
            });

            it("should use postprocessed problem ranges when applying autofixes", () => {
                const code = "foo bar baz";

                linter.defineRule("capitalize-identifiers", {
                    meta: {
                        fixable: "code"
                    },
                    create(context) {
                        return {
                            Identifier(node) {
                                if (node.name !== node.name.toUpperCase()) {
                                    context.report({
                                        node,
                                        message: "Capitalize this identifier",
                                        fix: fixer => fixer.replaceText(node, node.name.toUpperCase())
                                    });
                                }
                            }
                        };
                    }
                });

                const fixResult = linter.verifyAndFix(
                    code,
                    { rules: { "capitalize-identifiers": "error" } },
                    {

                        /*
                         * Apply a postprocessor that updates the locations of autofixes
                         * to make sure they correspond to locations in the original text.
                         */
                        preprocess: input => input.split(" "),
                        postprocess(problemLists) {
                            return problemLists.reduce(
                                (combinedProblems, problemList, blockIndex) =>
                                    combinedProblems.concat(
                                        problemList.map(problem =>
                                            Object.assign(problem, {
                                                fix: {
                                                    text: problem.fix.text,
                                                    range: problem.fix.range.map(
                                                        rangeIndex => rangeIndex + blockIndex * 4
                                                    )
                                                }
                                            }))
                                    ),
                                []
                            );
                        }
                    }
                );

                assert.strictEqual(fixResult.fixed, true);
                assert.strictEqual(fixResult.messages.length, 0);
                assert.strictEqual(fixResult.output, "FOO BAR BAZ");
            });
        });
    });

    describe("verifyAndFix", () => {

        it("stops fixing after 10 passes", () => {

            linter.defineRule("add-spaces", {
                meta: {
                    fixable: "whitespace"
                },
                create(context) {
                    return {
                        Program(node) {
                            context.report({
                                node,
                                message: "Add a space before this node.",
                                fix: fixer => fixer.insertTextBefore(node, " ")
                            });
                        }
                    };
                }
            });

            const fixResult = linter.verifyAndFix("a", { rules: { "add-spaces": "error" } });

            assert.strictEqual(fixResult.fixed, true);
            assert.strictEqual(fixResult.output, `${" ".repeat(10)}a`);
            assert.strictEqual(fixResult.messages.length, 1);
        });

        it("should throw an error if fix is passed but meta has no `fixable` property", () => {
            linter.defineRule("test-rule", {
                meta: {
                    docs: {},
                    schema: []
                },
                create: context => ({
                    Program(node) {
                        context.report(node, "hello world", {}, () => ({ range: [1, 1], text: "" }));
                    }
                })
            });

            assert.throws(() => {
                linter.verify("0", { rules: { "test-rule": "error" } });
            }, /Fixable rules must set the `meta\.fixable` property to "code" or "whitespace".\nOccurred while linting <input>:1\nRule: "test-rule"$/u);
        });

        it("should throw an error if fix is passed and there is no metadata", () => {
            linter.defineRule("test-rule", {
                create: context => ({
                    Program(node) {
                        context.report(node, "hello world", {}, () => ({ range: [1, 1], text: "" }));
                    }
                })
            });

            assert.throws(() => {
                linter.verify("0", { rules: { "test-rule": "error" } });
            }, /Fixable rules must set the `meta\.fixable` property/u);
        });

        it("should throw an error if fix is passed from a legacy-format rule", () => {
            linter.defineRule("test-rule", context => ({
                Program(node) {
                    context.report(node, "hello world", {}, () => ({ range: [1, 1], text: "" }));
                }
            }));

            assert.throws(() => {
                linter.verify("0", { rules: { "test-rule": "error" } });
            }, /Fixable rules must set the `meta\.fixable` property/u);
        });
    });

    describe("Edge cases", () => {

        it("should properly parse import statements when sourceType is module", () => {
            const code = "import foo from 'foo';";
            const messages = linter.verify(code, { parserOptions: { ecmaVersion: 6, sourceType: "module" } });
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 0);
            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should properly parse import all statements when sourceType is module", () => {
            const code = "import * as foo from 'foo';";
            const messages = linter.verify(code, { parserOptions: { ecmaVersion: 6, sourceType: "module" } });
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 0);
            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should properly parse default export statements when sourceType is module", () => {
            const code = "export default function initialize() {}";
            const messages = linter.verify(code, { parserOptions: { ecmaVersion: 6, sourceType: "module" } });
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 0);
            assert.strictEqual(suppressedMessages.length, 0);
        });

        // https://github.com/eslint/eslint/issues/9687
        it("should report an error when invalid parserOptions found", () => {
            let messages = linter.verify("", { parserOptions: { ecmaVersion: 222 } });
            let suppressedMessages = linter.getSuppressedMessages();

            assert.deepStrictEqual(messages.length, 1);
            assert.ok(messages[0].message.includes("Invalid ecmaVersion"));
            assert.strictEqual(suppressedMessages.length, 0);

            messages = linter.verify("", { parserOptions: { sourceType: "foo" } });
            suppressedMessages = linter.getSuppressedMessages();

            assert.deepStrictEqual(messages.length, 1);
            assert.ok(messages[0].message.includes("Invalid sourceType"));
            assert.strictEqual(suppressedMessages.length, 0);

            messages = linter.verify("", { parserOptions: { ecmaVersion: 5, sourceType: "module" } });
            suppressedMessages = linter.getSuppressedMessages();

            assert.deepStrictEqual(messages.length, 1);
            assert.ok(messages[0].message.includes("sourceType 'module' is not supported when ecmaVersion < 2015"));
            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should not crash when invalid parentheses syntax is encountered", () => {
            linter.verify("left = (aSize.width/2) - ()");
        });

        it("should not crash when let is used inside of switch case", () => {
            linter.verify("switch(foo) { case 1: let bar=2; }", { parserOptions: { ecmaVersion: 6 } });
        });

        it("should not crash when parsing destructured assignment", () => {
            linter.verify("var { a='a' } = {};", { parserOptions: { ecmaVersion: 6 } });
        });

        it("should report syntax error when a keyword exists in object property shorthand", () => {
            const messages = linter.verify("let a = {this}", { parserOptions: { ecmaVersion: 6 } });
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 1);
            assert.strictEqual(messages[0].fatal, true);

            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should not rewrite env setting in core (https://github.com/eslint/eslint/issues/4814)", () => {

            /*
             * This test focuses on the instance of https://github.com/eslint/eslint/blob/v2.0.0-alpha-2/conf/environments.js#L26-L28
             * This `verify()` takes the instance and runs https://github.com/eslint/eslint/blob/v2.0.0-alpha-2/lib/eslint.js#L416
             */
            linter.defineRule("test", () => ({}));
            linter.verify("var a = 0;", {
                env: { node: true },
                parserOptions: { ecmaVersion: 6, sourceType: "module" },
                rules: { test: 2 }
            });

            // This `verify()` takes the instance and tests that the instance was not modified.
            let ok = false;

            linter.defineRule("test", context => {
                assert(
                    context.parserOptions.ecmaFeatures.globalReturn,
                    "`ecmaFeatures.globalReturn` of the node environment should not be modified."
                );
                ok = true;
                return {};
            });
            linter.verify("var a = 0;", {
                env: { node: true },
                rules: { test: 2 }
            });

            assert(ok);
        });
    });

    describe("Custom parser", () => {

        const errorPrefix = "Parsing error: ";

        it("should have file path passed to it", () => {
            const code = "/* this is code */";
            const parseSpy = sinon.spy(testParsers.stubParser, "parse");

            linter.defineParser("stub-parser", testParsers.stubParser);
            linter.verify(code, { parser: "stub-parser" }, filename, true);

            sinon.assert.calledWithMatch(parseSpy, "", { filePath: filename });
        });

        it("should not report an error when JSX code contains a spread operator and JSX is enabled", () => {
            const code = "var myDivElement = <div {...this.props} />;";

            linter.defineParser("esprima", esprima);
            const messages = linter.verify(code, { parser: "esprima", parserOptions: { jsx: true } }, "filename");
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 0);
            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should return an error when the custom parser can't be found", () => {
            const code = "var myDivElement = <div {...this.props} />;";
            const messages = linter.verify(code, { parser: "esprima-xyz" }, "filename");
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 1);
            assert.strictEqual(messages[0].severity, 2);
            assert.strictEqual(messages[0].message, "Configured parser 'esprima-xyz' was not found.");

            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should not throw or report errors when the custom parser returns unrecognized operators (https://github.com/eslint/eslint/issues/10475)", () => {
            const code = "null %% 'foo'";

            linter.defineParser("unknown-logical-operator", testParsers.unknownLogicalOperator);

            // This shouldn't throw
            const messages = linter.verify(code, { parser: "unknown-logical-operator" }, filename, true);
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 0);
            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should not throw or report errors when the custom parser returns nested unrecognized operators (https://github.com/eslint/eslint/issues/10560)", () => {
            const code = "foo && bar %% baz";

            linter.defineParser("unknown-logical-operator-nested", testParsers.unknownLogicalOperatorNested);

            // This shouldn't throw
            const messages = linter.verify(code, { parser: "unknown-logical-operator-nested" }, filename, true);
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 0);
            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should not throw or return errors when the custom parser returns unknown AST nodes", () => {
            const code = "foo && bar %% baz";

            const nodes = [];

            linter.defineRule("collect-node-types", () => ({
                "*"(node) {
                    nodes.push(node.type);
                }
            }));

            linter.defineParser("non-js-parser", testParsers.nonJSParser);

            const messages = linter.verify(code, {
                parser: "non-js-parser",
                rules: {
                    "collect-node-types": "error"
                }
            }, filename, true);
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 0);
            assert.isTrue(nodes.length > 0);

            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should strip leading line: prefix from parser error", () => {
            linter.defineParser("line-error", testParsers.lineError);
            const messages = linter.verify(";", { parser: "line-error" }, "filename");
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 1);
            assert.strictEqual(messages[0].severity, 2);
            assert.strictEqual(messages[0].message, errorPrefix + testParsers.lineError.expectedError);

            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should not modify a parser error message without a leading line: prefix", () => {
            linter.defineParser("no-line-error", testParsers.noLineError);
            const messages = linter.verify(";", { parser: "no-line-error" }, "filename");
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 1);
            assert.strictEqual(messages[0].severity, 2);
            assert.strictEqual(messages[0].message, errorPrefix + testParsers.noLineError.expectedError);

            assert.strictEqual(suppressedMessages.length, 0);
        });

        describe("if a parser provides 'visitorKeys'", () => {
            let types = [];
            let sourceCode;
            let scopeManager;
            let firstChildNodes = [];

            beforeEach(() => {
                types = [];
                firstChildNodes = [];
                linter.defineRule("collect-node-types", () => ({
                    "*"(node) {
                        types.push(node.type);
                    }
                }));
                linter.defineRule("save-scope-manager", context => {
                    scopeManager = context.getSourceCode().scopeManager;

                    return {};
                });
                linter.defineRule("esquery-option", () => ({
                    ":first-child"(node) {
                        firstChildNodes.push(node);
                    }
                }));
                linter.defineParser("enhanced-parser2", testParsers.enhancedParser2);
                linter.verify("@foo class A {}", {
                    parser: "enhanced-parser2",
                    rules: {
                        "collect-node-types": "error",
                        "save-scope-manager": "error",
                        "esquery-option": "error"
                    }
                });

                sourceCode = linter.getSourceCode();
            });

            it("Traverser should use the visitorKeys (so 'types' includes 'Decorator')", () => {
                assert.deepStrictEqual(
                    types,
                    ["Program", "ClassDeclaration", "Decorator", "Identifier", "Identifier", "ClassBody"]
                );
            });

            it("ec0lint-scope should use the visitorKeys (so 'childVisitorKeys.ClassDeclaration' includes 'experimentalDecorators')", () => {
                assert.deepStrictEqual(
                    scopeManager.__options.childVisitorKeys.ClassDeclaration,
                    ["experimentalDecorators", "id", "superClass", "body"]
                );
            });

            it("should use the same visitorKeys if the source code object is reused", () => {
                const types2 = [];

                linter.defineRule("collect-node-types", () => ({
                    "*"(node) {
                        types2.push(node.type);
                    }
                }));
                linter.verify(sourceCode, {
                    rules: {
                        "collect-node-types": "error"
                    }
                });

                assert.deepStrictEqual(
                    types2,
                    ["Program", "ClassDeclaration", "Decorator", "Identifier", "Identifier", "ClassBody"]
                );
            });

            it("esquery should use the visitorKeys (so 'visitorKeys.ClassDeclaration' includes 'experimentalDecorators')", () => {
                assert.deepStrictEqual(
                    firstChildNodes,
                    [sourceCode.ast.body[0], sourceCode.ast.body[0].experimentalDecorators[0]]
                );
            });
        });

        describe("if a parser provides 'scope'", () => {
            let scope = null;
            let sourceCode = null;

            beforeEach(() => {
                linter.defineParser("enhanced-parser3", testParsers.enhancedParser3);
                linter.defineRule("save-scope1", context => ({
                    Program() {
                        scope = context.getScope();
                    }
                }));
                linter.verify("@foo class A {}", { parser: "enhanced-parser3", rules: { "save-scope1": 2 } });

                sourceCode = linter.getSourceCode();
            });

            it("should use the scope (so the global scope has the reference of '@foo')", () => {
                assert.strictEqual(scope.references.length, 1);
                assert.deepStrictEqual(
                    scope.references[0].identifier.name,
                    "foo"
                );
            });

            it("should use the same scope if the source code object is reused", () => {
                let scope2 = null;

                linter.defineRule("save-scope2", context => ({
                    Program() {
                        scope2 = context.getScope();
                    }
                }));
                linter.verify(sourceCode, { rules: { "save-scope2": 2 } }, "test.js");

                assert(scope2 !== null);
                assert(scope2 === scope);
            });
        });

        it("should not pass any default parserOptions to the parser", () => {
            linter.defineParser("throws-with-options", testParsers.throwsWithOptions);
            const messages = linter.verify(";", { parser: "throws-with-options" }, "filename");
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 0);
            assert.strictEqual(suppressedMessages.length, 0);
        });
    });

    describe("merging 'parserOptions'", () => {
        it("should deeply merge 'parserOptions' from an environment with 'parserOptions' from the provided config", () => {
            const code = "return <div/>";
            const config = {
                env: {
                    node: true // ecmaFeatures: { globalReturn: true }
                },
                parserOptions: {
                    ecmaFeatures: {
                        jsx: true
                    }
                }
            };

            const messages = linter.verify(code, config);
            const suppressedMessages = linter.getSuppressedMessages();

            // no parsing errors
            assert.strictEqual(messages.length, 0);
            assert.strictEqual(suppressedMessages.length, 0);
        });
    });
});

describe("Linter with FlatConfigArray", () => {

    let linter;
    const filename = "filename.js";

    /**
     * Creates a config array with some default properties.
     * @param {FlatConfig|FlatConfig[]} value The value to base the
     *      config array on.
     * @returns {FlatConfigArray} The created config array.
     */
    function createFlatConfigArray(value) {
        return new FlatConfigArray(value, { basePath: "" });
    }

    beforeEach(() => {
        linter = new Linter({ configType: "flat" });
    });

    describe("Static Members", () => {
        describe("version", () => {
            it("should return same version as instance property", () => {
                assert.strictEqual(Linter.version, linter.version);
            });
        });
    });

    describe("Config Options", () => {

        describe("languageOptions", () => {

            describe("ecmaVersion", () => {

                it("should allow destructuring when ecmaVersion is 6", () => {
                    const messages = linter.verify("let {a} = b", {
                        languageOptions: {
                            ecmaVersion: 6
                        }
                    });
                    const suppressedMessages = linter.getSuppressedMessages();

                    assert.strictEqual(messages.length, 0, "There should be no linting errors.");
                    assert.strictEqual(suppressedMessages.length, 0);
                });

                it("ecmaVersion should be normalized to year name for ES 6", () => {
                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker(context) {
                                        return {
                                            Program() {
                                                assert.strictEqual(context.languageOptions.ecmaVersion, 2015);
                                            }
                                        };
                                    }
                                }
                            }
                        },
                        languageOptions: {
                            ecmaVersion: 6
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify("foo", config, filename);
                });

                it("ecmaVersion should be normalized to latest year by default", () => {
                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker(context) {
                                        return {
                                            Program() {
                                                assert.strictEqual(context.languageOptions.ecmaVersion, espree.latestEcmaVersion + 2009);
                                            }
                                        };
                                    }
                                }
                            }
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify("foo", config, filename);
                });

                it("ecmaVersion should not be normalized to year name for ES 5", () => {
                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker(context) {
                                        return {
                                            Program() {
                                                assert.strictEqual(context.languageOptions.ecmaVersion, 5);
                                            }
                                        };
                                    }
                                }
                            }
                        },
                        languageOptions: {
                            ecmaVersion: 5
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify("foo", config, filename);
                });

                it("ecmaVersion should be normalized to year name for 'latest'", () => {
                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker(context) {
                                        return {
                                            Program() {
                                                assert.strictEqual(context.languageOptions.ecmaVersion, espree.latestEcmaVersion + 2009);
                                            }
                                        };
                                    }
                                }
                            }
                        },
                        languageOptions: {
                            ecmaVersion: "latest"
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify("foo", config, filename);
                });


            });

            describe("sourceType", () => {

                it("should be module by default", () => {
                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker(context) {
                                        return {
                                            Program() {
                                                assert.strictEqual(context.languageOptions.sourceType, "module");
                                            }
                                        };
                                    }
                                }
                            }
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify("import foo from 'bar'", config, filename);
                });

                it("should default to commonjs when passed a .cjs filename", () => {
                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker(context) {
                                        return {
                                            Program() {
                                                assert.strictEqual(context.languageOptions.sourceType, "commonjs");
                                            }
                                        };
                                    }
                                }
                            }
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify("import foo from 'bar'", config, `${filename}.cjs`);
                });


                it("should error when import is used in a script", () => {
                    const messages = linter.verify("import foo from 'bar';", {
                        languageOptions: {
                            ecmaVersion: 6,
                            sourceType: "script"
                        }
                    });

                    assert.strictEqual(messages.length, 1, "There should be one parsing error.");
                    assert.strictEqual(messages[0].message, "Parsing error: 'import' and 'export' may appear only with 'sourceType: module'");
                });

                it("should not error when import is used in a module", () => {
                    const messages = linter.verify("import foo from 'bar';", {
                        languageOptions: {
                            ecmaVersion: 6,
                            sourceType: "module"
                        }
                    });
                    const suppressedMessages = linter.getSuppressedMessages();

                    assert.strictEqual(messages.length, 0, "There should no linting errors.");
                    assert.strictEqual(suppressedMessages.length, 0);
                });

                it("should error when return is used at the top-level outside of commonjs", () => {
                    const messages = linter.verify("return", {
                        languageOptions: {
                            ecmaVersion: 6,
                            sourceType: "script"
                        }
                    });
                    const suppressedMessages = linter.getSuppressedMessages();

                    assert.strictEqual(messages.length, 1, "There should be one parsing error.");
                    assert.strictEqual(messages[0].message, "Parsing error: 'return' outside of function");

                    assert.strictEqual(suppressedMessages.length, 0);
                });

                it("should not error when top-level return is used in commonjs", () => {
                    const messages = linter.verify("return", {
                        languageOptions: {
                            ecmaVersion: 6,
                            sourceType: "commonjs"
                        }
                    });
                    const suppressedMessages = linter.getSuppressedMessages();

                    assert.strictEqual(messages.length, 0, "There should no linting errors.");
                    assert.strictEqual(suppressedMessages.length, 0);
                });

                it("should allow 'await' as a property name in modules", () => {
                    const result = linter.verify(
                        "obj.await",
                        {
                            languageOptions: {
                                ecmaVersion: 6,
                                sourceType: "module"
                            }
                        }
                    );
                    const suppressedMessages = linter.getSuppressedMessages();

                    assert(result.length === 0);
                    assert.strictEqual(suppressedMessages.length, 0);
                });

            });

            describe("parser", () => {

                it("should be able to define a custom parser", () => {
                    const parser = {
                        parseForESLint: function parse(code, options) {
                            return {
                                ast: esprima.parse(code, options),
                                services: {
                                    test: {
                                        getMessage() {
                                            return "Hi!";
                                        }
                                    }
                                }
                            };
                        }
                    };

                    const config = {
                        plugins: {
                            test: {
                                parsers: {
                                    "test-parser": parser
                                }
                            }
                        },
                        languageOptions: {
                            parser: "test/test-parser"
                        }
                    };


                    const messages = linter.verify("0", config, filename);
                    const suppressedMessages = linter.getSuppressedMessages();

                    assert.strictEqual(messages.length, 0);
                    assert.strictEqual(suppressedMessages.length, 0);
                });

                it("should pass parser as context.languageOptions.parser to all rules when provided on config", () => {

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    "test-rule": sinon.mock().withArgs(
                                        sinon.match({ languageOptions: { parser: esprima } })
                                    ).returns({})
                                }
                            }
                        },
                        languageOptions: {
                            parser: esprima
                        },
                        rules: {
                            "test/test-rule": 2
                        }
                    };

                    linter.verify("0", config, filename);
                });

                it("should use parseForESLint() in custom parser when custom parser is specified", () => {
                    const config = {
                        plugins: {
                            test: {
                                parsers: {
                                    "enhanced-parser": testParsers.enhancedParser
                                }
                            }
                        },
                        languageOptions: {
                            parser: "test/enhanced-parser"
                        }
                    };

                    const messages = linter.verify("0", config, filename);
                    const suppressedMessages = linter.getSuppressedMessages();

                    assert.strictEqual(messages.length, 0);
                    assert.strictEqual(suppressedMessages.length, 0);
                });

                it("should expose parser services when using parseForESLint() and services are specified", () => {

                    const config = {
                        plugins: {
                            test: {
                                parsers: {
                                    "enhanced-parser": testParsers.enhancedParser
                                },
                                rules: {
                                    "test-service-rule": context => ({
                                        Literal(node) {
                                            context.report({
                                                node,
                                                message: context.parserServices.test.getMessage()
                                            });
                                        }
                                    })
                                }
                            }
                        },
                        languageOptions: {
                            parser: "test/enhanced-parser"
                        },
                        rules: {
                            "test/test-service-rule": 2
                        }
                    };

                    const messages = linter.verify("0", config, filename);
                    const suppressedMessages = linter.getSuppressedMessages();

                    assert.strictEqual(messages.length, 1);
                    assert.strictEqual(messages[0].message, "Hi!");

                    assert.strictEqual(suppressedMessages.length, 0);
                });

                it("should use the same parserServices if source code object is reused", () => {

                    const config = {
                        plugins: {
                            test: {
                                parsers: {
                                    "enhanced-parser": testParsers.enhancedParser
                                },
                                rules: {
                                    "test-service-rule": context => ({
                                        Literal(node) {
                                            context.report({
                                                node,
                                                message: context.parserServices.test.getMessage()
                                            });
                                        }
                                    })
                                }
                            }
                        },
                        languageOptions: {
                            parser: "test/enhanced-parser"
                        },
                        rules: {
                            "test/test-service-rule": 2
                        }
                    };

                    const messages = linter.verify("0", config, filename);
                    const suppressedMessages = linter.getSuppressedMessages();

                    assert.strictEqual(messages.length, 1);
                    assert.strictEqual(messages[0].message, "Hi!");
                    assert.strictEqual(suppressedMessages.length, 0);

                    const messages2 = linter.verify(linter.getSourceCode(), config, filename);
                    const suppressedMessages2 = linter.getSuppressedMessages();

                    assert.strictEqual(messages2.length, 1);
                    assert.strictEqual(messages2[0].message, "Hi!");
                    assert.strictEqual(suppressedMessages2.length, 0);
                });

                it("should pass parser as context.languageOptions.parser to all rules when default parser is used", () => {

                    // references to Espree get messed up in a browser context, so wrap it
                    const fakeParser = {
                        parse: espree.parse
                    };

                    const spy = sinon.spy(context => {
                        assert.strictEqual(context.languageOptions.parser, fakeParser);
                        return {};
                    });

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    "test-rule": spy
                                }
                            }
                        },
                        languageOptions: {
                            parser: fakeParser
                        },
                        rules: {
                            "test/test-rule": 2
                        }
                    };

                    linter.verify("0", config, filename);
                    assert.isTrue(spy.calledOnce);
                });


                describe("Custom Parsers", () => {

                    const errorPrefix = "Parsing error: ";

                    it("should have file path passed to it", () => {
                        const code = "/* this is code */";
                        const parseSpy = sinon.spy(testParsers.stubParser, "parse");
                        const config = {
                            languageOptions: {
                                parser: testParsers.stubParser
                            }
                        };

                        linter.verify(code, config, filename, true);

                        sinon.assert.calledWithMatch(parseSpy, "", { filePath: filename });
                    });

                    it("should not report an error when JSX code contains a spread operator and JSX is enabled", () => {
                        const code = "var myDivElement = <div {...this.props} />;";
                        const config = {
                            languageOptions: {
                                parser: esprima,
                                parserOptions: {
                                    jsx: true
                                }
                            }
                        };

                        const messages = linter.verify(code, config, filename);
                        const suppressedMessages = linter.getSuppressedMessages();

                        assert.strictEqual(messages.length, 0);
                        assert.strictEqual(suppressedMessages.length, 0);
                    });

                    it("should not throw or report errors when the custom parser returns unrecognized operators (https://github.com/eslint/eslint/issues/10475)", () => {
                        const code = "null %% 'foo'";
                        const config = {
                            languageOptions: {
                                parser: testParsers.unknownLogicalOperator
                            }
                        };

                        // This shouldn't throw
                        const messages = linter.verify(code, config, filename);
                        const suppressedMessages = linter.getSuppressedMessages();

                        assert.strictEqual(messages.length, 0);
                        assert.strictEqual(suppressedMessages.length, 0);
                    });

                    it("should not throw or report errors when the custom parser returns nested unrecognized operators (https://github.com/eslint/eslint/issues/10560)", () => {
                        const code = "foo && bar %% baz";
                        const config = {
                            languageOptions: {
                                parser: testParsers.unknownLogicalOperatorNested
                            }
                        };

                        // This shouldn't throw
                        const messages = linter.verify(code, config, filename);
                        const suppressedMessages = linter.getSuppressedMessages();

                        assert.strictEqual(messages.length, 0);
                        assert.strictEqual(suppressedMessages.length, 0);
                    });

                    it("should not throw or return errors when the custom parser returns unknown AST nodes", () => {
                        const code = "foo && bar %% baz";
                        const nodes = [];
                        const config = {
                            plugins: {
                                test: {
                                    rules: {
                                        "collect-node-types": () => ({
                                            "*"(node) {
                                                nodes.push(node.type);
                                            }
                                        })
                                    }
                                }
                            },
                            languageOptions: {
                                parser: testParsers.nonJSParser
                            },
                            rules: {
                                "test/collect-node-types": "error"
                            }
                        };

                        const messages = linter.verify(code, config, filename, true);
                        const suppressedMessages = linter.getSuppressedMessages();

                        assert.strictEqual(messages.length, 0);
                        assert.isTrue(nodes.length > 0);
                        assert.strictEqual(suppressedMessages.length, 0);
                    });

                    it("should strip leading line: prefix from parser error", () => {
                        const messages = linter.verify(";", {
                            languageOptions: {
                                parser: testParsers.lineError
                            }
                        }, "filename");
                        const suppressedMessages = linter.getSuppressedMessages();

                        assert.strictEqual(messages.length, 1);
                        assert.strictEqual(messages[0].severity, 2);
                        assert.strictEqual(messages[0].message, errorPrefix + testParsers.lineError.expectedError);

                        assert.strictEqual(suppressedMessages.length, 0);
                    });

                    it("should not modify a parser error message without a leading line: prefix", () => {
                        const messages = linter.verify(";", {
                            languageOptions: {
                                parser: testParsers.noLineError
                            }
                        }, "filename");
                        const suppressedMessages = linter.getSuppressedMessages();

                        assert.strictEqual(messages.length, 1);
                        assert.strictEqual(messages[0].severity, 2);
                        assert.strictEqual(messages[0].message, errorPrefix + testParsers.noLineError.expectedError);

                        assert.strictEqual(suppressedMessages.length, 0);
                    });

                    describe("if a parser provides 'visitorKeys'", () => {
                        let types = [];
                        let sourceCode;
                        let scopeManager;
                        let firstChildNodes = [];

                        beforeEach(() => {
                            types = [];
                            firstChildNodes = [];
                            const config = {
                                plugins: {
                                    test: {
                                        rules: {
                                            "collect-node-types": () => ({
                                                "*"(node) {
                                                    types.push(node.type);
                                                }
                                            }),
                                            "save-scope-manager": context => {
                                                scopeManager = context.getSourceCode().scopeManager;

                                                return {};
                                            },
                                            "esquery-option": () => ({
                                                ":first-child"(node) {
                                                    firstChildNodes.push(node);
                                                }
                                            })
                                        }
                                    }
                                },
                                languageOptions: {
                                    parser: testParsers.enhancedParser2
                                },
                                rules: {
                                    "test/collect-node-types": "error",
                                    "test/save-scope-manager": "error",
                                    "test/esquery-option": "error"
                                }
                            };

                            linter.verify("@foo class A {}", config);

                            sourceCode = linter.getSourceCode();
                        });

                        it("Traverser should use the visitorKeys (so 'types' includes 'Decorator')", () => {
                            assert.deepStrictEqual(
                                types,
                                ["Program", "ClassDeclaration", "Decorator", "Identifier", "Identifier", "ClassBody"]
                            );
                        });

                        it("ec0lint-scope should use the visitorKeys (so 'childVisitorKeys.ClassDeclaration' includes 'experimentalDecorators')", () => {
                            assert.deepStrictEqual(
                                scopeManager.__options.childVisitorKeys.ClassDeclaration,
                                ["experimentalDecorators", "id", "superClass", "body"]
                            );
                        });

                        it("should use the same visitorKeys if the source code object is reused", () => {
                            const types2 = [];
                            const config = {
                                plugins: {
                                    test: {
                                        rules: {
                                            "collect-node-types": () => ({
                                                "*"(node) {
                                                    types2.push(node.type);
                                                }
                                            })
                                        }
                                    }
                                },
                                rules: {
                                    "test/collect-node-types": "error"
                                }
                            };

                            linter.verify(sourceCode, config);

                            assert.deepStrictEqual(
                                types2,
                                ["Program", "ClassDeclaration", "Decorator", "Identifier", "Identifier", "ClassBody"]
                            );
                        });

                        it("esquery should use the visitorKeys (so 'visitorKeys.ClassDeclaration' includes 'experimentalDecorators')", () => {
                            assert.deepStrictEqual(
                                firstChildNodes,
                                [sourceCode.ast.body[0], sourceCode.ast.body[0].experimentalDecorators[0]]
                            );
                        });
                    });

                    describe("if a parser provides 'scope'", () => {
                        let scope = null;
                        let sourceCode = null;

                        beforeEach(() => {
                            const config = {
                                plugins: {
                                    test: {
                                        rules: {
                                            "save-scope1": context => ({
                                                Program() {
                                                    scope = context.getScope();
                                                }
                                            })
                                        }
                                    }
                                },
                                languageOptions: {
                                    parser: testParsers.enhancedParser3
                                },
                                rules: {
                                    "test/save-scope1": "error"
                                }
                            };

                            linter.verify("@foo class A {}", config);

                            sourceCode = linter.getSourceCode();
                        });

                        it("should use the scope (so the global scope has the reference of '@foo')", () => {
                            assert.strictEqual(scope.references.length, 1);
                            assert.deepStrictEqual(
                                scope.references[0].identifier.name,
                                "foo"
                            );
                        });

                        it("should use the same scope if the source code object is reused", () => {
                            let scope2 = null;
                            const config = {
                                plugins: {
                                    test: {
                                        rules: {
                                            "save-scope2": context => ({
                                                Program() {
                                                    scope2 = context.getScope();
                                                }
                                            })
                                        }
                                    }
                                },
                                rules: {
                                    "test/save-scope2": "error"
                                }
                            };

                            linter.verify(sourceCode, config, "test.js");

                            assert(scope2 !== null);
                            assert(scope2 === scope);
                        });
                    });

                    it("should pass default languageOptions to the parser", () => {

                        const spy = sinon.spy((code, options) => espree.parse(code, options));

                        linter.verify(";", {
                            languageOptions: {
                                parser: {
                                    parse: spy
                                }
                            }
                        }, "filename.js");

                        assert(spy.calledWithMatch(";", {
                            ecmaVersion: espree.latestEcmaVersion + 2009,
                            sourceType: "module"
                        }));
                    });
                });


            });

            describe("parseOptions", () => {

                it("should pass ecmaFeatures to all rules when provided on config", () => {

                    const parserOptions = {
                        ecmaFeatures: {
                            jsx: true
                        }
                    };

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    "test-rule": sinon.mock().withArgs(
                                        sinon.match({ languageOptions: { parserOptions } })
                                    ).returns({})
                                }
                            }
                        },
                        languageOptions: {
                            parserOptions
                        },
                        rules: {
                            "test/test-rule": 2
                        }
                    };

                    linter.verify("0", config, filename);
                });

                it("should switch globalReturn to false if sourceType is module", () => {

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    "test-rule": sinon.mock().withArgs(
                                        sinon.match({
                                            languageOptions: {
                                                parserOptions: {
                                                    ecmaFeatures: {
                                                        globalReturn: false
                                                    }
                                                }
                                            }
                                        })
                                    ).returns({})
                                }
                            }
                        },
                        languageOptions: {
                            sourceType: "module",
                            parserOptions: {
                                ecmaFeatures: {
                                    globalReturn: true
                                }
                            }
                        },
                        rules: {
                            "test/test-rule": 2
                        }
                    };

                    linter.verify("0", config, filename);
                });

                it("should not parse sloppy-mode code when impliedStrict is true", () => {

                    const messages = linter.verify("var private;", {
                        languageOptions: {
                            parserOptions: {
                                ecmaFeatures: {
                                    impliedStrict: true
                                }
                            }
                        }
                    }, filename);
                    const suppressedMessages = linter.getSuppressedMessages();

                    assert.strictEqual(messages.length, 1);
                    assert.strictEqual(messages[0].message, "Parsing error: The keyword 'private' is reserved");

                    assert.strictEqual(suppressedMessages.length, 0);
                });

                it("should properly parse valid code when impliedStrict is true", () => {

                    const messages = linter.verify("var foo;", {
                        languageOptions: {
                            parserOptions: {
                                ecmaFeatures: {
                                    impliedStrict: true
                                }
                            }
                        }
                    }, filename);
                    const suppressedMessages = linter.getSuppressedMessages();

                    assert.strictEqual(messages.length, 0);
                    assert.strictEqual(suppressedMessages.length, 0);
                });

                it("should properly parse JSX when passed ecmaFeatures", () => {

                    const messages = linter.verify("var x = <div/>;", {
                        languageOptions: {
                            parserOptions: {
                                ecmaFeatures: {
                                    jsx: true
                                }
                            }
                        }
                    }, filename);
                    const suppressedMessages = linter.getSuppressedMessages();

                    assert.strictEqual(messages.length, 0);
                    assert.strictEqual(suppressedMessages.length, 0);
                });

                it("should report an error when JSX code is encountered and JSX is not enabled", () => {
                    const code = "var myDivElement = <div className=\"foo\" />;";
                    const messages = linter.verify(code, {}, "filename");
                    const suppressedMessages = linter.getSuppressedMessages();

                    assert.strictEqual(messages.length, 1);
                    assert.strictEqual(messages[0].line, 1);
                    assert.strictEqual(messages[0].column, 20);
                    assert.strictEqual(messages[0].message, "Parsing error: Unexpected token <");

                    assert.strictEqual(suppressedMessages.length, 0);
                });

                it("should not report an error when JSX code is encountered and JSX is enabled", () => {
                    const code = "var myDivElement = <div className=\"foo\" />;";
                    const messages = linter.verify(code, {
                        languageOptions: {
                            parserOptions: {
                                ecmaFeatures: {
                                    jsx: true
                                }
                            }
                        }
                    }, "filename");
                    const suppressedMessages = linter.getSuppressedMessages();

                    assert.strictEqual(messages.length, 0);
                    assert.strictEqual(suppressedMessages.length, 0);
                });

                it("should not report an error when JSX code contains a spread operator and JSX is enabled", () => {
                    const code = "var myDivElement = <div {...this.props} />;";
                    const messages = linter.verify(code, {
                        languageOptions: {
                            ecmaVersion: 6,
                            parserOptions: {
                                ecmaFeatures: {
                                    jsx: true
                                }
                            }
                        }

                    }, "filename");
                    const suppressedMessages = linter.getSuppressedMessages();

                    assert.strictEqual(messages.length, 0);
                    assert.strictEqual(suppressedMessages.length, 0);
                });

                it("should not allow the use of reserved words as variable names in ES3", () => {
                    const code = "var char;";
                    const messages = linter.verify(code, {
                        languageOptions: {
                            ecmaVersion: 3,
                            sourceType: "script"
                        }
                    }, filename);

                    assert.strictEqual(messages.length, 1);
                    assert.strictEqual(messages[0].severity, 2);
                    assert.isTrue(messages[0].fatal);
                    assert.match(messages[0].message, /^Parsing error:.*'char'/u);
                });

                it("should not allow the use of reserved words as property names in member expressions in ES3", () => {
                    const code = "obj.char;";
                    const messages = linter.verify(code, {
                        languageOptions: {
                            ecmaVersion: 3,
                            sourceType: "script"
                        }
                    }, filename);

                    assert.strictEqual(messages.length, 1);
                    assert.strictEqual(messages[0].severity, 2);
                    assert.isTrue(messages[0].fatal);
                    assert.match(messages[0].message, /^Parsing error:.*'char'/u);
                });

                it("should not allow the use of reserved words as property names in object literals in ES3", () => {
                    const code = "var obj = { char: 1 };";
                    const messages = linter.verify(code, {
                        languageOptions: {
                            ecmaVersion: 3,
                            sourceType: "script"
                        }
                    }, filename);

                    assert.strictEqual(messages.length, 1);
                    assert.strictEqual(messages[0].severity, 2);
                    assert.isTrue(messages[0].fatal);
                    assert.match(messages[0].message, /^Parsing error:.*'char'/u);
                });

                it("should allow the use of reserved words as variable and property names in ES3 when allowReserved is true", () => {
                    const code = "var char; obj.char; var obj = { char: 1 };";
                    const messages = linter.verify(code, {
                        languageOptions: {
                            ecmaVersion: 3,
                            sourceType: "script",
                            parserOptions: {
                                allowReserved: true
                            }
                        }
                    }, filename);

                    assert.strictEqual(messages.length, 0);
                });

                it("should not allow the use of reserved words as variable names in ES > 3", () => {
                    const ecmaVersions = [void 0, ...espree.supportedEcmaVersions.filter(ecmaVersion => ecmaVersion > 3)];

                    ecmaVersions.forEach(ecmaVersion => {
                        const code = "var enum;";
                        const messages = linter.verify(code, {
                            languageOptions: {
                                ...ecmaVersion ? { ecmaVersion } : {},
                                sourceType: "script"
                            }
                        }, filename);

                        assert.strictEqual(messages.length, 1);
                        assert.strictEqual(messages[0].severity, 2);
                        assert.isTrue(messages[0].fatal);
                        assert.match(messages[0].message, /^Parsing error:.*'enum'/u);
                    });
                });

                it("should allow the use of reserved words as property names in ES > 3", () => {
                    const ecmaVersions = [void 0, ...espree.supportedEcmaVersions.filter(ecmaVersion => ecmaVersion > 3)];

                    ecmaVersions.forEach(ecmaVersion => {
                        const code = "obj.enum; obj.function; var obj = { enum: 1, function: 2 };";
                        const messages = linter.verify(code, {
                            languageOptions: {
                                ...ecmaVersion ? { ecmaVersion } : {},
                                sourceType: "script"
                            }
                        }, filename);

                        assert.strictEqual(messages.length, 0);
                    });
                });

                it("should not allow `allowReserved: true` in ES > 3", () => {
                    const ecmaVersions = [void 0, ...espree.supportedEcmaVersions.filter(ecmaVersion => ecmaVersion > 3)];

                    ecmaVersions.forEach(ecmaVersion => {
                        const code = "";
                        const messages = linter.verify(code, {
                            languageOptions: {
                                ...ecmaVersion ? { ecmaVersion } : {},
                                sourceType: "script",
                                parserOptions: {
                                    allowReserved: true
                                }
                            }
                        }, filename);

                        assert.strictEqual(messages.length, 1);
                        assert.strictEqual(messages[0].severity, 2);
                        assert.isTrue(messages[0].fatal);
                        assert.match(messages[0].message, /^Parsing error:.*allowReserved/u);
                    });
                });
            });
        });

        describe("settings", () => {
            const ruleId = "test-rule";

            it("should pass settings to all rules", () => {

                const config = {
                    plugins: {
                        test: {
                            rules: {
                                [ruleId]: context => ({
                                    Literal(node) {
                                        context.report(node, context.settings.info);
                                    }
                                })
                            }
                        }
                    },
                    settings: {
                        info: "Hello"
                    },
                    rules: {
                        [`test/${ruleId}`]: 1
                    }
                };

                const messages = linter.verify("0", config, filename);
                const suppressedMessages = linter.getSuppressedMessages();

                assert.strictEqual(messages.length, 1);
                assert.strictEqual(messages[0].message, "Hello");

                assert.strictEqual(suppressedMessages.length, 0);
            });

            it("should not have any settings if they were not passed in", () => {

                const config = {
                    plugins: {
                        test: {
                            rules: {
                                [ruleId]: context => ({
                                    Literal(node) {
                                        if (Object.getOwnPropertyNames(context.settings).length !== 0) {
                                            context.report(node, "Settings should be empty");
                                        }
                                    }
                                })
                            }
                        }
                    },
                    settings: {
                    },
                    rules: {
                        [`test/${ruleId}`]: 1
                    }
                };

                const messages = linter.verify("0", config, filename);
                const suppressedMessages = linter.getSuppressedMessages();

                assert.strictEqual(messages.length, 0);
                assert.strictEqual(suppressedMessages.length, 0);
            });
        });

        describe("rules", () => {
            const code = "var answer = 6 * 7";

            it("should process empty config", () => {
                const config = {};
                const messages = linter.verify(code, config, filename, true);
                const suppressedMessages = linter.getSuppressedMessages();

                assert.strictEqual(messages.length, 0);
                assert.strictEqual(suppressedMessages.length, 0);
            });
        });

    });

    describe("verify()", () => {

        describe("Plugins", () => {

            it("should not load rule definition when rule isn't used", () => {

                const spy = sinon.spy();

                const config = {
                    plugins: {
                        test: {
                            rules: {
                                checker: spy
                            }
                        }
                    }
                };

                linter.verify("code", config, filename);
                assert.isTrue(spy.notCalled, "Rule should not have been called");
            });
        });

        describe("Rule Internals", () => {

            const code = TEST_CODE;

            it("should throw an error when an error occurs inside of a rule visitor", () => {
                const config = {
                    plugins: {
                        test: {
                            rules: {
                                checker: () => ({
                                    Program() {
                                        throw new Error("Intentional error.");
                                    }
                                })
                            }
                        }
                    },
                    rules: { "test/checker": "error" }
                };

                assert.throws(() => {
                    linter.verify(code, config, filename);
                }, `Intentional error.\nOccurred while linting ${filename}:1\nRule: "test/checker"`);
            });

            it("should not call rule visitor with a `this` value", () => {
                const spy = sinon.spy();
                const config = {
                    plugins: {
                        test: {
                            rules: {
                                checker: () => ({
                                    Program: spy
                                })
                            }
                        }
                    },
                    rules: { "test/checker": "error" }
                };

                linter.verify("foo", config);
                assert(spy.calledOnce);
                assert.strictEqual(spy.firstCall.thisValue, void 0);
            });

            it("should have all the `parent` properties on nodes when the rule visitors are created", () => {
                const spy = sinon.spy(context => {
                    const ast = context.getSourceCode().ast;

                    assert.strictEqual(ast.body[0].parent, ast);
                    assert.strictEqual(ast.body[0].expression.parent, ast.body[0]);
                    assert.strictEqual(ast.body[0].expression.left.parent, ast.body[0].expression);
                    assert.strictEqual(ast.body[0].expression.right.parent, ast.body[0].expression);

                    return {};
                });

                const config = {
                    plugins: {
                        test: {
                            rules: {
                                checker: spy
                            }
                        }
                    },
                    rules: { "test/checker": "error" }
                };

                linter.verify("foo + bar", config);
                assert(spy.calledOnce);
            });

            it("events for each node type should fire", () => {

                // spies for various AST node types
                const spyLiteral = sinon.spy(),
                    spyVariableDeclarator = sinon.spy(),
                    spyVariableDeclaration = sinon.spy(),
                    spyIdentifier = sinon.spy(),
                    spyBinaryExpression = sinon.spy();

                const config = {
                    plugins: {
                        test: {
                            rules: {
                                checker() {
                                    return {
                                        Literal: spyLiteral,
                                        VariableDeclarator: spyVariableDeclarator,
                                        VariableDeclaration: spyVariableDeclaration,
                                        Identifier: spyIdentifier,
                                        BinaryExpression: spyBinaryExpression
                                    };
                                }
                            }
                        }
                    },
                    rules: { "test/checker": "error" }
                };

                const messages = linter.verify(code, config, filename, true);
                const suppressedMessages = linter.getSuppressedMessages();

                assert.strictEqual(messages.length, 0);
                sinon.assert.calledOnce(spyVariableDeclaration);
                sinon.assert.calledOnce(spyVariableDeclarator);
                sinon.assert.calledOnce(spyIdentifier);
                sinon.assert.calledTwice(spyLiteral);
                sinon.assert.calledOnce(spyBinaryExpression);

                assert.strictEqual(suppressedMessages.length, 0);
            });

            it("should throw an error if a rule reports a problem without a message", () => {

                const config = {
                    plugins: {
                        test: {
                            rules: {
                                "invalid-report"(context) {
                                    return {
                                        Program(node) {
                                            context.report({ node });
                                        }
                                    };
                                }
                            }
                        }
                    },
                    rules: { "test/invalid-report": "error" }
                };

                assert.throws(
                    () => linter.verify("foo", config),
                    TypeError,
                    "Missing `message` property in report() call; add a message that describes the linting problem."
                );
            });


        });

        describe("Rule Context", () => {

            describe("context.getFilename()", () => {
                const ruleId = "filename-rule";

                it("has access to the filename", () => {

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    [ruleId]: context => ({
                                        Literal(node) {
                                            context.report(node, context.getFilename());
                                        }
                                    })
                                }
                            }
                        },
                        rules: {
                            [`test/${ruleId}`]: 1
                        }
                    };

                    const messages = linter.verify("0", config, filename);
                    const suppressedMessages = linter.getSuppressedMessages();

                    assert.strictEqual(messages[0].message, filename);
                    assert.strictEqual(suppressedMessages.length, 0);
                });

                it("defaults filename to '<input>'", () => {

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    [ruleId]: context => ({
                                        Literal(node) {
                                            context.report(node, context.getFilename());
                                        }
                                    })
                                }
                            }
                        },
                        rules: {
                            [`test/${ruleId}`]: 1
                        }
                    };


                    const messages = linter.verify("0", config);
                    const suppressedMessages = linter.getSuppressedMessages();

                    assert.strictEqual(messages[0].message, "<input>");
                    assert.strictEqual(suppressedMessages.length, 0);
                });
            });

            describe("context.getPhysicalFilename()", () => {

                const ruleId = "filename-rule";

                it("has access to the physicalFilename", () => {

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    [ruleId]: context => ({
                                        Literal(node) {
                                            context.report(node, context.getPhysicalFilename());
                                        }
                                    })
                                }
                            }
                        },
                        rules: {
                            [`test/${ruleId}`]: 1
                        }
                    };

                    const messages = linter.verify("0", config, filename);
                    const suppressedMessages = linter.getSuppressedMessages();

                    assert.strictEqual(messages[0].message, filename);
                    assert.strictEqual(suppressedMessages.length, 0);
                });

            });

            describe("context.getSourceLines()", () => {

                it("should get proper lines when using \\n as a line break", () => {
                    const code = "a;\nb;";
                    const spy = sinon.spy(context => {
                        assert.deepStrictEqual(context.getSourceLines(), ["a;", "b;"]);
                        return {};
                    });

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: spy
                                }
                            }
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify(code, config);
                    assert(spy.calledOnce);
                });

                it("should get proper lines when using \\r\\n as a line break", () => {
                    const code = "a;\r\nb;";
                    const spy = sinon.spy(context => {
                        assert.deepStrictEqual(context.getSourceLines(), ["a;", "b;"]);
                        return {};
                    });

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: spy
                                }
                            }
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify(code, config);
                    assert(spy.calledOnce);
                });

                it("should get proper lines when using \\r as a line break", () => {
                    const code = "a;\rb;";
                    const spy = sinon.spy(context => {
                        assert.deepStrictEqual(context.getSourceLines(), ["a;", "b;"]);
                        return {};
                    });

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: spy
                                }
                            }
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify(code, config);
                    assert(spy.calledOnce);
                });

                it("should get proper lines when using \\u2028 as a line break", () => {
                    const code = "a;\u2028b;";
                    const spy = sinon.spy(context => {
                        assert.deepStrictEqual(context.getSourceLines(), ["a;", "b;"]);
                        return {};
                    });

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: spy
                                }
                            }
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify(code, config);
                    assert(spy.calledOnce);
                });

                it("should get proper lines when using \\u2029 as a line break", () => {
                    const code = "a;\u2029b;";
                    const spy = sinon.spy(context => {
                        assert.deepStrictEqual(context.getSourceLines(), ["a;", "b;"]);
                        return {};
                    });

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: spy
                                }
                            }
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify(code, config);
                    assert(spy.calledOnce);
                });

            });

            describe("context.getSource()", () => {
                const code = TEST_CODE;

                it("should retrieve all text when used without parameters", () => {

                    let spy;

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: context => {
                                        spy = sinon.spy(() => {
                                            assert.strictEqual(context.getSource(), TEST_CODE);
                                        });
                                        return { Program: spy };
                                    }
                                }
                            }
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify(code, config);
                    assert(spy && spy.calledOnce);
                });

                it("should retrieve all text for root node", () => {

                    let spy;

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: context => {
                                        spy = sinon.spy(node => {
                                            assert.strictEqual(context.getSource(node), TEST_CODE);
                                        });
                                        return { Program: spy };
                                    }
                                }
                            }
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify(code, config);
                    assert(spy && spy.calledOnce);
                });

                it("should clamp to valid range when retrieving characters before start of source", () => {
                    let spy;

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: context => {
                                        spy = sinon.spy(node => {
                                            assert.strictEqual(context.getSource(node, 2, 0), TEST_CODE);
                                        });
                                        return { Program: spy };
                                    }
                                }
                            }
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify(code, config);
                    assert(spy && spy.calledOnce);
                });

                it("should retrieve all text for binary expression", () => {
                    let spy;

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: context => {
                                        spy = sinon.spy(node => {
                                            assert.strictEqual(context.getSource(node), "6 * 7");
                                        });
                                        return { BinaryExpression: spy };
                                    }
                                }
                            }
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify(code, config);
                    assert(spy && spy.calledOnce);
                });

                it("should retrieve all text plus two characters before for binary expression", () => {
                    let spy;

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: context => {
                                        spy = sinon.spy(node => {
                                            assert.strictEqual(context.getSource(node, 2), "= 6 * 7");
                                        });
                                        return { BinaryExpression: spy };
                                    }
                                }
                            }
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify(code, config);
                    assert(spy && spy.calledOnce);
                });

                it("should retrieve all text plus one character after for binary expression", () => {
                    let spy;

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: context => {
                                        spy = sinon.spy(node => {
                                            assert.strictEqual(context.getSource(node, 0, 1), "6 * 7;");
                                        });
                                        return { BinaryExpression: spy };
                                    }
                                }
                            }
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify(code, config);
                    assert(spy && spy.calledOnce);
                });

                it("should retrieve all text plus two characters before and one character after for binary expression", () => {
                    let spy;

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: context => {
                                        spy = sinon.spy(node => {
                                            assert.strictEqual(context.getSource(node, 2, 1), "= 6 * 7;");
                                        });
                                        return { BinaryExpression: spy };
                                    }
                                }
                            }
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify(code, config);
                    assert(spy && spy.calledOnce);
                });

            });

            describe("context.getAncestors()", () => {
                const code = TEST_CODE;

                it("should retrieve all ancestors when used", () => {

                    let spy;

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: context => {
                                        spy = sinon.spy(() => {
                                            const ancestors = context.getAncestors();

                                            assert.strictEqual(ancestors.length, 3);
                                        });
                                        return { BinaryExpression: spy };
                                    }
                                }
                            }
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify(code, config, filename, true);
                    assert(spy && spy.calledOnce);
                });

                it("should retrieve empty ancestors for root node", () => {
                    let spy;

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: context => {
                                        spy = sinon.spy(() => {
                                            const ancestors = context.getAncestors();

                                            assert.strictEqual(ancestors.length, 0);
                                        });

                                        return { Program: spy };
                                    }
                                }
                            }
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify(code, config);
                    assert(spy && spy.calledOnce);
                });
            });

            describe("context.getNodeByRangeIndex()", () => {
                const code = TEST_CODE;

                it("should retrieve a node starting at the given index", () => {
                    const spy = sinon.spy(context => {
                        assert.strictEqual(context.getNodeByRangeIndex(4).type, "Identifier");
                        return {};
                    });

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: spy
                                }
                            }
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify(code, config);
                    assert(spy.calledOnce);
                });

                it("should retrieve a node containing the given index", () => {
                    const spy = sinon.spy(context => {
                        assert.strictEqual(context.getNodeByRangeIndex(6).type, "Identifier");
                        return {};
                    });

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: spy
                                }
                            }
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify(code, config);
                    assert(spy.calledOnce);
                });

                it("should retrieve a node that is exactly the given index", () => {
                    const spy = sinon.spy(context => {
                        const node = context.getNodeByRangeIndex(13);

                        assert.strictEqual(node.type, "Literal");
                        assert.strictEqual(node.value, 6);
                        return {};
                    });

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: spy
                                }
                            }
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify(code, config);
                    assert(spy.calledOnce);
                });

                it("should retrieve a node ending with the given index", () => {
                    const spy = sinon.spy(context => {
                        assert.strictEqual(context.getNodeByRangeIndex(9).type, "Identifier");
                        return {};
                    });

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: spy
                                }
                            }
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify(code, config);
                    assert(spy.calledOnce);
                });

                it("should retrieve the deepest node containing the given index", () => {
                    const spy = sinon.spy(context => {
                        const node1 = context.getNodeByRangeIndex(14);

                        assert.strictEqual(node1.type, "BinaryExpression");

                        const node2 = context.getNodeByRangeIndex(3);

                        assert.strictEqual(node2.type, "VariableDeclaration");
                        return {};
                    });

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: spy
                                }
                            }
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify(code, config);
                    assert(spy.calledOnce);
                });

                it("should return null if the index is outside the range of any node", () => {
                    const spy = sinon.spy(context => {
                        const node1 = context.getNodeByRangeIndex(-1);

                        assert.isNull(node1);

                        const node2 = context.getNodeByRangeIndex(-99);

                        assert.isNull(node2);
                        return {};
                    });

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: spy
                                }
                            }
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify(code, config);
                    assert(spy.calledOnce);
                });
            });

            describe("context.getScope()", () => {
                const codeToTestScope = "function foo() { q: for(;;) { break q; } } function bar () { var q = t; } var baz = (() => { return 1; });";

                it("should retrieve the global scope correctly from a Program", () => {
                    let spy;

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: context => {
                                        spy = sinon.spy(() => {
                                            const scope = context.getScope();

                                            assert.strictEqual(scope.type, "global");
                                        });
                                        return { Program: spy };
                                    }
                                }
                            }
                        },
                        languageOptions: {
                            ecmaVersion: 6
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify(codeToTestScope, config);
                    assert(spy && spy.calledOnce);
                });

                it("should retrieve the function scope correctly from a FunctionDeclaration", () => {
                    let spy;

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: context => {
                                        spy = sinon.spy(() => {
                                            const scope = context.getScope();

                                            assert.strictEqual(scope.type, "function");
                                        });
                                        return { FunctionDeclaration: spy };
                                    }
                                }
                            }
                        },
                        languageOptions: {
                            ecmaVersion: 6
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify(codeToTestScope, config);
                    assert(spy && spy.calledTwice);
                });

                it("should retrieve the function scope correctly from a LabeledStatement", () => {
                    let spy;

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: context => {
                                        spy = sinon.spy(() => {
                                            const scope = context.getScope();

                                            assert.strictEqual(scope.type, "function");
                                            assert.strictEqual(scope.block.id.name, "foo");
                                        });
                                        return { LabeledStatement: spy };
                                    }
                                }
                            }
                        },
                        languageOptions: {
                            ecmaVersion: 6
                        },
                        rules: { "test/checker": "error" }
                    };


                    linter.verify(codeToTestScope, config);
                    assert(spy && spy.calledOnce);
                });

                it("should retrieve the function scope correctly from within an ArrowFunctionExpression", () => {
                    let spy;

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: context => {
                                        spy = sinon.spy(() => {
                                            const scope = context.getScope();

                                            assert.strictEqual(scope.type, "function");
                                            assert.strictEqual(scope.block.type, "ArrowFunctionExpression");
                                        });

                                        return { ReturnStatement: spy };
                                    }
                                }
                            }
                        },
                        languageOptions: {
                            ecmaVersion: 6
                        },
                        rules: { "test/checker": "error" }
                    };


                    linter.verify(codeToTestScope, config);
                    assert(spy && spy.calledOnce);
                });

                it("should retrieve the function scope correctly from within an SwitchStatement", () => {
                    let spy;

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: context => {
                                        spy = sinon.spy(() => {
                                            const scope = context.getScope();

                                            assert.strictEqual(scope.type, "switch");
                                            assert.strictEqual(scope.block.type, "SwitchStatement");
                                        });

                                        return { SwitchStatement: spy };
                                    }
                                }
                            }
                        },
                        languageOptions: {
                            ecmaVersion: 6
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify("switch(foo){ case 'a': var b = 'foo'; }", config);
                    assert(spy && spy.calledOnce);
                });

                it("should retrieve the function scope correctly from within a BlockStatement", () => {
                    let spy;

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: context => {
                                        spy = sinon.spy(() => {
                                            const scope = context.getScope();

                                            assert.strictEqual(scope.type, "block");
                                            assert.strictEqual(scope.block.type, "BlockStatement");
                                        });

                                        return { BlockStatement: spy };
                                    }
                                }
                            }
                        },
                        languageOptions: {
                            ecmaVersion: 6
                        },
                        rules: { "test/checker": "error" }
                    };


                    linter.verify("var x; {let y = 1}", config);
                    assert(spy && spy.calledOnce);
                });

                it("should retrieve the function scope correctly from within a nested block statement", () => {
                    let spy;

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: context => {
                                        spy = sinon.spy(() => {
                                            const scope = context.getScope();

                                            assert.strictEqual(scope.type, "block");
                                            assert.strictEqual(scope.block.type, "BlockStatement");
                                        });

                                        return { BlockStatement: spy };
                                    }
                                }
                            }
                        },
                        languageOptions: {
                            ecmaVersion: 6
                        },
                        rules: { "test/checker": "error" }
                    };


                    linter.verify("if (true) { let x = 1 }", config);
                    assert(spy && spy.calledOnce);
                });

                it("should retrieve the function scope correctly from within a FunctionDeclaration", () => {
                    let spy;

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: context => {
                                        spy = sinon.spy(() => {
                                            const scope = context.getScope();

                                            assert.strictEqual(scope.type, "function");
                                            assert.strictEqual(scope.block.type, "FunctionDeclaration");
                                        });

                                        return { FunctionDeclaration: spy };
                                    }
                                }
                            }
                        },
                        languageOptions: {
                            ecmaVersion: 6
                        },
                        rules: { "test/checker": "error" }
                    };


                    linter.verify("function foo() {}", config);
                    assert(spy && spy.calledOnce);
                });

                it("should retrieve the function scope correctly from within a FunctionExpression", () => {
                    let spy;

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: context => {
                                        spy = sinon.spy(() => {
                                            const scope = context.getScope();

                                            assert.strictEqual(scope.type, "function");
                                            assert.strictEqual(scope.block.type, "FunctionExpression");
                                        });

                                        return { FunctionExpression: spy };
                                    }
                                }
                            }
                        },
                        languageOptions: {
                            ecmaVersion: 6
                        },
                        rules: { "test/checker": "error" }
                    };


                    linter.verify("(function foo() {})();", config);
                    assert(spy && spy.calledOnce);
                });

                it("should retrieve the catch scope correctly from within a CatchClause", () => {
                    let spy;

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: context => {
                                        spy = sinon.spy(() => {
                                            const scope = context.getScope();

                                            assert.strictEqual(scope.type, "catch");
                                            assert.strictEqual(scope.block.type, "CatchClause");
                                        });

                                        return { CatchClause: spy };
                                    }
                                }
                            }
                        },
                        languageOptions: {
                            ecmaVersion: 6
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify("try {} catch (err) {}", config);
                    assert(spy && spy.calledOnce);
                });

                it("should retrieve module scope correctly from an ES6 module", () => {
                    let spy;

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: context => {
                                        spy = sinon.spy(() => {
                                            const scope = context.getScope();

                                            assert.strictEqual(scope.type, "module");
                                        });

                                        return { AssignmentExpression: spy };
                                    }
                                }
                            }
                        },
                        languageOptions: {
                            ecmaVersion: 6,
                            sourceType: "module"
                        },
                        rules: { "test/checker": "error" }
                    };


                    linter.verify("var foo = {}; foo.bar = 1;", config);
                    assert(spy && spy.calledOnce);
                });

                it("should retrieve function scope correctly when sourceType is commonjs", () => {
                    let spy;

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: context => {
                                        spy = sinon.spy(() => {
                                            const scope = context.getScope();

                                            assert.strictEqual(scope.type, "function");
                                        });

                                        return { AssignmentExpression: spy };
                                    }
                                }
                            }
                        },
                        languageOptions: {
                            ecmaVersion: 6,
                            sourceType: "commonjs"
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify("var foo = {}; foo.bar = 1;", config);
                    assert(spy && spy.calledOnce);
                });

                describe("Scope Internals", () => {

                    /**
                     * Get the scope on the node `astSelector` specified.
                     * @param {string} codeToEvaluate The source code to verify.
                     * @param {string} astSelector The AST selector to get scope.
                     * @param {number} [ecmaVersion=5] The ECMAScript version.
                     * @returns {{node: ASTNode, scope: escope.Scope}} Gotten scope.
                     */
                    function getScope(codeToEvaluate, astSelector, ecmaVersion = 5) {
                        let node, scope;

                        const config = {
                            plugins: {
                                test: {
                                    rules: {
                                        "get-scope": context => ({
                                            [astSelector](node0) {
                                                node = node0;
                                                scope = context.getScope();
                                            }
                                        })
                                    }
                                }
                            },
                            languageOptions: {
                                ecmaVersion,
                                sourceType: "script"
                            },
                            rules: { "test/get-scope": "error" }
                        };

                        linter.verify(
                            codeToEvaluate,
                            config
                        );

                        return { node, scope };
                    }

                    it("should return 'function' scope on FunctionDeclaration (ES5)", () => {
                        const { node, scope } = getScope("function f() {}", "FunctionDeclaration");

                        assert.strictEqual(scope.type, "function");
                        assert.strictEqual(scope.block, node);
                    });

                    it("should return 'function' scope on FunctionExpression (ES5)", () => {
                        const { node, scope } = getScope("!function f() {}", "FunctionExpression");

                        assert.strictEqual(scope.type, "function");
                        assert.strictEqual(scope.block, node);
                    });

                    it("should return 'function' scope on the body of FunctionDeclaration (ES5)", () => {
                        const { node, scope } = getScope("function f() {}", "BlockStatement");

                        assert.strictEqual(scope.type, "function");
                        assert.strictEqual(scope.block, node.parent);
                    });

                    it("should return 'function' scope on the body of FunctionDeclaration (ES2015)", () => {
                        const { node, scope } = getScope("function f() {}", "BlockStatement", 2015);

                        assert.strictEqual(scope.type, "function");
                        assert.strictEqual(scope.block, node.parent);
                    });

                    it("should return 'function' scope on BlockStatement in functions (ES5)", () => {
                        const { node, scope } = getScope("function f() { { var b; } }", "BlockStatement > BlockStatement");

                        assert.strictEqual(scope.type, "function");
                        assert.strictEqual(scope.block, node.parent.parent);
                        assert.deepStrictEqual(scope.variables.map(v => v.name), ["arguments", "b"]);
                    });

                    it("should return 'block' scope on BlockStatement in functions (ES2015)", () => {
                        const { node, scope } = getScope("function f() { { let a; var b; } }", "BlockStatement > BlockStatement", 2015);

                        assert.strictEqual(scope.type, "block");
                        assert.strictEqual(scope.upper.type, "function");
                        assert.strictEqual(scope.block, node);
                        assert.deepStrictEqual(scope.variables.map(v => v.name), ["a"]);
                        assert.deepStrictEqual(scope.variableScope.variables.map(v => v.name), ["arguments", "b"]);
                    });

                    it("should return 'block' scope on nested BlockStatement in functions (ES2015)", () => {
                        const { node, scope } = getScope("function f() { { let a; { let b; var c; } } }", "BlockStatement > BlockStatement > BlockStatement", 2015);

                        assert.strictEqual(scope.type, "block");
                        assert.strictEqual(scope.upper.type, "block");
                        assert.strictEqual(scope.upper.upper.type, "function");
                        assert.strictEqual(scope.block, node);
                        assert.deepStrictEqual(scope.variables.map(v => v.name), ["b"]);
                        assert.deepStrictEqual(scope.upper.variables.map(v => v.name), ["a"]);
                        assert.deepStrictEqual(scope.variableScope.variables.map(v => v.name), ["arguments", "c"]);
                    });

                    it("should return 'function' scope on SwitchStatement in functions (ES5)", () => {
                        const { node, scope } = getScope("function f() { switch (a) { case 0: var b; } }", "SwitchStatement");

                        assert.strictEqual(scope.type, "function");
                        assert.strictEqual(scope.block, node.parent.parent);
                        assert.deepStrictEqual(scope.variables.map(v => v.name), ["arguments", "b"]);
                    });

                    it("should return 'switch' scope on SwitchStatement in functions (ES2015)", () => {
                        const { node, scope } = getScope("function f() { switch (a) { case 0: let b; } }", "SwitchStatement", 2015);

                        assert.strictEqual(scope.type, "switch");
                        assert.strictEqual(scope.block, node);
                        assert.deepStrictEqual(scope.variables.map(v => v.name), ["b"]);
                    });

                    it("should return 'function' scope on SwitchCase in functions (ES5)", () => {
                        const { node, scope } = getScope("function f() { switch (a) { case 0: var b; } }", "SwitchCase");

                        assert.strictEqual(scope.type, "function");
                        assert.strictEqual(scope.block, node.parent.parent.parent);
                        assert.deepStrictEqual(scope.variables.map(v => v.name), ["arguments", "b"]);
                    });

                    it("should return 'switch' scope on SwitchCase in functions (ES2015)", () => {
                        const { node, scope } = getScope("function f() { switch (a) { case 0: let b; } }", "SwitchCase", 2015);

                        assert.strictEqual(scope.type, "switch");
                        assert.strictEqual(scope.block, node.parent);
                        assert.deepStrictEqual(scope.variables.map(v => v.name), ["b"]);
                    });

                    it("should return 'catch' scope on CatchClause in functions (ES5)", () => {
                        const { node, scope } = getScope("function f() { try {} catch (e) { var a; } }", "CatchClause");

                        assert.strictEqual(scope.type, "catch");
                        assert.strictEqual(scope.block, node);
                        assert.deepStrictEqual(scope.variables.map(v => v.name), ["e"]);
                    });

                    it("should return 'catch' scope on CatchClause in functions (ES2015)", () => {
                        const { node, scope } = getScope("function f() { try {} catch (e) { let a; } }", "CatchClause", 2015);

                        assert.strictEqual(scope.type, "catch");
                        assert.strictEqual(scope.block, node);
                        assert.deepStrictEqual(scope.variables.map(v => v.name), ["e"]);
                    });

                    it("should return 'catch' scope on the block of CatchClause in functions (ES5)", () => {
                        const { node, scope } = getScope("function f() { try {} catch (e) { var a; } }", "CatchClause > BlockStatement");

                        assert.strictEqual(scope.type, "catch");
                        assert.strictEqual(scope.block, node.parent);
                        assert.deepStrictEqual(scope.variables.map(v => v.name), ["e"]);
                    });

                    it("should return 'block' scope on the block of CatchClause in functions (ES2015)", () => {
                        const { node, scope } = getScope("function f() { try {} catch (e) { let a; } }", "CatchClause > BlockStatement", 2015);

                        assert.strictEqual(scope.type, "block");
                        assert.strictEqual(scope.block, node);
                        assert.deepStrictEqual(scope.variables.map(v => v.name), ["a"]);
                    });

                    it("should return 'function' scope on ForStatement in functions (ES5)", () => {
                        const { node, scope } = getScope("function f() { for (var i = 0; i < 10; ++i) {} }", "ForStatement");

                        assert.strictEqual(scope.type, "function");
                        assert.strictEqual(scope.block, node.parent.parent);
                        assert.deepStrictEqual(scope.variables.map(v => v.name), ["arguments", "i"]);
                    });

                    it("should return 'for' scope on ForStatement in functions (ES2015)", () => {
                        const { node, scope } = getScope("function f() { for (let i = 0; i < 10; ++i) {} }", "ForStatement", 2015);

                        assert.strictEqual(scope.type, "for");
                        assert.strictEqual(scope.block, node);
                        assert.deepStrictEqual(scope.variables.map(v => v.name), ["i"]);
                    });

                    it("should return 'function' scope on the block body of ForStatement in functions (ES5)", () => {
                        const { node, scope } = getScope("function f() { for (var i = 0; i < 10; ++i) {} }", "ForStatement > BlockStatement");

                        assert.strictEqual(scope.type, "function");
                        assert.strictEqual(scope.block, node.parent.parent.parent);
                        assert.deepStrictEqual(scope.variables.map(v => v.name), ["arguments", "i"]);
                    });

                    it("should return 'block' scope on the block body of ForStatement in functions (ES2015)", () => {
                        const { node, scope } = getScope("function f() { for (let i = 0; i < 10; ++i) {} }", "ForStatement > BlockStatement", 2015);

                        assert.strictEqual(scope.type, "block");
                        assert.strictEqual(scope.upper.type, "for");
                        assert.strictEqual(scope.block, node);
                        assert.deepStrictEqual(scope.variables.map(v => v.name), []);
                        assert.deepStrictEqual(scope.upper.variables.map(v => v.name), ["i"]);
                    });

                    it("should return 'function' scope on ForInStatement in functions (ES5)", () => {
                        const { node, scope } = getScope("function f() { for (var key in obj) {} }", "ForInStatement");

                        assert.strictEqual(scope.type, "function");
                        assert.strictEqual(scope.block, node.parent.parent);
                        assert.deepStrictEqual(scope.variables.map(v => v.name), ["arguments", "key"]);
                    });

                    it("should return 'for' scope on ForInStatement in functions (ES2015)", () => {
                        const { node, scope } = getScope("function f() { for (let key in obj) {} }", "ForInStatement", 2015);

                        assert.strictEqual(scope.type, "for");
                        assert.strictEqual(scope.block, node);
                        assert.deepStrictEqual(scope.variables.map(v => v.name), ["key"]);
                    });

                    it("should return 'function' scope on the block body of ForInStatement in functions (ES5)", () => {
                        const { node, scope } = getScope("function f() { for (var key in obj) {} }", "ForInStatement > BlockStatement");

                        assert.strictEqual(scope.type, "function");
                        assert.strictEqual(scope.block, node.parent.parent.parent);
                        assert.deepStrictEqual(scope.variables.map(v => v.name), ["arguments", "key"]);
                    });

                    it("should return 'block' scope on the block body of ForInStatement in functions (ES2015)", () => {
                        const { node, scope } = getScope("function f() { for (let key in obj) {} }", "ForInStatement > BlockStatement", 2015);

                        assert.strictEqual(scope.type, "block");
                        assert.strictEqual(scope.upper.type, "for");
                        assert.strictEqual(scope.block, node);
                        assert.deepStrictEqual(scope.variables.map(v => v.name), []);
                        assert.deepStrictEqual(scope.upper.variables.map(v => v.name), ["key"]);
                    });

                    it("should return 'for' scope on ForOfStatement in functions (ES2015)", () => {
                        const { node, scope } = getScope("function f() { for (let x of xs) {} }", "ForOfStatement", 2015);

                        assert.strictEqual(scope.type, "for");
                        assert.strictEqual(scope.block, node);
                        assert.deepStrictEqual(scope.variables.map(v => v.name), ["x"]);
                    });

                    it("should return 'block' scope on the block body of ForOfStatement in functions (ES2015)", () => {
                        const { node, scope } = getScope("function f() { for (let x of xs) {} }", "ForOfStatement > BlockStatement", 2015);

                        assert.strictEqual(scope.type, "block");
                        assert.strictEqual(scope.upper.type, "for");
                        assert.strictEqual(scope.block, node);
                        assert.deepStrictEqual(scope.variables.map(v => v.name), []);
                        assert.deepStrictEqual(scope.upper.variables.map(v => v.name), ["x"]);
                    });

                    it("should shadow the same name variable by the iteration variable.", () => {
                        const { node, scope } = getScope("let x; for (let x of x) {}", "ForOfStatement", 2015);

                        assert.strictEqual(scope.type, "for");
                        assert.strictEqual(scope.upper.type, "global");
                        assert.strictEqual(scope.block, node);
                        assert.strictEqual(scope.upper.variables[0].references.length, 0);
                        assert.strictEqual(scope.references[0].identifier, node.left.declarations[0].id);
                        assert.strictEqual(scope.references[1].identifier, node.right);
                        assert.strictEqual(scope.references[1].resolved, scope.variables[0]);
                    });
                });

                describe("Variables and references", () => {
                    const code = [
                        "a;",
                        "function foo() { b; }",
                        "Object;",
                        "foo;",
                        "var c;",
                        "c;",
                        "/* global d */",
                        "d;",
                        "e;",
                        "f;"
                    ].join("\n");
                    let scope = null;

                    beforeEach(() => {
                        let ok = false;

                        const config = {
                            plugins: {
                                test: {
                                    rules: {
                                        test(context) {
                                            return {
                                                Program() {
                                                    scope = context.getScope();
                                                    ok = true;
                                                }
                                            };
                                        }
                                    }
                                }
                            },
                            languageOptions: {
                                globals: { e: true, f: false },
                                sourceType: "script",
                                ecmaVersion: 5
                            },
                            rules: {
                                "test/test": 2
                            }
                        };

                        linter.verify(code, config);
                        assert(ok);
                    });

                    afterEach(() => {
                        scope = null;
                    });

                    it("Scope#through should contain references of undefined variables", () => {
                        assert.strictEqual(scope.through.length, 2);
                        assert.strictEqual(scope.through[0].identifier.name, "a");
                        assert.strictEqual(scope.through[0].identifier.loc.start.line, 1);
                        assert.strictEqual(scope.through[0].resolved, null);
                        assert.strictEqual(scope.through[1].identifier.name, "b");
                        assert.strictEqual(scope.through[1].identifier.loc.start.line, 2);
                        assert.strictEqual(scope.through[1].resolved, null);
                    });

                    it("Scope#variables should contain global variables", () => {
                        assert(scope.variables.some(v => v.name === "Object"));
                        assert(scope.variables.some(v => v.name === "foo"));
                        assert(scope.variables.some(v => v.name === "c"));
                        assert(scope.variables.some(v => v.name === "d"));
                        assert(scope.variables.some(v => v.name === "e"));
                        assert(scope.variables.some(v => v.name === "f"));
                    });

                    it("Scope#set should contain global variables", () => {
                        assert(scope.set.get("Object"));
                        assert(scope.set.get("foo"));
                        assert(scope.set.get("c"));
                        assert(scope.set.get("d"));
                        assert(scope.set.get("e"));
                        assert(scope.set.get("f"));
                    });

                    it("Variables#references should contain their references", () => {
                        assert.strictEqual(scope.set.get("Object").references.length, 1);
                        assert.strictEqual(scope.set.get("Object").references[0].identifier.name, "Object");
                        assert.strictEqual(scope.set.get("Object").references[0].identifier.loc.start.line, 3);
                        assert.strictEqual(scope.set.get("Object").references[0].resolved, scope.set.get("Object"));
                        assert.strictEqual(scope.set.get("foo").references.length, 1);
                        assert.strictEqual(scope.set.get("foo").references[0].identifier.name, "foo");
                        assert.strictEqual(scope.set.get("foo").references[0].identifier.loc.start.line, 4);
                        assert.strictEqual(scope.set.get("foo").references[0].resolved, scope.set.get("foo"));
                        assert.strictEqual(scope.set.get("c").references.length, 1);
                        assert.strictEqual(scope.set.get("c").references[0].identifier.name, "c");
                        assert.strictEqual(scope.set.get("c").references[0].identifier.loc.start.line, 6);
                        assert.strictEqual(scope.set.get("c").references[0].resolved, scope.set.get("c"));
                        assert.strictEqual(scope.set.get("d").references.length, 1);
                        assert.strictEqual(scope.set.get("d").references[0].identifier.name, "d");
                        assert.strictEqual(scope.set.get("d").references[0].identifier.loc.start.line, 8);
                        assert.strictEqual(scope.set.get("d").references[0].resolved, scope.set.get("d"));
                        assert.strictEqual(scope.set.get("e").references.length, 1);
                        assert.strictEqual(scope.set.get("e").references[0].identifier.name, "e");
                        assert.strictEqual(scope.set.get("e").references[0].identifier.loc.start.line, 9);
                        assert.strictEqual(scope.set.get("e").references[0].resolved, scope.set.get("e"));
                        assert.strictEqual(scope.set.get("f").references.length, 1);
                        assert.strictEqual(scope.set.get("f").references[0].identifier.name, "f");
                        assert.strictEqual(scope.set.get("f").references[0].identifier.loc.start.line, 10);
                        assert.strictEqual(scope.set.get("f").references[0].resolved, scope.set.get("f"));
                    });

                    it("Reference#resolved should be their variable", () => {
                        assert.strictEqual(scope.set.get("Object").references[0].resolved, scope.set.get("Object"));
                        assert.strictEqual(scope.set.get("foo").references[0].resolved, scope.set.get("foo"));
                        assert.strictEqual(scope.set.get("c").references[0].resolved, scope.set.get("c"));
                        assert.strictEqual(scope.set.get("d").references[0].resolved, scope.set.get("d"));
                        assert.strictEqual(scope.set.get("e").references[0].resolved, scope.set.get("e"));
                        assert.strictEqual(scope.set.get("f").references[0].resolved, scope.set.get("f"));
                    });
                });
            });

            describe("context.getDeclaredVariables(node)", () => {

                /**
                 * Assert `context.getDeclaredVariables(node)` is valid.
                 * @param {string} code A code to check.
                 * @param {string} type A type string of ASTNode. This method checks variables on the node of the type.
                 * @param {Array<Array<string>>} expectedNamesList An array of expected variable names. The expected variable names is an array of string.
                 * @returns {void}
                 */
                function verify(code, type, expectedNamesList) {
                    const config = {
                        plugins: {
                            test: {

                                rules: {
                                    test(context) {

                                        /**
                                         * Assert `context.getDeclaredVariables(node)` is empty.
                                         * @param {ASTNode} node A node to check.
                                         * @returns {void}
                                         */
                                        function checkEmpty(node) {
                                            assert.strictEqual(0, context.getDeclaredVariables(node).length);
                                        }
                                        const rule = {
                                            Program: checkEmpty,
                                            EmptyStatement: checkEmpty,
                                            BlockStatement: checkEmpty,
                                            ExpressionStatement: checkEmpty,
                                            LabeledStatement: checkEmpty,
                                            BreakStatement: checkEmpty,
                                            ContinueStatement: checkEmpty,
                                            WithStatement: checkEmpty,
                                            SwitchStatement: checkEmpty,
                                            ReturnStatement: checkEmpty,
                                            ThrowStatement: checkEmpty,
                                            TryStatement: checkEmpty,
                                            WhileStatement: checkEmpty,
                                            DoWhileStatement: checkEmpty,
                                            ForStatement: checkEmpty,
                                            ForInStatement: checkEmpty,
                                            DebuggerStatement: checkEmpty,
                                            ThisExpression: checkEmpty,
                                            ArrayExpression: checkEmpty,
                                            ObjectExpression: checkEmpty,
                                            Property: checkEmpty,
                                            SequenceExpression: checkEmpty,
                                            UnaryExpression: checkEmpty,
                                            BinaryExpression: checkEmpty,
                                            AssignmentExpression: checkEmpty,
                                            UpdateExpression: checkEmpty,
                                            LogicalExpression: checkEmpty,
                                            ConditionalExpression: checkEmpty,
                                            CallExpression: checkEmpty,
                                            NewExpression: checkEmpty,
                                            MemberExpression: checkEmpty,
                                            SwitchCase: checkEmpty,
                                            Identifier: checkEmpty,
                                            Literal: checkEmpty,
                                            ForOfStatement: checkEmpty,
                                            ArrowFunctionExpression: checkEmpty,
                                            YieldExpression: checkEmpty,
                                            TemplateLiteral: checkEmpty,
                                            TaggedTemplateExpression: checkEmpty,
                                            TemplateElement: checkEmpty,
                                            ObjectPattern: checkEmpty,
                                            ArrayPattern: checkEmpty,
                                            RestElement: checkEmpty,
                                            AssignmentPattern: checkEmpty,
                                            ClassBody: checkEmpty,
                                            MethodDefinition: checkEmpty,
                                            MetaProperty: checkEmpty
                                        };

                                        rule[type] = function (node) {
                                            const expectedNames = expectedNamesList.shift();
                                            const variables = context.getDeclaredVariables(node);

                                            assert(Array.isArray(expectedNames));
                                            assert(Array.isArray(variables));
                                            assert.strictEqual(expectedNames.length, variables.length);
                                            for (let i = variables.length - 1; i >= 0; i--) {
                                                assert.strictEqual(expectedNames[i], variables[i].name);
                                            }
                                        };
                                        return rule;
                                    }
                                }

                            }
                        },
                        languageOptions: {
                            ecmaVersion: 6,
                            sourceType: "module"
                        },
                        rules: {
                            "test/test": 2
                        }
                    };

                    linter.verify(code, config);

                    // Check all expected names are asserted.
                    assert.strictEqual(0, expectedNamesList.length);
                }

                it("VariableDeclaration", () => {
                    const code = "\n var {a, x: [b], y: {c = 0}} = foo;\n let {d, x: [e], y: {f = 0}} = foo;\n const {g, x: [h], y: {i = 0}} = foo, {j, k = function(z) { let l; }} = bar;\n ";
                    const namesList = [
                        ["a", "b", "c"],
                        ["d", "e", "f"],
                        ["g", "h", "i", "j", "k"],
                        ["l"]
                    ];

                    verify(code, "VariableDeclaration", namesList);
                });

                it("VariableDeclaration (on for-in/of loop)", () => {

                    // TDZ scope is created here, so tests to exclude those.
                    const code = "\n for (var {a, x: [b], y: {c = 0}} in foo) {\n let g;\n }\n for (let {d, x: [e], y: {f = 0}} of foo) {\n let h;\n }\n ";
                    const namesList = [
                        ["a", "b", "c"],
                        ["g"],
                        ["d", "e", "f"],
                        ["h"]
                    ];

                    verify(code, "VariableDeclaration", namesList);
                });

                it("VariableDeclarator", () => {

                    // TDZ scope is created here, so tests to exclude those.
                    const code = "\n var {a, x: [b], y: {c = 0}} = foo;\n let {d, x: [e], y: {f = 0}} = foo;\n const {g, x: [h], y: {i = 0}} = foo, {j, k = function(z) { let l; }} = bar;\n ";
                    const namesList = [
                        ["a", "b", "c"],
                        ["d", "e", "f"],
                        ["g", "h", "i"],
                        ["j", "k"],
                        ["l"]
                    ];

                    verify(code, "VariableDeclarator", namesList);
                });

                it("FunctionDeclaration", () => {
                    const code = "\n function foo({a, x: [b], y: {c = 0}}, [d, e]) {\n let z;\n }\n function bar({f, x: [g], y: {h = 0}}, [i, j = function(q) { let w; }]) {\n let z;\n }\n ";
                    const namesList = [
                        ["foo", "a", "b", "c", "d", "e"],
                        ["bar", "f", "g", "h", "i", "j"]
                    ];

                    verify(code, "FunctionDeclaration", namesList);
                });

                it("FunctionExpression", () => {
                    const code = "\n (function foo({a, x: [b], y: {c = 0}}, [d, e]) {\n let z;\n });\n (function bar({f, x: [g], y: {h = 0}}, [i, j = function(q) { let w; }]) {\n let z;\n });\n ";
                    const namesList = [
                        ["foo", "a", "b", "c", "d", "e"],
                        ["bar", "f", "g", "h", "i", "j"],
                        ["q"]
                    ];

                    verify(code, "FunctionExpression", namesList);
                });

                it("ArrowFunctionExpression", () => {
                    const code = "\n (({a, x: [b], y: {c = 0}}, [d, e]) => {\n let z;\n });\n (({f, x: [g], y: {h = 0}}, [i, j]) => {\n let z;\n });\n ";
                    const namesList = [
                        ["a", "b", "c", "d", "e"],
                        ["f", "g", "h", "i", "j"]
                    ];

                    verify(code, "ArrowFunctionExpression", namesList);
                });

                it("ClassDeclaration", () => {
                    const code = "\n class A { foo(x) { let y; } }\n class B { foo(x) { let y; } }\n ";
                    const namesList = [
                        ["A", "A"], // outer scope's and inner scope's.
                        ["B", "B"]
                    ];

                    verify(code, "ClassDeclaration", namesList);
                });

                it("ClassExpression", () => {
                    const code = "\n (class A { foo(x) { let y; } });\n (class B { foo(x) { let y; } });\n ";
                    const namesList = [
                        ["A"],
                        ["B"]
                    ];

                    verify(code, "ClassExpression", namesList);
                });

                it("CatchClause", () => {
                    const code = "\n try {} catch ({a, b}) {\n let x;\n try {} catch ({c, d}) {\n let y;\n }\n }\n ";
                    const namesList = [
                        ["a", "b"],
                        ["c", "d"]
                    ];

                    verify(code, "CatchClause", namesList);
                });

                it("ImportDeclaration", () => {
                    const code = "\n import \"aaa\";\n import * as a from \"bbb\";\n import b, {c, x as d} from \"ccc\";\n ";
                    const namesList = [
                        [],
                        ["a"],
                        ["b", "c", "d"]
                    ];

                    verify(code, "ImportDeclaration", namesList);
                });

                it("ImportSpecifier", () => {
                    const code = "\n import \"aaa\";\n import * as a from \"bbb\";\n import b, {c, x as d} from \"ccc\";\n ";
                    const namesList = [
                        ["c"],
                        ["d"]
                    ];

                    verify(code, "ImportSpecifier", namesList);
                });

                it("ImportDefaultSpecifier", () => {
                    const code = "\n import \"aaa\";\n import * as a from \"bbb\";\n import b, {c, x as d} from \"ccc\";\n ";
                    const namesList = [
                        ["b"]
                    ];

                    verify(code, "ImportDefaultSpecifier", namesList);
                });

                it("ImportNamespaceSpecifier", () => {
                    const code = "\n import \"aaa\";\n import * as a from \"bbb\";\n import b, {c, x as d} from \"ccc\";\n ";
                    const namesList = [
                        ["a"]
                    ];

                    verify(code, "ImportNamespaceSpecifier", namesList);
                });
            });

            describe("context.markVariableAsUsed()", () => {

                it("should mark variables in current scope as used", () => {
                    const code = "var a = 1, b = 2;";
                    let spy;

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: context => {
                                        spy = sinon.spy(() => {
                                            assert.isTrue(context.markVariableAsUsed("a"));

                                            const scope = context.getScope();

                                            assert.isTrue(getVariable(scope, "a").eslintUsed);
                                            assert.notOk(getVariable(scope, "b").eslintUsed);
                                        });

                                        return { "Program:exit": spy };
                                    }
                                }
                            }
                        },
                        languageOptions: {
                            sourceType: "script"
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify(code, config);
                    assert(spy && spy.calledOnce);
                });

                it("should mark variables in function args as used", () => {
                    const code = "function abc(a, b) { return 1; }";
                    let spy;

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: context => {
                                        spy = sinon.spy(() => {
                                            assert.isTrue(context.markVariableAsUsed("a"));

                                            const scope = context.getScope();

                                            assert.isTrue(getVariable(scope, "a").eslintUsed);
                                            assert.notOk(getVariable(scope, "b").eslintUsed);
                                        });

                                        return { ReturnStatement: spy };
                                    }
                                }
                            }
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify(code, config);
                    assert(spy && spy.calledOnce);
                });

                it("should mark variables in higher scopes as used", () => {
                    const code = "var a, b; function abc() { return 1; }";
                    let returnSpy, exitSpy;

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: context => {
                                        returnSpy = sinon.spy(() => {
                                            assert.isTrue(context.markVariableAsUsed("a"));
                                        });
                                        exitSpy = sinon.spy(() => {
                                            const scope = context.getScope();

                                            assert.isTrue(getVariable(scope, "a").eslintUsed);
                                            assert.notOk(getVariable(scope, "b").eslintUsed);
                                        });

                                        return { ReturnStatement: returnSpy, "Program:exit": exitSpy };
                                    }
                                }
                            }
                        },
                        languageOptions: {
                            sourceType: "script"
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify(code, config);
                    assert(returnSpy && returnSpy.calledOnce);
                    assert(exitSpy && exitSpy.calledOnce);
                });

                it("should mark variables as used when sourceType is commonjs", () => {
                    const code = "var a = 1, b = 2;";
                    let spy;

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: context => {
                                        spy = sinon.spy(() => {
                                            const globalScope = context.getScope(),
                                                childScope = globalScope.childScopes[0];

                                            assert.isTrue(context.markVariableAsUsed("a"), "Call to markVariableAsUsed should return true");

                                            assert.isTrue(getVariable(childScope, "a").eslintUsed, "'a' should be marked as used.");
                                            assert.isUndefined(getVariable(childScope, "b").eslintUsed, "'b' should be marked as used.");
                                        });

                                        return { "Program:exit": spy };
                                    }
                                }
                            }
                        },
                        languageOptions: {
                            sourceType: "commonjs"
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify(code, config);
                    assert(spy && spy.calledOnce, "Spy wasn't called.");
                });

                it("should mark variables in modules as used", () => {
                    const code = "var a = 1, b = 2;";
                    let spy;

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: context => {
                                        spy = sinon.spy(() => {
                                            const globalScope = context.getScope(),
                                                childScope = globalScope.childScopes[0];

                                            assert.isTrue(context.markVariableAsUsed("a"));

                                            assert.isTrue(getVariable(childScope, "a").eslintUsed);
                                            assert.isUndefined(getVariable(childScope, "b").eslintUsed);
                                        });

                                        return { "Program:exit": spy };
                                    }
                                }
                            }
                        },
                        languageOptions: {
                            ecmaVersion: 6,
                            sourceType: "module"
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify(code, config);
                    assert(spy && spy.calledOnce);
                });

                it("should return false if the given variable is not found", () => {
                    const code = "var a = 1, b = 2;";
                    let spy;

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: context => {
                                        spy = sinon.spy(() => {
                                            assert.isFalse(context.markVariableAsUsed("c"));
                                        });

                                        return { "Program:exit": spy };
                                    }
                                }
                            }
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify(code, config);
                    assert(spy && spy.calledOnce);
                });
            });

            describe("context.getCwd()", () => {
                const code = "a;\nb;";
                const baseConfig = { rules: { "test/checker": "error" } };

                it("should get cwd correctly in the context", () => {
                    const cwd = "cwd";
                    const linterWithOption = new Linter({ cwd, configType: "flat" });
                    let spy;
                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: context => {
                                        spy = sinon.spy(() => {
                                            assert.strictEqual(context.getCwd(), cwd);
                                        });
                                        return { Program: spy };
                                    }
                                }
                            }
                        },
                        ...baseConfig
                    };

                    linterWithOption.verify(code, config);
                    assert(spy && spy.calledOnce);
                });

                it("should assign process.cwd() to it if cwd is undefined", () => {

                    const linterWithOption = new Linter({ configType: "flat" });
                    let spy;
                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: context => {

                                        spy = sinon.spy(() => {
                                            assert.strictEqual(context.getCwd(), process.cwd());
                                        });
                                        return { Program: spy };
                                    }
                                }
                            }
                        },
                        ...baseConfig
                    };

                    linterWithOption.verify(code, config);
                    assert(spy && spy.calledOnce);
                });

                it("should assign process.cwd() to it if the option is undefined", () => {
                    let spy;
                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: context => {

                                        spy = sinon.spy(() => {
                                            assert.strictEqual(context.getCwd(), process.cwd());
                                        });
                                        return { Program: spy };
                                    }
                                }
                            }
                        },
                        ...baseConfig
                    };

                    linter.verify(code, config);
                    assert(spy && spy.calledOnce);
                });
            });

        });

        describe("Code with a hashbang comment", () => {
            const code = "#!bin/program\n\nvar foo;;";

            it("should have a comment with the hashbang in it", () => {
                const spy = sinon.spy(context => {
                    const comments = context.getAllComments();

                    assert.strictEqual(comments.length, 1);
                    assert.strictEqual(comments[0].type, "Shebang");
                    return {};
                });

                const config = {
                    plugins: {
                        test: {
                            rules: {
                                checker: spy
                            }
                        }
                    },
                    rules: {
                        "test/checker": "error"
                    }
                };

                linter.verify(code, config);
                assert(spy.calledOnce);
            });
        });

        describe("Options", () => {

            describe("filename", () => {
                it("should allow filename to be passed on options object", () => {
                    const filenameChecker = sinon.spy(context => {
                        assert.strictEqual(context.getFilename(), "foo.js");
                        return {};
                    });

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: filenameChecker
                                }
                            }
                        },
                        rules: {
                            "test/checker": "error"
                        }
                    };

                    linter.verify("foo;", config, { filename: "foo.js" });
                    assert(filenameChecker.calledOnce);
                });

                it("should allow filename to be passed as third argument", () => {
                    const filenameChecker = sinon.spy(context => {
                        assert.strictEqual(context.getFilename(), "bar.js");
                        return {};
                    });

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: filenameChecker
                                }
                            }
                        },
                        rules: {
                            "test/checker": "error"
                        }
                    };

                    linter.verify("foo;", config, "bar.js");
                    assert(filenameChecker.calledOnce);
                });

                it("should default filename to <input> when options object doesn't have filename", () => {
                    const filenameChecker = sinon.spy(context => {
                        assert.strictEqual(context.getFilename(), "<input>");
                        return {};
                    });

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: filenameChecker
                                }
                            }
                        },
                        rules: {
                            "test/checker": "error"
                        }
                    };

                    linter.verify("foo;", config, {});
                    assert(filenameChecker.calledOnce);
                });

                it("should default filename to <input> when only two arguments are passed", () => {
                    const filenameChecker = sinon.spy(context => {
                        assert.strictEqual(context.getFilename(), "<input>");
                        return {};
                    });

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: filenameChecker
                                }
                            }
                        },
                        rules: {
                            "test/checker": "error"
                        }
                    };

                    linter.verify("foo;", config);
                    assert(filenameChecker.calledOnce);
                });
            });

            describe("physicalFilename", () => {
                it("should be same as `filename` passed on options object, if no processors are used", () => {
                    const physicalFilenameChecker = sinon.spy(context => {
                        assert.strictEqual(context.getPhysicalFilename(), "foo.js");
                        return {};
                    });

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: physicalFilenameChecker
                                }
                            }
                        },
                        rules: {
                            "test/checker": "error"
                        }
                    };

                    linter.verify("foo;", config, { filename: "foo.js" });
                    assert(physicalFilenameChecker.calledOnce);
                });

                it("should default physicalFilename to <input> when options object doesn't have filename", () => {
                    const physicalFilenameChecker = sinon.spy(context => {
                        assert.strictEqual(context.getPhysicalFilename(), "<input>");
                        return {};
                    });

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: physicalFilenameChecker
                                }
                            }
                        },
                        rules: {
                            "test/checker": "error"
                        }
                    };

                    linter.verify("foo;", config, {});
                    assert(physicalFilenameChecker.calledOnce);
                });

                it("should default physicalFilename to <input> when only two arguments are passed", () => {
                    const physicalFilenameChecker = sinon.spy(context => {
                        assert.strictEqual(context.getPhysicalFilename(), "<input>");
                        return {};
                    });

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: physicalFilenameChecker
                                }
                            }
                        },
                        rules: {
                            "test/checker": "error"
                        }
                    };

                    linter.verify("foo;", config);
                    assert(physicalFilenameChecker.calledOnce);
                });
            });

        });

        describe("Inline Directives", () => {

            describe("/*global*/ Comments", () => {

                describe("when evaluating code containing /*global */ and /*globals */ blocks", () => {

                    it("variables should be available in global scope", () => {
                        const code = `
                        /*global a b:true c:false d:readable e:writeable Math:off */
                        function foo() {}
                        /*globals f:true*/
                        /* global ConfigGlobal : readable */
                        `;
                        let spy;

                        const config = {
                            plugins: {
                                test: {
                                    rules: {
                                        checker: context => {
                                            spy = sinon.spy(() => {
                                                const scope = context.getScope();
                                                const a = getVariable(scope, "a"),
                                                    b = getVariable(scope, "b"),
                                                    c = getVariable(scope, "c"),
                                                    d = getVariable(scope, "d"),
                                                    e = getVariable(scope, "e"),
                                                    f = getVariable(scope, "f"),
                                                    mathGlobal = getVariable(scope, "Math"),
                                                    arrayGlobal = getVariable(scope, "Array"),
                                                    configGlobal = getVariable(scope, "ConfigGlobal");

                                                assert.strictEqual(a.name, "a");
                                                assert.strictEqual(a.writeable, false);
                                                assert.strictEqual(b.name, "b");
                                                assert.strictEqual(b.writeable, true);
                                                assert.strictEqual(c.name, "c");
                                                assert.strictEqual(c.writeable, false);
                                                assert.strictEqual(d.name, "d");
                                                assert.strictEqual(d.writeable, false);
                                                assert.strictEqual(e.name, "e");
                                                assert.strictEqual(e.writeable, true);
                                                assert.strictEqual(f.name, "f");
                                                assert.strictEqual(f.writeable, true);
                                                assert.strictEqual(mathGlobal, null);
                                                assert.strictEqual(arrayGlobal, null);
                                                assert.strictEqual(configGlobal.name, "ConfigGlobal");
                                                assert.strictEqual(configGlobal.writeable, false);
                                            });

                                            return { Program: spy };
                                        }
                                    }
                                }
                            },
                            rules: { "test/checker": "error" },
                            languageOptions: {
                                globals: { Array: "off", ConfigGlobal: "writeable" }
                            }
                        };

                        linter.verify(code, config);
                        assert(spy && spy.calledOnce);
                    });
                });

                describe("when evaluating code containing a /*global */ block with sloppy whitespace", () => {
                    const code = "/* global  a b  : true   c:  false*/";

                    it("variables should be available in global scope", () => {

                        let spy;
                        const config = {
                            plugins: {
                                test: {
                                    rules: {
                                        checker: context => {
                                            spy = sinon.spy(() => {
                                                const scope = context.getScope(),
                                                    a = getVariable(scope, "a"),
                                                    b = getVariable(scope, "b"),
                                                    c = getVariable(scope, "c");

                                                assert.strictEqual(a.name, "a");
                                                assert.strictEqual(a.writeable, false);
                                                assert.strictEqual(b.name, "b");
                                                assert.strictEqual(b.writeable, true);
                                                assert.strictEqual(c.name, "c");
                                                assert.strictEqual(c.writeable, false);
                                            });

                                            return { Program: spy };
                                        }
                                    }
                                }
                            },
                            rules: { "test/checker": "error" }
                        };

                        linter.verify(code, config);
                        assert(spy && spy.calledOnce);
                    });
                });

                describe("when evaluating code containing a line comment", () => {
                    const code = "//global a \n function f() {}";

                    it("should not introduce a global variable", () => {
                        let spy;

                        const config = {
                            plugins: {
                                test: {
                                    rules: {
                                        checker: context => {
                                            spy = sinon.spy(() => {
                                                const scope = context.getScope();

                                                assert.strictEqual(getVariable(scope, "a"), null);
                                            });

                                            return { Program: spy };
                                        }
                                    }
                                }
                            },
                            rules: { "test/checker": "error" }
                        };


                        linter.verify(code, config);
                        assert(spy && spy.calledOnce);
                    });
                });

                describe("when evaluating code containing normal block comments", () => {
                    const code = "/**/  /*a*/  /*b:true*/  /*foo c:false*/";

                    it("should not introduce a global variable", () => {
                        let spy;

                        const config = {
                            plugins: {
                                test: {
                                    rules: {
                                        checker: context => {
                                            spy = sinon.spy(() => {
                                                const scope = context.getScope();

                                                assert.strictEqual(getVariable(scope, "a"), null);
                                                assert.strictEqual(getVariable(scope, "b"), null);
                                                assert.strictEqual(getVariable(scope, "foo"), null);
                                                assert.strictEqual(getVariable(scope, "c"), null);
                                            });

                                            return { Program: spy };
                                        }
                                    }
                                }
                            },
                            rules: { "test/checker": "error" }
                        };


                        linter.verify(code, config);
                        assert(spy && spy.calledOnce);
                    });
                });

                it("should attach a \"/*global\" comment node to declared variables", () => {
                    const code = "/* global foo */\n/* global bar, baz */";
                    let ok = false;
                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    test(context) {
                                        return {
                                            Program() {
                                                const scope = context.getScope();
                                                const sourceCode = context.getSourceCode();
                                                const comments = sourceCode.getAllComments();

                                                assert.strictEqual(2, comments.length);

                                                const foo = getVariable(scope, "foo");

                                                assert.strictEqual(foo.eslintExplicitGlobal, true);
                                                assert.strictEqual(foo.eslintExplicitGlobalComments[0], comments[0]);

                                                const bar = getVariable(scope, "bar");

                                                assert.strictEqual(bar.eslintExplicitGlobal, true);
                                                assert.strictEqual(bar.eslintExplicitGlobalComments[0], comments[1]);

                                                const baz = getVariable(scope, "baz");

                                                assert.strictEqual(baz.eslintExplicitGlobal, true);
                                                assert.strictEqual(baz.eslintExplicitGlobalComments[0], comments[1]);

                                                ok = true;
                                            }
                                        };
                                    }
                                }
                            }
                        },
                        rules: { "test/test": "error" }
                    };


                    linter.verify(code, config);
                    assert(ok);
                });
            });

            describe("/*exported*/ Comments", () => {

                it("we should behave nicely when no matching variable is found", () => {
                    const code = "/* exported horse */";
                    const config = { rules: {} };

                    linter.verify(code, config, filename, true);
                });

                it("variables should be exported", () => {
                    const code = "/* exported horse */\n\nvar horse = 'circus'";
                    let spy;

                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: context => {
                                        spy = sinon.spy(() => {
                                            const scope = context.getScope(),
                                                horse = getVariable(scope, "horse");

                                            assert.strictEqual(horse.eslintUsed, true);
                                        });

                                        return { Program: spy };
                                    }
                                }
                            }
                        },
                        languageOptions: {
                            sourceType: "script"
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify(code, config);
                    assert(spy && spy.calledOnce);
                });

                it("undefined variables should not be exported", () => {
                    const code = "/* exported horse */\n\nhorse = 'circus'";
                    let spy;
                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: context => {
                                        spy = sinon.spy(() => {
                                            const scope = context.getScope(),
                                                horse = getVariable(scope, "horse");

                                            assert.strictEqual(horse, null);
                                        });

                                        return { Program: spy };
                                    }
                                }
                            }
                        },
                        languageOptions: {
                            sourceType: "script"
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify(code, config);
                    assert(spy && spy.calledOnce);
                });

                it("variables should be exported in strict mode", () => {
                    const code = "/* exported horse */\n'use strict';\nvar horse = 'circus'";
                    let spy;
                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: context => {
                                        spy = sinon.spy(() => {
                                            const scope = context.getScope(),
                                                horse = getVariable(scope, "horse");

                                            assert.strictEqual(horse.eslintUsed, true);
                                        });

                                        return { Program: spy };
                                    }
                                }
                            }
                        },
                        languageOptions: {
                            sourceType: "script"
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify(code, config);
                    assert(spy && spy.calledOnce);
                });

                it("variables should not be exported in the es6 module environment", () => {
                    const code = "/* exported horse */\nvar horse = 'circus'";
                    let spy;
                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: context => {
                                        spy = sinon.spy(() => {
                                            const scope = context.getScope(),
                                                horse = getVariable(scope, "horse");

                                            assert.strictEqual(horse, null); // there is no global scope at all
                                        });

                                        return { Program: spy };
                                    }
                                }
                            }
                        },
                        languageOptions: {
                            ecmaVersion: 6,
                            sourceType: "module"
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify(code, config);
                    assert(spy && spy.calledOnce);
                });

                it("variables should not be exported when in a commonjs file", () => {
                    const code = "/* exported horse */\nvar horse = 'circus'";
                    let spy;
                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    checker: context => {
                                        spy = sinon.spy(() => {
                                            const scope = context.getScope(),
                                                horse = getVariable(scope, "horse");

                                            assert.strictEqual(horse, null); // there is no global scope at all
                                        });

                                        return { Program: spy };
                                    }
                                }
                            }
                        },
                        languageOptions: {
                            sourceType: "commonjs"
                        },
                        rules: { "test/checker": "error" }
                    };

                    linter.verify(code, config);
                    assert(spy && spy.calledOnce);
                });
            });

            describe("/*ec0lint*/ Comments", () => {
                describe("when evaluating code with comments to enable rules", () => {

                    it("should report a violation", () => {
                        const code = "/*ec0lint lighter-http:1*/ let foo = require('axios');";
                        const config = { rules: {} };

                        const messages = linter.verify(code, config, filename);
                        const suppressedMessages = linter.getSuppressedMessages();

                        assert.strictEqual(messages.length, 1);
                        assert.strictEqual(messages[0].ruleId, "lighter-http");
                        assert.strictEqual(messages[0].message, "axios can be removed from your code and replaced by fetch (you can find examples on http://ec0lint.com/features/lighter-http). CO2 Reduction: up to 0.21 g");
                        assert.include(messages[0].nodeType, "CallExpression");

                        assert.strictEqual(suppressedMessages.length, 0);
                    });
                });

                describe("when evaluating code with invalid comments to enable rules", () => {
                    it("should report a violation when the config is not a valid rule configuration", () => {
                        const messages = linter.verify("/*ec0lint lighter-http:true*/ let foo = require('axios');", {});
                        const suppressedMessages = linter.getSuppressedMessages();

                        assert.deepStrictEqual(
                            messages,
                            [
                                {
                                    severity: 2,
                                    ruleId: "lighter-http",
                                    message: "Configuration for rule \"lighter-http\" is invalid:\n\tSeverity should be one of the following: 0 = off, 1 = warn, 2 = error (you passed 'true').\n",
                                    line: 1,
                                    column: 1,
                                    endLine: 1,
                                    endColumn: 30,
                                    nodeType: null
                                }
                            ]
                        );

                        assert.strictEqual(suppressedMessages.length, 0);
                    });

                    it("should report a violation when the config violates a rule's schema", () => {
                        const messages = linter.verify("/* ec0lint lighter-http: [error, {nonExistentPropertyName: true}]*/", {});
                        const suppressedMessages = linter.getSuppressedMessages();

                        assert.deepStrictEqual(
                            messages,
                            [
                                {
                                    severity: 2,
                                    ruleId: "lighter-http",
                                    message: "Configuration for rule \"lighter-http\" is invalid:\n\tValue [{\"nonExistentPropertyName\":true}] should NOT have more than 0 items.\n",
                                    line: 1,
                                    column: 1,
                                    endLine: 1,
                                    endColumn: 68,
                                    nodeType: null
                                }
                            ]
                        );

                        assert.strictEqual(suppressedMessages.length, 0);
                    });
                });

                describe("when evaluating code with comments to disable rules", () => {

                    it("should not report a violation", () => {
                        const config = { rules: { "lighter-http": 1 } };
                        const messages = linter.verify("/*ec0lint lighter-http:0*/ let foo = require('axios');", config, filename);
                        const suppressedMessages = linter.getSuppressedMessages();

                        assert.strictEqual(messages.length, 0);
                        assert.strictEqual(suppressedMessages.length, 0);
                    });

                    it("should report an error when disabling a non-existent rule in inline comment", () => {
                        let code = "/*ec0lint foo:0*/ ;";
                        let messages = linter.verify(code, {}, filename);
                        let suppressedMessages = linter.getSuppressedMessages();

                        assert.strictEqual(messages.length, 1, "/*ec0lint*/ comment should report problem.");
                        assert.strictEqual(messages[0].message, "Definition for rule 'foo' was not found.");
                        assert.strictEqual(suppressedMessages.length, 0);

                        code = "/*ec0lint-disable foo*/ ;";
                        messages = linter.verify(code, {}, filename);
                        suppressedMessages = linter.getSuppressedMessages();
                        assert.strictEqual(messages.length, 1, "/*ec0lint-disable*/ comment should report problem.");
                        assert.strictEqual(messages[0].message, "Definition for rule 'foo' was not found.");
                        assert.strictEqual(suppressedMessages.length, 0);

                        code = "/*ec0lint-disable-line foo*/ ;";
                        messages = linter.verify(code, {}, filename);
                        suppressedMessages = linter.getSuppressedMessages();
                        assert.strictEqual(messages.length, 1, "/*ec0lint-disable-line*/ comment should report problem.");
                        assert.strictEqual(messages[0].message, "Definition for rule 'foo' was not found.");
                        assert.strictEqual(suppressedMessages.length, 0);

                        code = "/*ec0lint-disable-next-line foo*/ ;";
                        messages = linter.verify(code, {}, filename);
                        suppressedMessages = linter.getSuppressedMessages();
                        assert.strictEqual(messages.length, 1, "/*ec0lint-disable-next-line*/ comment should report problem.");
                        assert.strictEqual(messages[0].message, "Definition for rule 'foo' was not found.");
                        assert.strictEqual(suppressedMessages.length, 0);
                    });

                    it("should not report an error, when disabling a non-existent rule in config", () => {
                        const messages = linter.verify("", { rules: { foo: 0 } }, filename);
                        const suppressedMessages = linter.getSuppressedMessages();

                        assert.strictEqual(messages.length, 0);
                        assert.strictEqual(suppressedMessages.length, 0);
                    });

                    it("should throw an error when a non-existent rule in config", () => {
                        assert.throws(() => {
                            linter.verify("", { rules: { foo: 1 } }, filename);
                        }, /Key "rules": Key "foo":/u);

                        assert.throws(() => {
                            linter.verify("", { rules: { foo: 2 } }, filename);
                        }, /Key "rules": Key "foo":/u);

                    });
                });

                describe("when evaluating code with comments to enable multiple rules", () => {
                    const code = "/*ec0lint lighter-http:1*/ let foo = require('axios');";

                    it("should report a violation", () => {
                        const config = { rules: {} };

                        const messages = linter.verify(code, config, filename);
                        const suppressedMessages = linter.getSuppressedMessages();

                        assert.strictEqual(messages.length, 1);
                        assert.strictEqual(messages[0].ruleId, "lighter-http");
                        assert.strictEqual(messages[0].message, "axios can be removed from your code and replaced by fetch (you can find examples on http://ec0lint.com/features/lighter-http). CO2 Reduction: up to 0.21 g");
                        assert.include(messages[0].nodeType, "CallExpression");

                        assert.strictEqual(suppressedMessages.length, 0);
                    });
                });

                describe("when evaluating code with comments to enable and disable multiple rules", () => {
                    const code = "/*ec0lint lighter-http:1*/ let foo = require('axios');";

                    it("should report a violation", () => {
                        const config = { rules: { "lighter-http": 0 } };

                        const messages = linter.verify(code, config, filename);
                        const suppressedMessages = linter.getSuppressedMessages();

                        assert.strictEqual(messages.length, 1);
                        assert.strictEqual(messages[0].ruleId, "lighter-http");
                        assert.strictEqual(messages[0].message, "axios can be removed from your code and replaced by fetch (you can find examples on http://ec0lint.com/features/lighter-http). CO2 Reduction: up to 0.21 g");
                        assert.include(messages[0].nodeType, "CallExpression");

                        assert.strictEqual(suppressedMessages.length, 0);
                    });
                });

                describe("when evaluating code with comments to disable and enable configurable rule as part of plugin", () => {

                    let baseConfig;

                    beforeEach(() => {
                        baseConfig = {
                            plugins: {
                                "test-plugin": {
                                    rules: {
                                        "test-rule"(context) {
                                            return {
                                                Literal(node) {
                                                    if (node.value === "trigger violation") {
                                                        context.report(node, "Reporting violation.");
                                                    }
                                                }
                                            };
                                        }
                                    }
                                }
                            }
                        };

                    });

                    it("should not report a violation when inline comment enables plugin rule and there's no violation", () => {
                        const config = { ...baseConfig, rules: {} };
                        const code = "/*ec0lint test-plugin/test-rule: 2*/ var a = \"no violation\";";

                        const messages = linter.verify(code, config, filename);
                        const suppressedMessages = linter.getSuppressedMessages();

                        assert.strictEqual(messages.length, 0);
                        assert.strictEqual(suppressedMessages.length, 0);
                    });

                    it("should not report a violation when inline comment disables plugin rule", () => {
                        const code = "/*ec0lint test-plugin/test-rule:0*/ var a = \"trigger violation\"";
                        const config = { ...baseConfig, rules: { "test-plugin/test-rule": 1 } };

                        const messages = linter.verify(code, config, filename);
                        const suppressedMessages = linter.getSuppressedMessages();

                        assert.strictEqual(messages.length, 0);
                        assert.strictEqual(suppressedMessages.length, 0);
                    });

                    it("should report a violation when the report is right before the comment", () => {
                        const code = " /* ec0lint-disable */ ";

                        const config = {
                            plugins: {
                                test: {
                                    rules: {
                                        checker: context => ({
                                            Program() {
                                                context.report({ loc: { line: 1, column: 0 }, message: "foo" });
                                            }
                                        })
                                    }
                                }
                            },
                            rules: {
                                "test/checker": "error"
                            }
                        };

                        const problems = linter.verify(code, config);
                        const suppressedMessages = linter.getSuppressedMessages();

                        assert.strictEqual(problems.length, 1);
                        assert.strictEqual(problems[0].message, "foo");

                        assert.strictEqual(suppressedMessages.length, 0);
                    });

                    it("should not report a violation when the report is right at the start of the comment", () => {
                        const code = " /* ec0lint-disable */ ";

                        const config = {
                            plugins: {
                                test: {
                                    rules: {
                                        checker: context => ({
                                            Program() {
                                                context.report({ loc: { line: 1, column: 1 }, message: "foo" });
                                            }
                                        })
                                    }
                                }
                            },
                            rules: {
                                "test/checker": "error"
                            }
                        };

                        const problems = linter.verify(code, config);
                        const suppressedMessages = linter.getSuppressedMessages();

                        assert.strictEqual(problems.length, 0);

                        assert.strictEqual(suppressedMessages.length, 1);
                        assert.strictEqual(suppressedMessages[0].message, "foo");
                        assert.deepStrictEqual(suppressedMessages[0].suppressions, [{ kind: "directive", justification: "" }]);
                    });
                });

                describe("when evaluating code with incorrectly formatted comments to disable rule", () => {
                    it("should report a violation", () => {
                        const code = "/*ec0lint lighter-http:'1'*/ let foo = require('axios');";

                        const config = { rules: { "lighter-http": 1 } };

                        const messages = linter.verify(code, config, filename);
                        const suppressedMessages = linter.getSuppressedMessages();

                        assert.strictEqual(messages.length, 2);

                        /*
                         * Incorrectly formatted comment threw error;
                         * message from caught exception
                         * may differ amongst UAs, so verifying
                         * first part only as defined in the
                         * parseJsonConfig function in lib/eslint.js
                         */
                        assert.match(messages[0].message, /^Failed to parse JSON from ' "lighter-http":'1'':/u);
                        assert.strictEqual(messages[0].line, 1);
                        assert.strictEqual(messages[0].column, 1);

                        assert.strictEqual(messages[1].ruleId, "lighter-http");
                        assert.strictEqual(messages[1].message, "axios can be removed from your code and replaced by fetch (you can find examples on http://ec0lint.com/features/lighter-http). CO2 Reduction: up to 0.21 g");
                        assert.include(messages[1].nodeType, "CallExpression");

                        assert.strictEqual(suppressedMessages.length, 0);
                    });

                    it("should report a violation", () => {
                        const code = "/*ec0lint lighter-http:abc*/ let foo = require('axios');";

                        const config = { rules: { "lighter-http": 1 } };

                        const messages = linter.verify(code, config, filename);
                        const suppressedMessages = linter.getSuppressedMessages();

                        assert.strictEqual(messages.length, 2);

                        /*
                         * Incorrectly formatted comment threw error;
                         * message from caught exception
                         * may differ amongst UAs, so verifying
                         * first part only as defined in the
                         * parseJsonConfig function in lib/eslint.js
                         */
                        assert.match(messages[0].message, /^Failed to parse JSON from ' "lighter-http":abc':/u);
                        assert.strictEqual(messages[0].line, 1);
                        assert.strictEqual(messages[0].column, 1);

                        assert.strictEqual(messages[1].ruleId, "lighter-http");
                        assert.strictEqual(messages[1].message, "axios can be removed from your code and replaced by fetch (you can find examples on http://ec0lint.com/features/lighter-http). CO2 Reduction: up to 0.21 g");
                        assert.include(messages[1].nodeType, "CallExpression");

                        assert.strictEqual(suppressedMessages.length, 0);
                    });

                    it("should report a violation", () => {
                        const code = "/*ec0lint lighter-http:0 2*/ let foo = require('axios');";

                        const config = { rules: { "lighter-http": 1 } };

                        const messages = linter.verify(code, config, filename);
                        const suppressedMessages = linter.getSuppressedMessages();

                        assert.strictEqual(messages.length, 2);

                        /*
                         * Incorrectly formatted comment threw error;
                         * message from caught exception
                         * may differ amongst UAs, so verifying
                         * first part only as defined in the
                         * parseJsonConfig function in lib/eslint.js
                         */
                        assert.match(messages[0].message, /^Failed to parse JSON from ' "lighter-http":0 2':/u);
                        assert.strictEqual(messages[0].line, 1);
                        assert.strictEqual(messages[0].column, 1);

                        assert.strictEqual(messages[1].ruleId, "lighter-http");
                        assert.strictEqual(messages[1].message, "axios can be removed from your code and replaced by fetch (you can find examples on http://ec0lint.com/features/lighter-http). CO2 Reduction: up to 0.21 g");
                        assert.include(messages[1].nodeType, "CallExpression");

                        assert.strictEqual(suppressedMessages.length, 0);
                    });
                });
            });

            describe("/*ec0lint-disable-line*/", () => {

                it("should not disable rule and add an extra report if ec0lint-disable-line in a block comment is not on a single line", () => {
                    const code = [
                        "let foo = require('axios'); /* ec0lint-disable-line ",
                        "lighter-http */"
                    ].join("\n");
                    const config = {
                        rules: {
                            "lighter-http": 1
                        }
                    };

                    const messages = linter.verify(code, config);
                    const suppressedMessages = linter.getSuppressedMessages();

                    assert.deepStrictEqual(messages, [
                        {
                            ruleId: "lighter-http",
                            severity: 1,
                            line: 1,
                            column: 11,
                            endLine: 1,
                            endColumn: 27,
                            message: "axios can be removed from your code and replaced by fetch (you can find examples on http://ec0lint.com/features/lighter-http). CO2 Reduction: up to 0.21 g",
                            messageId: "unexpected",
                            nodeType: "CallExpression"
                        },
                        {
                            ruleId: null,
                            severity: 2,
                            message: "ec0lint-disable-line comment should not span multiple lines.",
                            line: 1,
                            column: 29,
                            endLine: 2,
                            endColumn: 16,
                            nodeType: null
                        }
                    ]);

                    assert.strictEqual(suppressedMessages.length, 0);
                });
            });

            describe("descriptions in directive comments", () => {
                it("should ignore the part preceded by '--' in '/*ec0lint*/'.", () => {
                    const aaa = sinon.stub().returns({});
                    const bbb = sinon.stub().returns({});
                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    aaa: { create: aaa },
                                    bbb: { create: bbb }
                                }
                            }
                        }
                    };

                    const messages = linter.verify(`
                    /*ec0lint test/aaa:error -- test/bbb:error */
                    console.log("hello")
                `, config);
                    const suppressedMessages = linter.getSuppressedMessages();

                    // Don't include syntax error of the comment.
                    assert.deepStrictEqual(messages, []);

                    // Use only `aaa`.
                    assert.strictEqual(aaa.callCount, 1);
                    assert.strictEqual(bbb.callCount, 0);

                    assert.strictEqual(suppressedMessages.length, 0);
                });

                it("should not ignore the part preceded by '--' if the '--' is not surrounded by whitespaces.", () => {
                    const rule = sinon.stub().returns({});
                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    "a--rule": { create: rule }
                                }
                            }
                        }
                    };

                    const messages = linter.verify(`
                    /*ec0lint test/a--rule:error */
                    console.log("hello")
                `, config);
                    const suppressedMessages = linter.getSuppressedMessages();

                    // Don't include syntax error of the comment.
                    assert.deepStrictEqual(messages, []);

                    // Use `a--rule`.
                    assert.strictEqual(rule.callCount, 1);

                    assert.strictEqual(suppressedMessages.length, 0);
                });

                it("should ignore the part preceded by '--' even if the '--' is longer than 2.", () => {
                    const aaa = sinon.stub().returns({});
                    const bbb = sinon.stub().returns({});
                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    aaa: { create: aaa },
                                    bbb: { create: bbb }
                                }
                            }
                        }
                    };

                    const messages = linter.verify(`
                    /*ec0lint test/aaa:error -------- test/bbb:error */
                    console.log("hello")
                `, config);
                    const suppressedMessages = linter.getSuppressedMessages();

                    // Don't include syntax error of the comment.
                    assert.deepStrictEqual(messages, []);

                    // Use only `aaa`.
                    assert.strictEqual(aaa.callCount, 1);
                    assert.strictEqual(bbb.callCount, 0);

                    assert.strictEqual(suppressedMessages.length, 0);
                });

                it("should ignore the part preceded by '--' with line breaks.", () => {
                    const aaa = sinon.stub().returns({});
                    const bbb = sinon.stub().returns({});
                    const config = {
                        plugins: {
                            test: {
                                rules: {
                                    aaa: { create: aaa },
                                    bbb: { create: bbb }
                                }
                            }
                        }
                    };

                    const messages = linter.verify(`
                    /*ec0lint test/aaa:error
                        --------
                        test/bbb:error */
                    console.log("hello")
                `, config);
                    const suppressedMessages = linter.getSuppressedMessages();

                    // Don't include syntax error of the comment.
                    assert.deepStrictEqual(messages, []);

                    // Use only `aaa`.
                    assert.strictEqual(aaa.callCount, 1);
                    assert.strictEqual(bbb.callCount, 0);

                    assert.strictEqual(suppressedMessages.length, 0);
                });
            });

            describe("allowInlineConfig option", () => {
                describe("when evaluating code with comments to change config when allowInlineConfig is enabled", () => {
                    it("should report a violation for disabling rules", () => {
                        const code = [
                            "let foo = require('axios'); // ec0lint-disable-line lighter-http"
                        ].join("\n");
                        const config = {
                            rules: {
                                "lighter-http": 1
                            }
                        };

                        const messages = linter.verify(code, config, {
                            filename,
                            allowInlineConfig: false
                        });
                        const suppressedMessages = linter.getSuppressedMessages();

                        assert.strictEqual(messages.length, 1);
                        assert.strictEqual(messages[0].ruleId, "lighter-http");

                        assert.strictEqual(suppressedMessages.length, 0);
                    });

                    it("should report a violation for global variable declarations", () => {
                        let ok = false;
                        const code = [
                            "/* global foo */"
                        ].join("\n");
                        const config = {
                            plugins: {
                                test: {
                                    rules: {
                                        test(context) {
                                            return {
                                                Program() {
                                                    const scope = context.getScope();
                                                    const sourceCode = context.getSourceCode();
                                                    const comments = sourceCode.getAllComments();

                                                    assert.strictEqual(1, comments.length);

                                                    const foo = getVariable(scope, "foo");

                                                    assert.notOk(foo);

                                                    ok = true;
                                                }
                                            };
                                        }
                                    }
                                }
                            },
                            rules: {
                                "test/test": 2
                            }
                        };

                        linter.verify(code, config, { allowInlineConfig: false });
                        assert(ok);
                    });

                    it("should report a violation for ec0lint-disable", () => {
                        const code = [
                            "/* ec0lint-disable */",
                            "let foo = require('axios');"
                        ].join("\n");
                        const config = {
                            rules: {
                                "lighter-http": 1
                            }
                        };

                        const messages = linter.verify(code, config, {
                            filename,
                            allowInlineConfig: false
                        });
                        const suppressedMessages = linter.getSuppressedMessages();

                        assert.strictEqual(messages.length, 1);
                        assert.strictEqual(messages[0].ruleId, "lighter-http");

                        assert.strictEqual(suppressedMessages.length, 0);
                    });
                });

                describe("when evaluating code with 'noInlineConfig'", () => {
                    for (const directive of [
                        "globals foo",
                        "global foo",
                        "exported foo",
                        "ec0lint lighter-http: error",
                        "ec0lint-disable lighter-http",
                        "ec0lint-disable-line lighter-http",
                        "ec0lint-disable-next-line lighter-http",
                        "ec0lint-enable lighter-http"
                    ]) {
                        it(`should warn '/* ${directive} */' if 'noInlineConfig' was given.`, () => {
                            const messages = linter.verify(`/* ${directive} */`, {
                                linterOptions: {
                                    noInlineConfig: true
                                }
                            });
                            const suppressedMessages = linter.getSuppressedMessages();

                            assert.deepStrictEqual(messages.length, 1);
                            assert.deepStrictEqual(messages[0].fatal, void 0);
                            assert.deepStrictEqual(messages[0].ruleId, null);
                            assert.deepStrictEqual(messages[0].severity, 1);
                            assert.deepStrictEqual(messages[0].message, `'/*${directive.split(" ")[0]}*/' has no effect because you have 'noInlineConfig' setting in your config.`);

                            assert.strictEqual(suppressedMessages.length, 0);
                        });
                    }

                    for (const directive of [
                        "ec0lint-disable-line lighter-http",
                        "ec0lint-disable-next-line lighter-http"
                    ]) {
                        it(`should warn '// ${directive}' if 'noInlineConfig' was given.`, () => {
                            const messages = linter.verify(`// ${directive}`, {
                                linterOptions: {
                                    noInlineConfig: true
                                }
                            });
                            const suppressedMessages = linter.getSuppressedMessages();

                            assert.deepStrictEqual(messages.length, 1);
                            assert.deepStrictEqual(messages[0].fatal, void 0);
                            assert.deepStrictEqual(messages[0].ruleId, null);
                            assert.deepStrictEqual(messages[0].severity, 1);
                            assert.deepStrictEqual(messages[0].message, `'//${directive.split(" ")[0]}' has no effect because you have 'noInlineConfig' setting in your config.`);

                            assert.strictEqual(suppressedMessages.length, 0);
                        });
                    }

                    it("should not warn if 'noInlineConfig' and '--no-inline-config' were given.", () => {
                        const messages = linter.verify("/* globals foo */", {
                            linterOptions: {
                                noInlineConfig: true
                            }
                        }, { allowInlineConfig: false });
                        const suppressedMessages = linter.getSuppressedMessages();

                        assert.deepStrictEqual(messages.length, 0);
                        assert.strictEqual(suppressedMessages.length, 0);
                    });
                });

                describe("when evaluating code with comments to change config when allowInlineConfig is disabled", () => {
                    it("should not report a violation", () => {
                        const code = [
                            "let foo = require('axios'); // ec0lint-disable-line lighter-http"
                        ].join("\n");
                        const config = {
                            rules: {
                                "lighter-http": 1
                            }
                        };

                        const messages = linter.verify(code, config, {
                            filename,
                            allowInlineConfig: true
                        });
                        const suppressedMessages = linter.getSuppressedMessages();

                        assert.strictEqual(messages.length, 0);

                        assert.strictEqual(suppressedMessages.length, 1);
                        assert.strictEqual(suppressedMessages[0].ruleId, "lighter-http");
                    });
                });

            });

            describe("reportUnusedDisableDirectives option", () => {
                it("reports problems for unused ec0lint-disable comments", () => {
                    const messages = linter.verify("/* ec0lint-disable */", {}, { reportUnusedDisableDirectives: true });
                    const suppressedMessages = linter.getSuppressedMessages();

                    assert.deepStrictEqual(
                        messages,
                        [
                            {
                                ruleId: null,
                                message: "Unused ec0lint-disable directive (no problems were reported).",
                                line: 1,
                                column: 1,
                                fix: {
                                    range: [0, 21],
                                    text: " "
                                },
                                severity: 2,
                                nodeType: null
                            }
                        ]
                    );

                    assert.strictEqual(suppressedMessages.length, 0);
                });

                it("reports problems for unused ec0lint-disable comments (error)", () => {
                    const messages = linter.verify("/* ec0lint-disable */", {}, { reportUnusedDisableDirectives: "error" });
                    const suppressedMessages = linter.getSuppressedMessages();

                    assert.deepStrictEqual(
                        messages,
                        [
                            {
                                ruleId: null,
                                message: "Unused ec0lint-disable directive (no problems were reported).",
                                line: 1,
                                column: 1,
                                fix: {
                                    range: [0, 21],
                                    text: " "
                                },
                                severity: 2,
                                nodeType: null
                            }
                        ]
                    );

                    assert.strictEqual(suppressedMessages.length, 0);
                });

                it("reports problems for unused ec0lint-disable comments (warn)", () => {
                    const messages = linter.verify("/* ec0lint-disable */", {}, { reportUnusedDisableDirectives: "warn" });
                    const suppressedMessages = linter.getSuppressedMessages();

                    assert.deepStrictEqual(
                        messages,
                        [
                            {
                                ruleId: null,
                                message: "Unused ec0lint-disable directive (no problems were reported).",
                                line: 1,
                                column: 1,
                                fix: {
                                    range: [0, 21],
                                    text: " "
                                },
                                severity: 1,
                                nodeType: null
                            }
                        ]
                    );

                    assert.strictEqual(suppressedMessages.length, 0);
                });

                it("reports problems for unused ec0lint-disable comments (in config)", () => {
                    const messages = linter.verify("/* ec0lint-disable */", {
                        linterOptions: {
                            reportUnusedDisableDirectives: true
                        }
                    });
                    const suppressedMessages = linter.getSuppressedMessages();

                    assert.deepStrictEqual(
                        messages,
                        [
                            {
                                ruleId: null,
                                message: "Unused ec0lint-disable directive (no problems were reported).",
                                line: 1,
                                column: 1,
                                fix: {
                                    range: [0, 21],
                                    text: " "
                                },
                                severity: 1,
                                nodeType: null
                            }
                        ]
                    );

                    assert.strictEqual(suppressedMessages.length, 0);
                });

                it("reports problems for unused ec0lint-disable-next-line comments (in config)", () => {
                    assert.deepStrictEqual(
                        linter.verify("// ec0lint-disable-next-line", {
                            linterOptions: {
                                reportUnusedDisableDirectives: true
                            }
                        }),
                        [
                            {
                                ruleId: null,
                                message: "Unused ec0lint-disable directive (no problems were reported).",
                                line: 1,
                                column: 1,
                                fix: {
                                    range: [0, 28],
                                    text: " "
                                },
                                severity: 1,
                                nodeType: null
                            }
                        ]
                    );
                });

                it("reports problems for unused multiline ec0lint-disable-next-line comments (in config)", () => {
                    assert.deepStrictEqual(
                        linter.verify("/* \nec0lint-disable-next-line\n */", {
                            linterOptions: {
                                reportUnusedDisableDirectives: true
                            }
                        }),
                        [
                            {
                                ruleId: null,
                                message: "Unused ec0lint-disable directive (no problems were reported).",
                                line: 1,
                                column: 1,
                                fix: {
                                    range: [0, 33],
                                    text: " "
                                },
                                severity: 1,
                                nodeType: null
                            }
                        ]
                    );
                });

                describe("autofix", () => {
                    const alwaysReportsRule = {
                        create(context) {
                            return {
                                Program(node) {
                                    context.report({ message: "bad code", loc: node.loc.end });
                                }
                            };
                        }
                    };

                    const neverReportsRule = {
                        create() {
                            return {};
                        }
                    };

                    const ruleCount = 3;
                    const usedRules = Array.from(
                        { length: ruleCount },
                        (_, index) => `used${index ? `-${index}` : ""}` // "used", "used-1", "used-2"
                    );
                    const unusedRules = usedRules.map(name => `un${name}`); // "unused", "unused-1", "unused-2"

                    const config = {
                        plugins: {
                            test: {
                                rules: {}
                            }
                        },
                        linterOptions: {
                            reportUnusedDisableDirectives: true
                        },
                        rules: {
                            ...Object.fromEntries(usedRules.map(name => [`test/${name}`, "error"])),
                            ...Object.fromEntries(unusedRules.map(name => [`test/${name}`, "error"]))
                        }
                    };

                    beforeEach(() => {
                        config.plugins.test.rules = {
                            ...Object.fromEntries(usedRules.map(name => [name, alwaysReportsRule])),
                            ...Object.fromEntries(unusedRules.map(name => [name, neverReportsRule]))
                        };
                    });

                    const tests = [

                        //-----------------------------------------------
                        // Removing the entire comment
                        //-----------------------------------------------

                        {
                            code: "// ec0lint-disable-line test/unused",
                            output: " "
                        },
                        {
                            code: "foo// ec0lint-disable-line test/unused",
                            output: "foo "
                        },
                        {
                            code: "// ec0lint-disable-line ,test/unused,",
                            output: " "
                        },
                        {
                            code: "// ec0lint-disable-line test/unused-1, test/unused-2",
                            output: " "
                        },
                        {
                            code: "// ec0lint-disable-line ,test/unused-1,, test/unused-2,, -- comment",
                            output: " "
                        },
                        {
                            code: "// ec0lint-disable-next-line test/unused\n",
                            output: " \n"
                        },
                        {
                            code: "// ec0lint-disable-next-line test/unused\nfoo",
                            output: " \nfoo"
                        },
                        {
                            code: "/* ec0lint-disable \ntest/unused\n*/",
                            output: " "
                        },

                        //-----------------------------------------------
                        // Removing only individual rules
                        //-----------------------------------------------

                        // content before the first rule should not be changed
                        {
                            code: "//ec0lint-disable-line test/unused, test/used",
                            output: "//ec0lint-disable-line test/used"
                        },
                        {
                            code: "// ec0lint-disable-line test/unused, test/used",
                            output: "// ec0lint-disable-line test/used"
                        },
                        {
                            code: "//  ec0lint-disable-line test/unused, test/used",
                            output: "//  ec0lint-disable-line test/used"
                        },
                        {
                            code: "/*\nec0lint-disable test/unused, test/used*/",
                            output: "/*\nec0lint-disable test/used*/"
                        },
                        {
                            code: "/*\n ec0lint-disable test/unused, test/used*/",
                            output: "/*\n ec0lint-disable test/used*/"
                        },
                        {
                            code: "/*\r\nec0lint-disable test/unused, test/used*/",
                            output: "/*\r\nec0lint-disable test/used*/"
                        },
                        {
                            code: "/*\u2028ec0lint-disable test/unused, test/used*/",
                            output: "/*\u2028ec0lint-disable test/used*/"
                        },
                        {
                            code: "/*\u00A0ec0lint-disable test/unused, test/used*/",
                            output: "/*\u00A0ec0lint-disable test/used*/"
                        },
                        {
                            code: "// ec0lint-disable-line  test/unused, test/used",
                            output: "// ec0lint-disable-line  test/used"
                        },
                        {
                            code: "/* ec0lint-disable\ntest/unused, test/used*/",
                            output: "/* ec0lint-disable\ntest/used*/"
                        },
                        {
                            code: "/* ec0lint-disable\n test/unused, test/used*/",
                            output: "/* ec0lint-disable\n test/used*/"
                        },
                        {
                            code: "/* ec0lint-disable\r\ntest/unused, test/used*/",
                            output: "/* ec0lint-disable\r\ntest/used*/"
                        },
                        {
                            code: "/* ec0lint-disable\u2028test/unused, test/used*/",
                            output: "/* ec0lint-disable\u2028test/used*/"
                        },
                        {
                            code: "/* ec0lint-disable\u00A0test/unused, test/used*/",
                            output: "/* ec0lint-disable\u00A0test/used*/"
                        },

                        // when removing the first rule, the comma and all whitespace up to the next rule (or next lone comma) should also be removed
                        {
                            code: "// ec0lint-disable-line test/unused,test/used",
                            output: "// ec0lint-disable-line test/used"
                        },
                        {
                            code: "// ec0lint-disable-line test/unused, test/used",
                            output: "// ec0lint-disable-line test/used"
                        },
                        {
                            code: "// ec0lint-disable-line test/unused , test/used",
                            output: "// ec0lint-disable-line test/used"
                        },
                        {
                            code: "// ec0lint-disable-line test/unused,  test/used",
                            output: "// ec0lint-disable-line test/used"
                        },
                        {
                            code: "// ec0lint-disable-line test/unused  ,test/used",
                            output: "// ec0lint-disable-line test/used"
                        },
                        {
                            code: "/* ec0lint-disable test/unused\n,\ntest/used */",
                            output: "/* ec0lint-disable test/used */"
                        },
                        {
                            code: "/* ec0lint-disable test/unused \n \n,\n\n test/used */",
                            output: "/* ec0lint-disable test/used */"
                        },
                        {
                            code: "/* ec0lint-disable test/unused\u2028,\u2028test/used */",
                            output: "/* ec0lint-disable test/used */"
                        },
                        {
                            code: "// ec0lint-disable-line test/unused\u00A0,\u00A0test/used",
                            output: "// ec0lint-disable-line test/used"
                        },
                        {
                            code: "// ec0lint-disable-line test/unused,,test/used",
                            output: "// ec0lint-disable-line ,test/used"
                        },
                        {
                            code: "// ec0lint-disable-line test/unused, ,test/used",
                            output: "// ec0lint-disable-line ,test/used"
                        },
                        {
                            code: "// ec0lint-disable-line test/unused,, test/used",
                            output: "// ec0lint-disable-line , test/used"
                        },
                        {
                            code: "// ec0lint-disable-line test/unused,test/used ",
                            output: "// ec0lint-disable-line test/used "
                        },
                        {
                            code: "// ec0lint-disable-next-line test/unused,test/used\n",
                            output: "// ec0lint-disable-next-line test/used\n"
                        },

                        // when removing a rule in the middle, one comma and all whitespace between commas should also be removed
                        {
                            code: "// ec0lint-disable-line test/used-1,test/unused,test/used-2",
                            output: "// ec0lint-disable-line test/used-1,test/used-2"
                        },
                        {
                            code: "// ec0lint-disable-line test/used-1, test/unused,test/used-2",
                            output: "// ec0lint-disable-line test/used-1,test/used-2"
                        },
                        {
                            code: "// ec0lint-disable-line test/used-1,test/unused ,test/used-2",
                            output: "// ec0lint-disable-line test/used-1,test/used-2"
                        },
                        {
                            code: "// ec0lint-disable-line test/used-1,  test/unused  ,test/used-2",
                            output: "// ec0lint-disable-line test/used-1,test/used-2"
                        },
                        {
                            code: "/* ec0lint-disable test/used-1,\ntest/unused\n,test/used-2 */",
                            output: "/* ec0lint-disable test/used-1,test/used-2 */"
                        },
                        {
                            code: "/* ec0lint-disable test/used-1,\n\n test/unused \n \n ,test/used-2 */",
                            output: "/* ec0lint-disable test/used-1,test/used-2 */"
                        },
                        {
                            code: "/* ec0lint-disable test/used-1,\u2028test/unused\u2028,test/used-2 */",
                            output: "/* ec0lint-disable test/used-1,test/used-2 */"
                        },
                        {
                            code: "// ec0lint-disable-line test/used-1,\u00A0test/unused\u00A0,test/used-2",
                            output: "// ec0lint-disable-line test/used-1,test/used-2"
                        },

                        // when removing a rule in the middle, content around commas should not be changed
                        {
                            code: "// ec0lint-disable-line test/used-1, test/unused ,test/used-2",
                            output: "// ec0lint-disable-line test/used-1,test/used-2"
                        },
                        {
                            code: "// ec0lint-disable-line test/used-1,test/unused, test/used-2",
                            output: "// ec0lint-disable-line test/used-1, test/used-2"
                        },
                        {
                            code: "// ec0lint-disable-line test/used-1 ,test/unused,test/used-2",
                            output: "// ec0lint-disable-line test/used-1 ,test/used-2"
                        },
                        {
                            code: "// ec0lint-disable-line test/used-1 ,test/unused, test/used-2",
                            output: "// ec0lint-disable-line test/used-1 , test/used-2"
                        },
                        {
                            code: "// ec0lint-disable-line test/used-1  , test/unused ,  test/used-2",
                            output: "// ec0lint-disable-line test/used-1  ,  test/used-2"
                        },
                        {
                            code: "/* ec0lint-disable test/used-1\n,test/unused,\ntest/used-2 */",
                            output: "/* ec0lint-disable test/used-1\n,\ntest/used-2 */"
                        },
                        {
                            code: "/* ec0lint-disable test/used-1\u2028,test/unused,\u2028test/used-2 */",
                            output: "/* ec0lint-disable test/used-1\u2028,\u2028test/used-2 */"
                        },
                        {
                            code: "// ec0lint-disable-line test/used-1\u00A0,test/unused,\u00A0test/used-2",
                            output: "// ec0lint-disable-line test/used-1\u00A0,\u00A0test/used-2"
                        },
                        {
                            code: "// ec0lint-disable-line , test/unused ,test/used",
                            output: "// ec0lint-disable-line ,test/used"
                        },
                        {
                            code: "/* ec0lint-disable\n, test/unused ,test/used */",
                            output: "/* ec0lint-disable\n,test/used */"
                        },
                        {
                            code: "/* ec0lint-disable test/used-1,\n,test/unused,test/used-2 */",
                            output: "/* ec0lint-disable test/used-1,\n,test/used-2 */"
                        },
                        {
                            code: "/* ec0lint-disable test/used-1,test/unused,\n,test/used-2 */",
                            output: "/* ec0lint-disable test/used-1,\n,test/used-2 */"
                        },
                        {
                            code: "/* ec0lint-disable test/used-1,\n,test/unused,\n,test/used-2 */",
                            output: "/* ec0lint-disable test/used-1,\n,\n,test/used-2 */"
                        },
                        {
                            code: "// ec0lint-disable-line test/used, test/unused,",
                            output: "// ec0lint-disable-line test/used,"
                        },
                        {
                            code: "// ec0lint-disable-next-line test/used, test/unused,\n",
                            output: "// ec0lint-disable-next-line test/used,\n"
                        },
                        {
                            code: "// ec0lint-disable-line test/used, test/unused, ",
                            output: "// ec0lint-disable-line test/used, "
                        },
                        {
                            code: "// ec0lint-disable-line test/used, test/unused, -- comment",
                            output: "// ec0lint-disable-line test/used, -- comment"
                        },
                        {
                            code: "/* ec0lint-disable test/used, test/unused,\n*/",
                            output: "/* ec0lint-disable test/used,\n*/"
                        },

                        // when removing the last rule, the comma and all whitespace up to the previous rule (or previous lone comma) should also be removed
                        {
                            code: "// ec0lint-disable-line test/used,test/unused",
                            output: "// ec0lint-disable-line test/used"
                        },
                        {
                            code: "// ec0lint-disable-line test/used, test/unused",
                            output: "// ec0lint-disable-line test/used"
                        },
                        {
                            code: "// ec0lint-disable-line test/used ,test/unused",
                            output: "// ec0lint-disable-line test/used"
                        },
                        {
                            code: "// ec0lint-disable-line test/used , test/unused",
                            output: "// ec0lint-disable-line test/used"
                        },
                        {
                            code: "// ec0lint-disable-line test/used,  test/unused",
                            output: "// ec0lint-disable-line test/used"
                        },
                        {
                            code: "// ec0lint-disable-line test/used  ,test/unused",
                            output: "// ec0lint-disable-line test/used"
                        },
                        {
                            code: "/* ec0lint-disable test/used\n,\ntest/unused */",
                            output: "/* ec0lint-disable test/used */"
                        },
                        {
                            code: "/* ec0lint-disable test/used \n \n,\n\n test/unused */",
                            output: "/* ec0lint-disable test/used */"
                        },
                        {
                            code: "/* ec0lint-disable test/used\u2028,\u2028test/unused */",
                            output: "/* ec0lint-disable test/used */"
                        },
                        {
                            code: "// ec0lint-disable-line test/used\u00A0,\u00A0test/unused",
                            output: "// ec0lint-disable-line test/used"
                        },
                        {
                            code: "// ec0lint-disable-line test/used,,test/unused",
                            output: "// ec0lint-disable-line test/used,"
                        },
                        {
                            code: "// ec0lint-disable-line test/used, ,test/unused",
                            output: "// ec0lint-disable-line test/used,"
                        },
                        {
                            code: "/* ec0lint-disable test/used,\n,test/unused */",
                            output: "/* ec0lint-disable test/used, */"
                        },
                        {
                            code: "/* ec0lint-disable test/used\n, ,test/unused */",
                            output: "/* ec0lint-disable test/used\n, */"
                        },

                        // content after the last rule should not be changed
                        {
                            code: "// ec0lint-disable-line test/used,test/unused",
                            output: "// ec0lint-disable-line test/used"
                        },
                        {
                            code: "// ec0lint-disable-line test/used,test/unused ",
                            output: "// ec0lint-disable-line test/used "
                        },
                        {
                            code: "// ec0lint-disable-line test/used,test/unused  ",
                            output: "// ec0lint-disable-line test/used  "
                        },
                        {
                            code: "// ec0lint-disable-line test/used,test/unused -- comment",
                            output: "// ec0lint-disable-line test/used -- comment"
                        },
                        {
                            code: "// ec0lint-disable-next-line test/used,test/unused\n",
                            output: "// ec0lint-disable-next-line test/used\n"
                        },
                        {
                            code: "// ec0lint-disable-next-line test/used,test/unused \n",
                            output: "// ec0lint-disable-next-line test/used \n"
                        },
                        {
                            code: "/* ec0lint-disable test/used,test/unused\u2028*/",
                            output: "/* ec0lint-disable test/used\u2028*/"
                        },
                        {
                            code: "// ec0lint-disable-line test/used,test/unused\u00A0",
                            output: "// ec0lint-disable-line test/used\u00A0"
                        },

                        // multiply rules to remove
                        {
                            code: "// ec0lint-disable-line test/used, test/unused-1, test/unused-2",
                            output: "// ec0lint-disable-line test/used"
                        },
                        {
                            code: "// ec0lint-disable-line test/unused-1, test/used, test/unused-2",
                            output: "// ec0lint-disable-line test/used"
                        },
                        {
                            code: "// ec0lint-disable-line test/unused-1, test/unused-2, test/used",
                            output: "// ec0lint-disable-line test/used"
                        },
                        {
                            code: "// ec0lint-disable-line test/used-1, test/unused-1, test/used-2, test/unused-2",
                            output: "// ec0lint-disable-line test/used-1, test/used-2"
                        },
                        {
                            code: "// ec0lint-disable-line test/unused-1, test/used-1, test/unused-2, test/used-2",
                            output: "// ec0lint-disable-line test/used-1, test/used-2"
                        },
                        {
                            code: `
                        /* ec0lint-disable test/unused-1,
                           test/used-1,
                           test/unused-2,
                           test/used-2
                        */
                    `,
                            output: `
                        /* ec0lint-disable test/used-1,
                           test/used-2
                        */
                    `
                        },
                        {
                            code: `
                        /* ec0lint-disable
                               test/unused-1,
                               test/used-1,
                               test/unused-2,
                               test/used-2
                        */
                    `,
                            output: `
                        /* ec0lint-disable
                               test/used-1,
                               test/used-2
                        */
                    `
                        },
                        {
                            code: `
                        /* ec0lint-disable
                               test/used-1,
                               test/unused-1,
                               test/used-2,
                               test/unused-2
                        */
                    `,
                            output: `
                        /* ec0lint-disable
                               test/used-1,
                               test/used-2
                        */
                    `
                        },
                        {
                            code: `
                        /* ec0lint-disable
                               test/used-1,
                               test/unused-1,
                               test/used-2,
                               test/unused-2,
                        */
                    `,
                            output: `
                        /* ec0lint-disable
                               test/used-1,
                               test/used-2,
                        */
                    `
                        },
                        {
                            code: `
                        /* ec0lint-disable
                               ,test/unused-1
                               ,test/used-1
                               ,test/unused-2
                               ,test/used-2
                        */
                    `,
                            output: `
                        /* ec0lint-disable
                               ,test/used-1
                               ,test/used-2
                        */
                    `
                        },
                        {
                            code: `
                        /* ec0lint-disable
                               ,test/used-1
                               ,test/unused-1
                               ,test/used-2
                               ,test/unused-2
                        */
                    `,
                            output: `
                        /* ec0lint-disable
                               ,test/used-1
                               ,test/used-2
                        */
                    `
                        },
                        {
                            code: `
                        /* ec0lint-disable
                               test/used-1,
                               test/unused-1,
                               test/used-2,
                               test/unused-2

                               -- comment
                        */
                    `,
                            output: `
                        /* ec0lint-disable
                               test/used-1,
                               test/used-2

                               -- comment
                        */
                    `
                        },

                        // duplicates in the list
                        {
                            code: "// ec0lint-disable-line test/unused, test/unused, test/used",
                            output: "// ec0lint-disable-line test/used"
                        },
                        {
                            code: "// ec0lint-disable-line test/unused, test/used, test/unused",
                            output: "// ec0lint-disable-line test/used"
                        },
                        {
                            code: "// ec0lint-disable-line test/used, test/unused, test/unused, test/used",
                            output: "// ec0lint-disable-line test/used, test/used"
                        }
                    ];

                    for (const { code, output } of tests) {
                        it(code, () => {
                            assert.strictEqual(
                                linter.verifyAndFix(code, config).output,
                                output
                            );
                        });
                    }
                });
            });

        });

        describe("Default Global Variables", () => {
            const code = "x";

            it("builtin global variables should be available in the global scope", () => {
                let spy;
                const config = {
                    plugins: {
                        test: {
                            rules: {
                                checker: context => {
                                    spy = sinon.spy(() => {
                                        const scope = context.getScope();

                                        assert.notStrictEqual(getVariable(scope, "Object"), null);
                                        assert.notStrictEqual(getVariable(scope, "Array"), null);
                                        assert.notStrictEqual(getVariable(scope, "undefined"), null);
                                    });

                                    return { Program: spy };
                                }
                            }
                        }
                    },
                    languageOptions: {
                        ecmaVersion: 5,
                        sourceType: "script"
                    },
                    rules: {
                        "test/checker": "error"
                    }
                };

                linter.verify(code, config);
                assert(spy && spy.calledOnce, "Rule should have been called.");
            });

            // it("ES6 global variables should be available by default", () => {
            //     let spy;
            //     const config = {
            //         plugins: {
            //             test: {
            //                 rules: {
            //                     checker: context => {
            //                         spy = sinon.spy(() => {
            //                             const scope = context.getScope();

            //                             assert.notStrictEqual(getVariable(scope, "Promise"), null);
            //                             assert.notStrictEqual(getVariable(scope, "Symbol"), null);
            //                             assert.notStrictEqual(getVariable(scope, "WeakMap"), null);
            //                         });

            //                         return { Program: spy };
            //                     }
            //                 }
            //             }
            //         },
            //         languageOptions: {
            //             sourceType: "script"
            //         },
            //         rules: {
            //             "test/checker": "error"
            //         }
            //     };

            //     linter.verify(code, config);
            //     assert(spy && spy.calledOnce);
            // });

        });

        describe("Suggestions", () => {
            it("provides suggestion information for tools to use", () => {

                const config = {
                    plugins: {
                        test: {
                            rules: {
                                "rule-with-suggestions": {
                                    meta: { hasSuggestions: true },
                                    create: context => ({
                                        Program(node) {
                                            context.report({
                                                node,
                                                message: "Incorrect spacing",
                                                suggest: [{
                                                    desc: "Insert space at the beginning",
                                                    fix: fixer => fixer.insertTextBefore(node, " ")
                                                }, {
                                                    desc: "Insert space at the end",
                                                    fix: fixer => fixer.insertTextAfter(node, " ")
                                                }]
                                            });
                                        }
                                    })
                                }
                            }
                        }
                    },
                    rules: {
                        "test/rule-with-suggestions": "error"
                    }
                };

                const messages = linter.verify("var a = 1;", config);
                const suppressedMessages = linter.getSuppressedMessages();

                assert.deepStrictEqual(messages[0].suggestions, [{
                    desc: "Insert space at the beginning",
                    fix: {
                        range: [0, 0],
                        text: " "
                    }
                }, {
                    desc: "Insert space at the end",
                    fix: {
                        range: [10, 10],
                        text: " "
                    }
                }]);

                assert.strictEqual(suppressedMessages.length, 0);
            });

            it("supports messageIds for suggestions", () => {

                const config = {
                    plugins: {
                        test: {
                            rules: {
                                "rule-with-suggestions": {
                                    meta: {
                                        messages: {
                                            suggestion1: "Insert space at the beginning",
                                            suggestion2: "Insert space at the end"
                                        },
                                        hasSuggestions: true
                                    },
                                    create: context => ({
                                        Program(node) {
                                            context.report({
                                                node,
                                                message: "Incorrect spacing",
                                                suggest: [{
                                                    messageId: "suggestion1",
                                                    fix: fixer => fixer.insertTextBefore(node, " ")
                                                }, {
                                                    messageId: "suggestion2",
                                                    fix: fixer => fixer.insertTextAfter(node, " ")
                                                }]
                                            });
                                        }
                                    })
                                }
                            }
                        }
                    },
                    rules: {
                        "test/rule-with-suggestions": "error"
                    }
                };

                const messages = linter.verify("var a = 1;", config);
                const suppressedMessages = linter.getSuppressedMessages();

                assert.deepStrictEqual(messages[0].suggestions, [{
                    messageId: "suggestion1",
                    desc: "Insert space at the beginning",
                    fix: {
                        range: [0, 0],
                        text: " "
                    }
                }, {
                    messageId: "suggestion2",
                    desc: "Insert space at the end",
                    fix: {
                        range: [10, 10],
                        text: " "
                    }
                }]);

                assert.strictEqual(suppressedMessages.length, 0);
            });

            it("should throw an error if suggestion is passed but `meta.hasSuggestions` property is not enabled", () => {

                const config = {
                    plugins: {
                        test: {
                            rules: {
                                "rule-with-suggestions": {
                                    meta: { docs: {}, schema: [] },
                                    create: context => ({
                                        Program(node) {
                                            context.report({
                                                node,
                                                message: "hello world",
                                                suggest: [{ desc: "convert to foo", fix: fixer => fixer.insertTextBefore(node, " ") }]
                                            });
                                        }
                                    })
                                }
                            }
                        }
                    },
                    rules: {
                        "test/rule-with-suggestions": "error"
                    }
                };

                assert.throws(() => {
                    linter.verify("0", config);
                }, "Rules with suggestions must set the `meta.hasSuggestions` property to `true`.");
            });

            it("should throw an error if suggestion is passed but `meta.hasSuggestions` property is not enabled and the rule has the obsolete `meta.docs.suggestion` property", () => {

                const config = {
                    plugins: {
                        test: {
                            rules: {
                                "rule-with-meta-docs-suggestion": {
                                    meta: { docs: { suggestion: true }, schema: [] },
                                    create: context => ({
                                        Program(node) {
                                            context.report({
                                                node,
                                                message: "hello world",
                                                suggest: [{ desc: "convert to foo", fix: fixer => fixer.insertTextBefore(node, " ") }]
                                            });
                                        }
                                    })
                                }
                            }
                        }
                    },
                    rules: {
                        "test/rule-with-meta-docs-suggestion": "error"
                    }
                };

                assert.throws(() => {
                    linter.verify("0", config);
                }, "Rules with suggestions must set the `meta.hasSuggestions` property to `true`. `meta.docs.suggestion` is ignored by ec0lint.");
            });
        });


        describe("Error Conditions", () => {
            describe("when evaluating broken code", () => {
                const code = BROKEN_TEST_CODE;

                it("should report a violation with a useful parse error prefix", () => {
                    const messages = linter.verify(code);
                    const suppressedMessages = linter.getSuppressedMessages();

                    assert.strictEqual(messages.length, 1);
                    assert.strictEqual(messages[0].severity, 2);
                    assert.isNull(messages[0].ruleId);
                    assert.strictEqual(messages[0].line, 1);
                    assert.strictEqual(messages[0].column, 4);
                    assert.isTrue(messages[0].fatal);
                    assert.match(messages[0].message, /^Parsing error:/u);

                    assert.strictEqual(suppressedMessages.length, 0);
                });

                it("should report source code where the issue is present", () => {
                    const inValidCode = [
                        "var x = 20;",
                        "if (x ==4 {",
                        "    x++;",
                        "}"
                    ];
                    const messages = linter.verify(inValidCode.join("\n"));
                    const suppressedMessages = linter.getSuppressedMessages();

                    assert.strictEqual(messages.length, 1);
                    assert.strictEqual(messages[0].severity, 2);
                    assert.isTrue(messages[0].fatal);
                    assert.match(messages[0].message, /^Parsing error:/u);

                    assert.strictEqual(suppressedMessages.length, 0);
                });
            });
        });
    });

    describe("getSourceCode()", () => {
        const code = TEST_CODE;

        it("should retrieve SourceCode object after reset", () => {
            linter.verify(code, {}, filename, true);

            const sourceCode = linter.getSourceCode();

            assert.isObject(sourceCode);
            assert.strictEqual(sourceCode.text, code);
            assert.isObject(sourceCode.ast);
        });

        it("should retrieve SourceCode object without reset", () => {
            linter.verify(code, {}, filename);

            const sourceCode = linter.getSourceCode();

            assert.isObject(sourceCode);
            assert.strictEqual(sourceCode.text, code);
            assert.isObject(sourceCode.ast);
        });

    });

    describe("getSuppressedMessages()", () => {
        it("should have no suppressed messages", () => {
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should have a suppressed message", () => {
            const code = "/* ec0lint-disable lighter-http -- justification */\nlet foo = require('axios');";
            const config = {
                rules: { "lighter-http": 1 }
            };
            const messages = linter.verify(code, config);
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 0);

            assert.strictEqual(suppressedMessages.length, 1);
            assert.strictEqual(suppressedMessages[0].ruleId, "lighter-http");
            assert.deepStrictEqual(
                suppressedMessages[0].suppressions,
                [{ kind: "directive", justification: "justification" }]
            );
        });

        it("should have a suppressed message", () => {
            const code = [
                "/* ec0lint-disable lighter-http -- j1",
                " * j2",
                " */",
                "let foo = require('axios');"
            ].join("\n");
            const config = {
                rules: { "lighter-http": 1 }
            };
            const messages = linter.verify(code, config);
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 0);

            assert.strictEqual(suppressedMessages.length, 1);
            assert.strictEqual(suppressedMessages[0].ruleId, "lighter-http");
            assert.deepStrictEqual(
                suppressedMessages[0].suppressions,
                [{ kind: "directive", justification: "j1\n * j2" }]
            );
        });
    });

    describe("defineRule()", () => {
        it("should throw an error when called in flat config mode", () => {
            assert.throws(() => {
                linter.defineRule("foo", () => { });
            }, /This method cannot be used with flat config/u);
        });
    });

    describe("defineRules()", () => {
        it("should throw an error when called in flat config mode", () => {
            assert.throws(() => {
                linter.defineRules({});
            }, /This method cannot be used with flat config/u);
        });
    });

    describe("defineParser()", () => {
        it("should throw an error when called in flat config mode", () => {
            assert.throws(() => {
                linter.defineParser("foo", {});
            }, /This method cannot be used with flat config/u);
        });
    });

    describe("getRules()", () => {
        it("should throw an error when called in flat config mode", () => {
            assert.throws(() => {
                linter.getRules();
            }, /This method cannot be used with flat config/u);
        });
    });

    describe("version", () => {
        it("should return current version number", () => {
            const version = linter.version;

            assert.isString(version);
            assert.isTrue(parseInt(version[0], 10) >= 0);
        });
    });

    describe("verifyAndFix()", () => {
        it("stops fixing after 10 passes", () => {

            const config = {
                plugins: {
                    test: {
                        rules: {
                            "add-spaces": {
                                meta: {
                                    fixable: "whitespace"
                                },
                                create(context) {
                                    return {
                                        Program(node) {
                                            context.report({
                                                node,
                                                message: "Add a space before this node.",
                                                fix: fixer => fixer.insertTextBefore(node, " ")
                                            });
                                        }
                                    };
                                }
                            }
                        }
                    }
                },
                rules: {
                    "test/add-spaces": "error"
                }
            };

            const fixResult = linter.verifyAndFix("a", config);
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(fixResult.fixed, true);
            assert.strictEqual(fixResult.output, `${" ".repeat(10)}a`);
            assert.strictEqual(fixResult.messages.length, 1);

            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should throw an error if fix is passed but meta has no `fixable` property", () => {

            const config = {
                plugins: {
                    test: {
                        rules: {
                            "test-rule": {
                                meta: {
                                    docs: {},
                                    schema: []
                                },
                                create: context => ({
                                    Program(node) {
                                        context.report(node, "hello world", {}, () => ({ range: [1, 1], text: "" }));
                                    }
                                })
                            }
                        }
                    }
                },
                rules: {
                    "test/test-rule": "error"
                }
            };


            assert.throws(() => {
                linter.verify("0", config);
            }, /Fixable rules must set the `meta\.fixable` property to "code" or "whitespace".\nOccurred while linting <input>:1\nRule: "test\/test-rule"$/u);
        });

        it("should throw an error if fix is passed and there is no metadata", () => {

            const config = {
                plugins: {
                    test: {
                        rules: {
                            "test-rule": {
                                create: context => ({
                                    Program(node) {
                                        context.report(node, "hello world", {}, () => ({ range: [1, 1], text: "" }));
                                    }
                                })
                            }
                        }
                    }
                },
                rules: {
                    "test/test-rule": "error"
                }
            };

            assert.throws(() => {
                linter.verify("0", config);
            }, /Fixable rules must set the `meta\.fixable` property/u);
        });

        it("should throw an error if fix is passed from a legacy-format rule", () => {

            const config = {
                plugins: {
                    test: {
                        rules: {
                            "test-rule": context => ({
                                Program(node) {
                                    context.report(node, "hello world", {}, () => ({ range: [1, 1], text: "" }));
                                }
                            })
                        }
                    }
                },
                rules: {
                    "test/test-rule": "error"
                }
            };


            assert.throws(() => {
                linter.verify("0", config);
            }, /Fixable rules must set the `meta\.fixable` property/u);
        });
    });

    describe("Mutability", () => {
        let linter1 = null;
        let linter2 = null;

        beforeEach(() => {
            linter1 = new Linter();
            linter2 = new Linter();
        });

        describe("rules", () => {
            it("with no changes, same rules are loaded", () => {
                assert.sameDeepMembers(Array.from(linter1.getRules().keys()), Array.from(linter2.getRules().keys()));
            });

            it("loading rule in one doesn't change the other", () => {
                linter1.defineRule("mock-rule", () => ({}));

                assert.isTrue(linter1.getRules().has("mock-rule"), "mock rule is present");
                assert.isFalse(linter2.getRules().has("mock-rule"), "mock rule is not present");
            });
        });
    });


    describe("processors", () => {
        let receivedFilenames = [];
        let receivedPhysicalFilenames = [];
        const extraConfig = {
            plugins: {
                test: {
                    rules: {
                        "report-original-text": {
                            meta: {

                            },
                            create(context) {
                                return {
                                    Program(ast) {
                                        receivedFilenames.push(context.getFilename());
                                        receivedPhysicalFilenames.push(context.getPhysicalFilename());
                                        context.report({ node: ast, message: context.getSourceCode().text });
                                    }
                                };
                            }
                        }
                    }
                }
            }
        };

        beforeEach(() => {
            receivedFilenames = [];
            receivedPhysicalFilenames = [];
        });

        describe("preprocessors", () => {
            it("should receive text and filename.", () => {
                const code = "foo bar baz";
                const preprocess = sinon.spy(text => text.split(" "));
                const configs = createFlatConfigArray({});

                configs.normalizeSync();

                linter.verify(code, configs, { filename, preprocess });

                assert.strictEqual(preprocess.calledOnce, true, "preprocess wasn't called");
                assert.deepStrictEqual(preprocess.args[0], [code, filename], "preprocess was called with the wrong arguments");
            });

            it("should run preprocess only once", () => {
                const logs = [];
                const config = {
                    files: ["*.md"],
                    processor: {
                        preprocess(text, filenameForText) {
                            logs.push({
                                text,
                                filename: filenameForText
                            });

                            return [{ text: "bar", filename: "0.js" }];
                        },
                        postprocess() {
                            return [];
                        }
                    }
                };

                linter.verify("foo", config, "a.md");
                assert.strictEqual(logs.length, 1, "preprocess() should only be called once.");
            });

            it("should apply a preprocessor to the code, and lint each code sample separately", () => {
                const code = "foo bar baz";
                const configs = createFlatConfigArray([
                    extraConfig,
                    { rules: { "test/report-original-text": "error" } }
                ]);

                configs.normalizeSync();

                const problems = linter.verify(
                    code,
                    configs,
                    {
                        filename,

                        // Apply a preprocessor that splits the source text into spaces and lints each word individually
                        preprocess(input) {
                            return input.split(" ");
                        }
                    }
                );
                const suppressedMessages = linter.getSuppressedMessages();

                assert.strictEqual(problems.length, 3);
                assert.deepStrictEqual(problems.map(problem => problem.message), ["foo", "bar", "baz"]);

                assert.strictEqual(suppressedMessages.length, 0);
            });

            it("should apply a preprocessor to the code even if the preprocessor returned code block objects.", () => {
                const code = "foo bar baz";
                const configs = createFlatConfigArray([
                    extraConfig,
                    { rules: { "test/report-original-text": "error" } }
                ]);

                configs.normalizeSync();

                const problems = linter.verify(
                    code,
                    configs,
                    {
                        filename,

                        // Apply a preprocessor that splits the source text into spaces and lints each word individually
                        preprocess(input) {
                            return input.split(" ").map(text => ({
                                filename: "block.js",
                                text
                            }));
                        }
                    }
                );
                const suppressedMessages = linter.getSuppressedMessages();

                assert.strictEqual(problems.length, 3);
                assert.deepStrictEqual(problems.map(problem => problem.message), ["foo", "bar", "baz"]);

                assert.strictEqual(suppressedMessages.length, 0);

                // filename
                assert.strictEqual(receivedFilenames.length, 3);
                assert(/^filename\.js[/\\]0_block\.js/u.test(receivedFilenames[0]));
                assert(/^filename\.js[/\\]1_block\.js/u.test(receivedFilenames[1]));
                assert(/^filename\.js[/\\]2_block\.js/u.test(receivedFilenames[2]));

                // physical filename
                assert.strictEqual(receivedPhysicalFilenames.length, 3);
                assert.strictEqual(receivedPhysicalFilenames.every(name => name === filename), true);
            });

            it("should receive text even if a SourceCode object was given.", () => {
                const code = "foo";
                const preprocess = sinon.spy(text => text.split(" "));
                const configs = createFlatConfigArray([
                    extraConfig
                ]);

                configs.normalizeSync();

                linter.verify(code, configs);
                const sourceCode = linter.getSourceCode();

                linter.verify(sourceCode, configs, { filename, preprocess });

                assert.strictEqual(preprocess.calledOnce, true);
                assert.deepStrictEqual(preprocess.args[0], [code, filename]);
            });

            it("should receive text even if a SourceCode object was given (with BOM).", () => {
                const code = "\uFEFFfoo";
                const preprocess = sinon.spy(text => text.split(" "));
                const configs = createFlatConfigArray([
                    extraConfig
                ]);

                configs.normalizeSync();

                linter.verify(code, configs);
                const sourceCode = linter.getSourceCode();

                linter.verify(sourceCode, configs, { filename, preprocess });

                assert.strictEqual(preprocess.calledOnce, true);
                assert.deepStrictEqual(preprocess.args[0], [code, filename]);
            });
        });

        describe("postprocessors", () => {
            it("should receive result and filename.", () => {
                const code = "foo bar baz";
                const preprocess = sinon.spy(text => text.split(" "));
                const postprocess = sinon.spy(text => [text]);
                const configs = createFlatConfigArray([
                    extraConfig
                ]);

                configs.normalizeSync();

                linter.verify(code, configs, { filename, postprocess, preprocess });

                assert.strictEqual(postprocess.calledOnce, true);
                assert.deepStrictEqual(postprocess.args[0], [[[], [], []], filename]);
            });

            it("should apply a postprocessor to the reported messages", () => {
                const code = "foo bar baz";
                const configs = createFlatConfigArray([
                    extraConfig,
                    { rules: { "test/report-original-text": "error" } }
                ]);

                configs.normalizeSync();

                const problems = linter.verify(
                    code,
                    configs,
                    {
                        preprocess: input => input.split(" "),

                        /*
                         * Apply a postprocessor that updates the locations of the reported problems
                         * to make sure they correspond to the locations in the original text.
                         */
                        postprocess(problemLists) {
                            problemLists.forEach(problemList => assert.strictEqual(problemList.length, 1));
                            return problemLists.reduce(
                                (combinedList, problemList, index) =>
                                    combinedList.concat(
                                        problemList.map(
                                            problem =>
                                                Object.assign(
                                                    {},
                                                    problem,
                                                    {
                                                        message: problem.message.toUpperCase(),
                                                        column: problem.column + index * 4
                                                    }
                                                )
                                        )
                                    ),
                                []
                            );
                        }
                    }
                );
                const suppressedMessages = linter.getSuppressedMessages();

                assert.strictEqual(problems.length, 3);
                assert.deepStrictEqual(problems.map(problem => problem.message), ["FOO", "BAR", "BAZ"]);
                assert.deepStrictEqual(problems.map(problem => problem.column), [1, 5, 9]);

                assert.strictEqual(suppressedMessages.length, 0);
            });

            it("should use postprocessed problem ranges when applying autofixes", () => {
                const code = "foo bar baz";
                const configs = createFlatConfigArray([
                    extraConfig,
                    {
                        plugins: {
                            test2: {
                                rules: {
                                    "capitalize-identifiers": {
                                        meta: {
                                            fixable: "code"
                                        },
                                        create(context) {
                                            return {
                                                Identifier(node) {
                                                    if (node.name !== node.name.toUpperCase()) {
                                                        context.report({
                                                            node,
                                                            message: "Capitalize this identifier",
                                                            fix: fixer => fixer.replaceText(node, node.name.toUpperCase())
                                                        });
                                                    }
                                                }
                                            };
                                        }
                                    }
                                }
                            }
                        }
                    },
                    { rules: { "test2/capitalize-identifiers": "error" } }
                ]);

                configs.normalizeSync();

                const fixResult = linter.verifyAndFix(
                    code,
                    configs,
                    {

                        /*
                         * Apply a postprocessor that updates the locations of autofixes
                         * to make sure they correspond to locations in the original text.
                         */
                        preprocess: input => input.split(" "),
                        postprocess(problemLists) {
                            return problemLists.reduce(
                                (combinedProblems, problemList, blockIndex) =>
                                    combinedProblems.concat(
                                        problemList.map(problem =>
                                            Object.assign(problem, {
                                                fix: {
                                                    text: problem.fix.text,
                                                    range: problem.fix.range.map(
                                                        rangeIndex => rangeIndex + blockIndex * 4
                                                    )
                                                }
                                            }))
                                    ),
                                []
                            );
                        }
                    }
                );
                const suppressedMessages = linter.getSuppressedMessages();

                assert.strictEqual(fixResult.fixed, true);
                assert.strictEqual(fixResult.messages.length, 0);
                assert.strictEqual(fixResult.output, "FOO BAR BAZ");

                assert.strictEqual(suppressedMessages.length, 0);
            });
        });
    });

    describe("Edge cases", () => {

        describe("Modules", () => {
            const moduleConfig = {
                languageOptions: {
                    sourceType: "module",
                    ecmaVersion: 6
                }
            };

            it("should properly parse import statements when sourceType is module", () => {
                const code = "import foo from 'foo';";
                const messages = linter.verify(code, moduleConfig);
                const suppressedMessages = linter.getSuppressedMessages();

                assert.strictEqual(messages.length, 0, "Unexpected linting error.");
                assert.strictEqual(suppressedMessages.length, 0);
            });

            it("should properly parse import all statements when sourceType is module", () => {
                const code = "import * as foo from 'foo';";
                const messages = linter.verify(code, moduleConfig);
                const suppressedMessages = linter.getSuppressedMessages();

                assert.strictEqual(messages.length, 0, "Unexpected linting error.");
                assert.strictEqual(suppressedMessages.length, 0);
            });

            it("should properly parse default export statements when sourceType is module", () => {
                const code = "export default function initialize() {}";
                const messages = linter.verify(code, moduleConfig);
                const suppressedMessages = linter.getSuppressedMessages();

                assert.strictEqual(messages.length, 0, "Unexpected linting error.");
                assert.strictEqual(suppressedMessages.length, 0);
            });

        });


        // https://github.com/eslint/eslint/issues/9687
        it("should report an error when invalid languageOptions found", () => {
            let messages = linter.verify("", { languageOptions: { ecmaVersion: 222 } });

            assert.deepStrictEqual(messages.length, 1);
            assert.ok(messages[0].message.includes("Invalid ecmaVersion"));

            assert.throws(() => {
                linter.verify("", { languageOptions: { sourceType: "foo" } });
            }, /Expected "script", "module", or "commonjs"./u);


            messages = linter.verify("", { languageOptions: { ecmaVersion: 5, sourceType: "module" } });
            const suppressedMessages = linter.getSuppressedMessages();

            assert.deepStrictEqual(messages.length, 1);
            assert.ok(messages[0].message.includes("sourceType 'module' is not supported when ecmaVersion < 2015"));

            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should not crash when invalid parentheses syntax is encountered", () => {
            linter.verify("left = (aSize.width/2) - ()");
        });

        it("should not crash when let is used inside of switch case", () => {
            linter.verify("switch(foo) { case 1: let bar=2; }", { languageOptions: { ecmaVersion: 6 } });
        });

        it("should not crash when parsing destructured assignment", () => {
            linter.verify("var { a='a' } = {};", { languageOptions: { ecmaVersion: 6 } });
        });

        it("should report syntax error when a keyword exists in object property shorthand", () => {
            const messages = linter.verify("let a = {this}", { languageOptions: { ecmaVersion: 6 } });
            const suppressedMessages = linter.getSuppressedMessages();

            assert.strictEqual(messages.length, 1);
            assert.strictEqual(messages[0].fatal, true);

            assert.strictEqual(suppressedMessages.length, 0);
        });

        it("should not crash when we reuse the SourceCode object", () => {
            const config = {
                languageOptions: {
                    ecmaVersion: 6,
                    parserOptions: {
                        ecmaFeatures: { jsx: true }
                    }
                }
            };

            linter.verify("function render() { return <div className='test'>{hello}</div> }", config);
            linter.verify(linter.getSourceCode(), config);
        });

        it("should reuse the SourceCode object", () => {
            let ast1 = null,
                ast2 = null;

            const config = {
                plugins: {
                    test: {
                        rules: {
                            "save-ast1": () => ({
                                Program(node) {
                                    ast1 = node;
                                }
                            }),

                            "save-ast2": () => ({
                                Program(node) {
                                    ast2 = node;
                                }
                            })

                        }
                    }
                },
                languageOptions: {
                    ecmaVersion: 6,
                    parserOptions: {
                        ecmaFeatures: { jsx: true }
                    }
                }
            };


            linter.verify("function render() { return <div className='test'>{hello}</div> }", { ...config, rules: { "test/save-ast1": "error" } });
            linter.verify(linter.getSourceCode(), { ...config, rules: { "test/save-ast2": "error" } });

            assert(ast1 !== null);
            assert(ast2 !== null);
            assert(ast1 === ast2);
        });

        it("should not modify config object passed as argument", () => {
            const config = {};

            Object.freeze(config);
            linter.verify("var", config);
        });

        it("should pass 'id' to rule contexts with the rule id", () => {

            const spy = sinon.spy(context => {
                assert.strictEqual(context.id, "test/foo-bar-baz");
                return {};
            });

            const config = {
                plugins: {
                    test: {
                        rules: {
                            "foo-bar-baz": spy
                        }
                    }
                },
                rules: {
                    "test/foo-bar-baz": "error"
                }
            };


            linter.verify("x", config);
            assert(spy.calledOnce);
        });


        describe("when evaluating an empty string", () => {
            it("runs rules", () => {

                const config = {
                    plugins: {
                        test: {
                            rules: {
                                "no-programs": context => ({
                                    Program(node) {
                                        context.report({ node, message: "No programs allowed." });
                                    }
                                })
                            }
                        }
                    },
                    rules: {
                        "test/no-programs": "error"
                    }
                };

                assert.strictEqual(
                    linter.verify("", config).length,
                    1
                );
            });
        });

    });

});
