/**
 * @fileoverview Tests for cli.
 * @author Ian Christian Myers
 */

"use strict";

/*
 * NOTE: If you are adding new tests for cli.js, use verifyESLintOpts(). The
 * test only needs to verify that ESLint receives the correct opts.
 */

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const assert = require("chai").assert,
    stdAssert = require("assert"),
    { Ec0lint } = require("../../lib/ec0lint"),
    BuiltinRules = require("../../lib/rules"),
    path = require("path"),
    sinon = require("sinon"),
    os = require("os"),
    sh = require("shelljs");

const proxyquire = require("proxyquire").noCallThru().noPreserveCache();

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("cli", () => {
    let fixtureDir;
    const log = {
        info: sinon.spy(),
        error: sinon.spy()
    };
    const RuntimeInfo = {
        environment: sinon.stub(),
        version: sinon.stub()
    };
    const cli = proxyquire("../../lib/cli", {
        "./shared/logging": log,
        "./shared/runtime-info": RuntimeInfo
    });

    /**
     * Verify that ESLint class receives correct opts via await cli.execute().
     * @param {string} cmd CLI command.
     * @param {Object} opts Options hash that should match that received by ESLint class.
     * @returns {void}
     */
    async function verifyESLintOpts(cmd, opts) {

        // create a fake ESLint class to test with
        const fakeEc0lint = sinon.mock().withExactArgs(sinon.match(opts));

        Object.defineProperties(fakeEc0lint.prototype, Object.getOwnPropertyDescriptors(Ec0lint.prototype));
        sinon.stub(fakeEc0lint.prototype, "lintFiles").returns([]);
        sinon.stub(fakeEc0lint.prototype, "loadFormatter").returns({ format: sinon.spy() });

        const localCLI = proxyquire("../../lib/cli", {
            "./ec0lint": { Ec0lint: fakeEc0lint },
            "./shared/logging": log
        });

        await localCLI.execute(cmd);
        sinon.verifyAndRestore();
    }

    // verifyESLintOpts

    /**
     * Returns the path inside of the fixture directory.
     * @param {...string} args file path segments.
     * @returns {string} The path inside the fixture directory.
     * @private
     */
    function getFixturePath(...args) {
        return path.join(fixtureDir, ...args);
    }

    // copy into clean area so as not to get "infected" by this project's .eslintrc files
    before(function () {

        /*
         * GitHub Actions Windows and macOS runners occasionally exhibit
         * extremely slow filesystem operations, during which copying fixtures
         * exceeds the default test timeout, so raise it just for this hook.
         * Mocha uses `this` to set timeouts on an individual hook level.
         */
        this.timeout(60 * 1000);
        fixtureDir = `${os.tmpdir()}/ec0lint/fixtures`;
        sh.mkdir("-p", fixtureDir);
        sh.cp("-r", "./tests/fixtures/.", fixtureDir);
    });

    afterEach(() => {
        log.info.resetHistory();
        log.error.resetHistory();
    });

    after(() => {
        sh.rm("-r", fixtureDir);
    });

    describe("execute()", () => {

        it("should not print debug info when passed the empty string as text", async () => {
            const result = await cli.execute(["--stdin", "--no-ec0lintrc"], "");

            assert.strictEqual(result, 0);
            assert.isTrue(log.info.notCalled);
        });

        it("should return no error when --ext .js2 is specified", async () => {
            const filePath = getFixturePath("files");
            const result = await cli.execute(`--ext .js2 ${filePath}`);

            assert.strictEqual(result, 0);
        });

        it("should exit with console error when passed unsupported arguments", async () => {
            const filePath = getFixturePath("files");
            const result = await cli.execute(`--blah --another ${filePath}`);

            assert.strictEqual(result, 2);
        });

    });

    describe("when given a config file", () => {
        it("should load the specified config file", async () => {
            const configPath = getFixturePath(".ec0lintrc");
            const filePath = getFixturePath("passing.js");

            await cli.execute(`--config ${configPath} ${filePath}`);
        });
    });

    describe("when given a config with environment set to browser", () => {
        it("should execute without any errors", async () => {
            const configPath = getFixturePath("configurations", "env-browser.json");
            const filePath = getFixturePath("globals-browser.js");
            const code = `--config ${configPath} ${filePath}`;

            const exit = await cli.execute(code);

            assert.strictEqual(exit, 0);
        });
    });

    describe("when given a config with environment set to Node.js", () => {
        it("should execute without any errors", async () => {
            const configPath = getFixturePath("configurations", "env-node.json");
            const filePath = getFixturePath("globals-node.js");
            const code = `--config ${configPath} ${filePath}`;

            const exit = await cli.execute(code);

            assert.strictEqual(exit, 0);
        });
    });

    describe("when given a config with environment set to Nashorn", () => {
        it("should execute without any errors", async () => {
            const configPath = getFixturePath("configurations", "env-nashorn.json");
            const filePath = getFixturePath("globals-nashorn.js");
            const code = `--config ${configPath} ${filePath}`;

            const exit = await cli.execute(code);

            assert.strictEqual(exit, 0);
        });
    });

    describe("when given a config with environment set to WebExtensions", () => {
        it("should execute without any errors", async () => {
            const configPath = getFixturePath("configurations", "env-webextensions.json");
            const filePath = getFixturePath("globals-webextensions.js");
            const code = `--config ${configPath} ${filePath}`;

            const exit = await cli.execute(code);

            assert.strictEqual(exit, 0);
        });
    });

    describe("when given a valid built-in formatter name", () => {
        it("should execute without any errors", async () => {
            const filePath = getFixturePath("passing.js");
            const exit = await cli.execute(`-f checkstyle ${filePath}`);

            assert.strictEqual(exit, 0);
        });
    });

    describe("when given a valid built-in formatter name that uses rules meta.", () => {
        it("should execute without any errors", async () => {
            const filePath = getFixturePath("passing.js");
            const exit = await cli.execute(`-f json-with-metadata ${filePath} --no-ec0lintrc`);

            assert.strictEqual(exit, 0);

            // Check metadata.
            const { metadata } = JSON.parse(log.info.args[0][0]);
            const expectedMetadata = {
                cwd: process.cwd(),
                rulesMeta: Array.from(BuiltinRules).reduce((obj, [ruleId, rule]) => {
                    obj[ruleId] = rule.meta;
                    return obj;
                }, {})
            };

            assert.deepStrictEqual(metadata, expectedMetadata);
        });
    });

    describe("when given an invalid built-in formatter name", () => {
        it("should execute with error", async () => {
            const filePath = getFixturePath("passing.js");
            const exit = await cli.execute(`-f fakeformatter ${filePath}`);

            assert.strictEqual(exit, 2);
        });
    });

    describe("when given a valid formatter path", () => {
        it("should execute without any errors", async () => {
            const formatterPath = getFixturePath("formatters", "simple.js");
            const filePath = getFixturePath("passing.js");
            const exit = await cli.execute(`-f ${formatterPath} ${filePath}`);

            assert.strictEqual(exit, 0);
        });
    });

    describe("when given an invalid formatter path", () => {
        it("should execute with error", async () => {
            const formatterPath = getFixturePath("formatters", "file-does-not-exist.js");
            const filePath = getFixturePath("passing.js");
            const exit = await cli.execute(`-f ${formatterPath} ${filePath}`);

            assert.strictEqual(exit, 2);
        });
    });

    describe("when given an async formatter path", () => {
        it("should execute without any errors", async () => {
            const formatterPath = getFixturePath("formatters", "async.js");
            const filePath = getFixturePath("passing.js");
            const exit = await cli.execute(`-f ${formatterPath} ${filePath}`);

            assert.strictEqual(log.info.getCall(0).args[0], "from async formatter");
            assert.strictEqual(exit, 0);
        });
    });

    describe("when using --fix-type without --fix or --fix-dry-run", () => {
        it("should exit with error", async () => {
            const filePath = getFixturePath("passing.js");
            const code = `--fix-type suggestion ${filePath}`;

            const exit = await cli.execute(code);

            assert.strictEqual(exit, 2);
        });
    });

    describe("when executing a file with a syntax error", () => {
        it("should exit with error", async () => {
            const filePath = getFixturePath("syntax-error.js");
            const exit = await cli.execute(`--no-ignore ${filePath}`);

            assert.strictEqual(exit, 1);
        });
    });

    describe("when executing with version flag", () => {
        it("should print out current version", async () => {
            assert.strictEqual(await cli.execute("-v"), 0);
            assert.strictEqual(log.info.callCount, 1);
        });
    });

    describe("when executing with env-info flag", () => {
        it("should print out environment information", async () => {
            assert.strictEqual(await cli.execute("--env-info"), 0);
            assert.strictEqual(log.info.callCount, 1);
        });

        it("should print error message and return error code", async () => {
            RuntimeInfo.environment.throws("There was an error!");

            assert.strictEqual(await cli.execute("--env-info"), 2);
            assert.strictEqual(log.error.callCount, 1);
        });
    });

    describe("when executing without no-error-on-unmatched-pattern flag", () => {
        it("should throw an error on unmatched glob pattern", async () => {
            const filePath = getFixturePath("unmatched-patterns");
            const globPattern = "*.js3";

            await stdAssert.rejects(async () => {
                await cli.execute(`"${filePath}/${globPattern}"`);
            }, new Error(`No files matching '${filePath}/${globPattern}' were found.`));
        });

        it("should throw an error on unmatched --ext", async () => {
            const filePath = getFixturePath("unmatched-patterns");
            const extension = ".js3";

            await stdAssert.rejects(async () => {
                await cli.execute(`--ext ${extension} ${filePath}`);
            }, `No files matching '${filePath}' were found`);
        });
    });

    describe("when executing with no-error-on-unmatched-pattern flag", () => {
        it("should not throw an error on unmatched node glob syntax patterns", async () => {
            const filePath = getFixturePath("unmatched-patterns");
            const exit = await cli.execute(`--no-error-on-unmatched-pattern "${filePath}/*.js3"`);

            assert.strictEqual(exit, 0);
        });

        it("should not throw an error on unmatched --ext", async () => {
            const filePath = getFixturePath("unmatched-patterns");
            const exit = await cli.execute(`--no-error-on-unmatched-pattern --ext .js3 ${filePath}`);

            assert.strictEqual(exit, 0);
        });
    });

    describe("when executing with no-error-on-unmatched-pattern flag and multiple patterns", () => {
        it("should not throw an error on multiple unmatched node glob syntax patterns", async () => {
            const filePath = getFixturePath("unmatched-patterns");
            const exit = await cli.execute(`--no-error-on-unmatched-pattern ${filePath}/*.js3 ${filePath}/*.js4`);

            assert.strictEqual(exit, 0);
        });

        it("should still throw an error on when a matched pattern has lint errors", async () => {
            const filePath = getFixturePath("unmatched-patterns");
            const exit = await cli.execute(`--no-error-on-unmatched-pattern ${filePath}/*.js3 ${filePath}/*.js`);

            assert.strictEqual(exit, 1);
        });
    });

    describe("when executing with no-error-on-unmatched-pattern flag and multiple --ext arguments", () => {
        it("should not throw an error on multiple unmatched --ext arguments", async () => {
            const filePath = getFixturePath("unmatched-patterns");
            const exit = await cli.execute(`--no-error-on-unmatched-pattern --ext .js3 --ext .js4 ${filePath}`);

            assert.strictEqual(exit, 0);
        });

        it("should still throw an error on when a matched pattern has lint errors", async () => {
            const filePath = getFixturePath("unmatched-patterns");
            const exit = await cli.execute(`--no-error-on-unmatched-pattern --ext .js3 --ext .js ${filePath}`);

            assert.strictEqual(exit, 1);
        });
    });

    describe("when executing with help flag", () => {
        it("should print out help", async () => {
            assert.strictEqual(await cli.execute("-h"), 0);
            assert.strictEqual(log.info.callCount, 1);
        });
    });

    describe("when given a directory with eslint excluded files in the directory", () => {
        it("should throw an error and not process any files", async () => {
            const ignorePath = getFixturePath(".ec0lintignore");
            const filePath = getFixturePath("cli");

            await stdAssert.rejects(async () => {
                await cli.execute(`--ignore-path ${ignorePath} ${filePath}`);
            }, new Error(`All files matched by '${filePath}' are ignored.`));
        });
    });

    describe("when given a file in excluded files list", () => {
        it("should not process the file", async () => {
            const ignorePath = getFixturePath(".ec0lintignore");
            const filePath = getFixturePath("passing.js");
            const exit = await cli.execute(`--ignore-path ${ignorePath} ${filePath}`);

            // a warning about the ignored file
            assert.isTrue(log.info.called);
            assert.strictEqual(exit, 0);
        });

        it("should process the file when forced", async () => {
            const ignorePath = getFixturePath(".ec0lintignore");
            const filePath = getFixturePath("passing.js");
            const exit = await cli.execute(`--ignore-path ${ignorePath} --no-ignore ${filePath}`);

            // no warnings
            assert.isFalse(log.info.called);
            assert.strictEqual(exit, 0);
        });
    });

    describe("when given a pattern to ignore", () => {
        it("should not process any files", async () => {
            const ignoredFile = getFixturePath("cli/syntax-error.js");
            const filePath = getFixturePath("cli/passing.js");
            const exit = await cli.execute(`--ignore-pattern cli/ ${ignoredFile} ${filePath}`);

            // warnings about the ignored files
            assert.isTrue(log.info.called);
            assert.strictEqual(exit, 0);
        });
    });

    describe("when given patterns to ignore", () => {
        it("should not process any matching files", async () => {
            const ignorePaths = ["a", "b"];

            const cmd = ignorePaths.map(ignorePath => `--ignore-pattern ${ignorePath}`).concat(".").join(" ");

            const opts = {
                overrideConfig: {
                    ignorePatterns: ignorePaths
                }
            };

            await verifyESLintOpts(cmd, opts);
        });
    });

    describe("when executing a file with a shebang", () => {
        it("should execute without error", async () => {
            const filePath = getFixturePath("shebang.js");
            const exit = await cli.execute(`--no-ignore ${filePath}`);

            assert.strictEqual(exit, 0);
        });
    });

    describe("when loading a custom rule", () => {
        it("should return an error when rule isn't found", async () => {
            const rulesPath = getFixturePath("rules", "wrong");
            const configPath = getFixturePath("rules", "ec0lint.json");
            const filePath = getFixturePath("rules", "test", "test-custom-rule.js");
            const code = `--rulesdir ${rulesPath} --config ${configPath} --no-ignore ${filePath}`;

            await stdAssert.rejects(async () => {
                const exit = await cli.execute(code);

                assert.strictEqual(exit, 2);
            }, /Error while loading rule 'custom-rule': Boom!/u);
        });

        it("should return a warning when rule is matched", async () => {
            const rulesPath = getFixturePath("rules");
            const configPath = getFixturePath("rules", "ec0lint.json");
            const filePath = getFixturePath("rules", "test", "test-custom-rule.js");
            const code = `--rulesdir ${rulesPath} --config ${configPath} --no-ignore ${filePath}`;

            await cli.execute(code);

            assert.isTrue(log.info.calledOnce);
            assert.isTrue(log.info.neverCalledWith(""));
        });

        it("should return warnings from multiple rules in different directories", async () => {
            const rulesPath = getFixturePath("rules", "dir1");
            const rulesPath2 = getFixturePath("rules", "dir2");
            const configPath = getFixturePath("rules", "multi-rulesdirs.json");
            const filePath = getFixturePath("rules", "test-multi-rulesdirs.js");
            const code = `--rulesdir ${rulesPath} --rulesdir ${rulesPath2} --config ${configPath} --no-ignore ${filePath}`;
            const exit = await cli.execute(code);

            const call = log.info.getCall(0);

            assert.isTrue(log.info.calledOnce);
            assert.isTrue(call.args[0].indexOf("String!") > -1);
            assert.isTrue(call.args[0].indexOf("Literal!") > -1);
            assert.isTrue(call.args[0].indexOf("2 problems") > -1);
            assert.isTrue(log.info.neverCalledWith(""));
            assert.strictEqual(exit, 1);
        });


    });
    describe("when executing with global flag", () => {

        it("should allow defining writable global variables", async () => {
            const filePath = getFixturePath("undef.js");
            const exit = await cli.execute(`--global baz:false,bat:true --no-ignore ${filePath}`);

            assert.isTrue(log.info.notCalled);
            assert.strictEqual(exit, 0);
        });

        it("should allow defining variables with multiple flags", async () => {
            const filePath = getFixturePath("undef.js");
            const exit = await cli.execute(`--global baz --global bat:true --no-ignore ${filePath}`);

            assert.isTrue(log.info.notCalled);
            assert.strictEqual(exit, 0);
        });
    });

    describe("when given an parser name", () => {
        it("should exit with a fatal error if parser is invalid", async () => {
            const filePath = getFixturePath("passing.js");

            await stdAssert.rejects(async () => await cli.execute(`--no-ignore --parser test111 ${filePath}`), "Cannot find module 'test111'");
        });

        it("should exit with no error if parser is valid", async () => {
            const filePath = getFixturePath("passing.js");
            const exit = await cli.execute(`--no-ignore --parser espree ${filePath}`);

            assert.strictEqual(exit, 0);
        });
    });

    describe("when given parser options", () => {
        it("should exit with error if parser options are invalid", async () => {
            const filePath = getFixturePath("passing.js");
            const exit = await cli.execute(`--no-ignore --parser-options test111 ${filePath}`);

            assert.strictEqual(exit, 2);
        });

        it("should exit with no error if parser is valid", async () => {
            const filePath = getFixturePath("passing.js");
            const exit = await cli.execute(`--no-ignore --parser-options=ecmaVersion:6 ${filePath}`);

            assert.strictEqual(exit, 0);
        });

        it("should exit with an error on ecmaVersion 7 feature in ecmaVersion 6", async () => {
            const filePath = getFixturePath("passing-es7.js");
            const exit = await cli.execute(`--no-ignore --parser-options=ecmaVersion:6 ${filePath}`);

            assert.strictEqual(exit, 1);
        });

        it("should exit with no error on ecmaVersion 7 feature in ecmaVersion 7", async () => {
            const filePath = getFixturePath("passing-es7.js");
            const exit = await cli.execute(`--no-ignore --parser-options=ecmaVersion:7 ${filePath}`);

            assert.strictEqual(exit, 0);
        });

        it("should exit with no error on ecmaVersion 7 feature with config ecmaVersion 6 and command line ecmaVersion 7", async () => {
            const configPath = getFixturePath("configurations", "es6.json");
            const filePath = getFixturePath("passing-es7.js");
            const exit = await cli.execute(`--no-ignore --config ${configPath} --parser-options=ecmaVersion:7 ${filePath}`);

            assert.strictEqual(exit, 0);
        });
    });

    describe("when given the max-warnings flag", () => {
        it("should not change exit code if warning count under threshold", async () => {
            const filePath = getFixturePath("max-warnings");
            const exitCode = await cli.execute(`--no-ignore --max-warnings 10 ${filePath}`);

            assert.strictEqual(exitCode, 0);
        });

        it("should not change exit code if warning count equals threshold", async () => {
            const filePath = getFixturePath("max-warnings");
            const exitCode = await cli.execute(`--no-ignore --max-warnings 6 ${filePath}`);

            assert.strictEqual(exitCode, 0);
        });

        it("should not change exit code if flag is not specified and there are warnings", async () => {
            const filePath = getFixturePath("max-warnings");
            const exitCode = await cli.execute(filePath);

            assert.strictEqual(exitCode, 0);
        });
    });

    describe("when given the exit-on-fatal-error flag", () => {
        it("should not change exit code if no fatal errors are reported", async () => {
            const filePath = getFixturePath("exit-on-fatal-error", "no-fatal-error.js");
            const exitCode = await cli.execute(`--no-ignore --exit-on-fatal-error ${filePath}`);

            assert.strictEqual(exitCode, 0);
        });

        it("should exit with exit code 2 if fatal error is found", async () => {
            const filePath = getFixturePath("exit-on-fatal-error", "fatal-error.js");
            const exitCode = await cli.execute(`--no-ignore --exit-on-fatal-error ${filePath}`);

            assert.strictEqual(exitCode, 2);
        });

        it("should exit with exit code 2 if fatal error is found in any file", async () => {
            const filePath = getFixturePath("exit-on-fatal-error");
            const exitCode = await cli.execute(`--no-ignore --exit-on-fatal-error ${filePath}`);

            assert.strictEqual(exitCode, 2);
        });


    });

    describe("when passed --no-inline-config", () => {
        let localCLI;

        afterEach(() => {
            sinon.verifyAndRestore();
        });

        it("should pass allowInlineConfig:false to ESLint when --no-inline-config is used", async () => {

            // create a fake ESLint class to test with
            const fakeEc0lint = sinon.mock().withExactArgs(sinon.match({ allowInlineConfig: false }));

            Object.defineProperties(fakeEc0lint.prototype, Object.getOwnPropertyDescriptors(Ec0lint.prototype));
            sinon.stub(fakeEc0lint.prototype, "lintFiles").returns([{
                filePath: "./foo.js",
                output: "bar",
                messages: [
                    {
                        severity: 2,
                        message: "Fake message"
                    }
                ],
                errorCount: 1,
                warningCount: 0
            }]);
            sinon.stub(fakeEc0lint.prototype, "loadFormatter").returns({ format: () => "done" });
            fakeEc0lint.outputFixes = sinon.stub();

            localCLI = proxyquire("../../lib/cli", {
                "./ec0lint": { Ec0lint: fakeEc0lint },
                "./shared/logging": log
            });

            await localCLI.execute("--no-inline-config .");
        });

        it("should not error and allowInlineConfig should be true by default", async () => {

            // create a fake ESLint class to test with
            const fakeEc0lint = sinon.mock().withExactArgs(sinon.match({ allowInlineConfig: true }));

            Object.defineProperties(fakeEc0lint.prototype, Object.getOwnPropertyDescriptors(Ec0lint.prototype));
            sinon.stub(fakeEc0lint.prototype, "lintFiles").returns([]);
            sinon.stub(fakeEc0lint.prototype, "loadFormatter").returns({ format: () => "done" });
            fakeEc0lint.outputFixes = sinon.stub();

            localCLI = proxyquire("../../lib/cli", {
                "./ec0lint": { Ec0lint: fakeEc0lint },
                "./shared/logging": log
            });

            const exitCode = await localCLI.execute(".");

            assert.strictEqual(exitCode, 0);

        });

    });

    describe("when passed --fix", () => {
        let localCLI;

        afterEach(() => {
            sinon.verifyAndRestore();
        });

        it("should pass fix:true to ESLint when executing on files", async () => {

            // create a fake ESLint class to test with
            const fakeEc0lint = sinon.mock().withExactArgs(sinon.match({ fix: true }));

            Object.defineProperties(fakeEc0lint.prototype, Object.getOwnPropertyDescriptors(Ec0lint.prototype));
            sinon.stub(fakeEc0lint.prototype, "lintFiles").returns([]);
            sinon.stub(fakeEc0lint.prototype, "loadFormatter").returns({ format: () => "done" });
            fakeEc0lint.outputFixes = sinon.mock().once();

            localCLI = proxyquire("../../lib/cli", {
                "./ec0lint": { Ec0lint: fakeEc0lint },
                "./shared/logging": log
            });

            const exitCode = await localCLI.execute("--fix .");

            assert.strictEqual(exitCode, 0);

        });


        it("should rewrite files when in fix mode", async () => {

            const report = [{
                filePath: "./foo.js",
                output: "bar",
                messages: [
                    {
                        severity: 2,
                        message: "Fake message"
                    }
                ],
                errorCount: 1,
                warningCount: 0
            }];

            // create a fake ESLint class to test with
            const fakeEc0lint = sinon.mock().withExactArgs(sinon.match({ fix: true }));

            Object.defineProperties(fakeEc0lint.prototype, Object.getOwnPropertyDescriptors(Ec0lint.prototype));
            sinon.stub(fakeEc0lint.prototype, "lintFiles").returns(report);
            sinon.stub(fakeEc0lint.prototype, "loadFormatter").returns({ format: () => "done" });
            fakeEc0lint.outputFixes = sinon.mock().withExactArgs(report);

            localCLI = proxyquire("../../lib/cli", {
                "./ec0lint": { Ec0lint: fakeEc0lint },
                "./shared/logging": log
            });

            const exitCode = await localCLI.execute("--fix .");

            assert.strictEqual(exitCode, 1);

        });

        it("should provide fix predicate and rewrite files when in fix mode and quiet mode", async () => {

            const report = [{
                filePath: "./foo.js",
                output: "bar",
                messages: [
                    {
                        severity: 1,
                        message: "Fake message"
                    }
                ],
                errorCount: 0,
                warningCount: 1
            }];

            // create a fake ESLint class to test with
            const fakeEc0lint = sinon.mock().withExactArgs(sinon.match({ fix: sinon.match.func }));

            Object.defineProperties(fakeEc0lint.prototype, Object.getOwnPropertyDescriptors(Ec0lint.prototype));
            sinon.stub(fakeEc0lint.prototype, "lintFiles").returns(report);
            sinon.stub(fakeEc0lint.prototype, "loadFormatter").returns({ format: () => "done" });
            fakeEc0lint.getErrorResults = sinon.stub().returns([]);
            fakeEc0lint.outputFixes = sinon.mock().withExactArgs(report);

            localCLI = proxyquire("../../lib/cli", {
                "./ec0lint": { Ec0lint: fakeEc0lint },
                "./shared/logging": log
            });

            const exitCode = await localCLI.execute("--fix --quiet .");

            assert.strictEqual(exitCode, 0);

        });

        it("should not call ESLint and return 2 when executing on text", async () => {

            // create a fake ESLint class to test with
            const fakeEc0lint = sinon.mock().never();

            localCLI = proxyquire("../../lib/cli", {
                "./ec0lint": { Ec0lint: fakeEc0lint },
                "./shared/logging": log
            });

            const exitCode = await localCLI.execute("--fix .", "foo = bar;");

            assert.strictEqual(exitCode, 2);
        });

    });

    describe("when passed --fix-dry-run", () => {
        let localCLI;

        afterEach(() => {
            sinon.verifyAndRestore();
        });

        it("should pass fix:true to ESLint when executing on files", async () => {

            // create a fake ESLint class to test with
            const fakeEc0lint = sinon.mock().withExactArgs(sinon.match({ fix: true }));

            Object.defineProperties(fakeEc0lint.prototype, Object.getOwnPropertyDescriptors(Ec0lint.prototype));
            sinon.stub(fakeEc0lint.prototype, "lintFiles").returns([]);
            sinon.stub(fakeEc0lint.prototype, "loadFormatter").returns({ format: () => "done" });
            fakeEc0lint.outputFixes = sinon.mock().never();

            localCLI = proxyquire("../../lib/cli", {
                "./ec0lint": { Ec0lint: fakeEc0lint },
                "./shared/logging": log
            });

            const exitCode = await localCLI.execute("--fix-dry-run .");

            assert.strictEqual(exitCode, 0);

        });

        it("should pass fixTypes to ec0lint when --fix-type is passed", async () => {

            const expectedESLintOptions = {
                fix: true,
                fixTypes: ["suggestion"]
            };

            // create a fake ESLint class to test with
            const fakeEc0lint = sinon.mock().withExactArgs(sinon.match(expectedESLintOptions));

            Object.defineProperties(fakeEc0lint.prototype, Object.getOwnPropertyDescriptors(Ec0lint.prototype));
            sinon.stub(fakeEc0lint.prototype, "lintFiles").returns([]);
            sinon.stub(fakeEc0lint.prototype, "loadFormatter").returns({ format: () => "done" });
            fakeEc0lint.outputFixes = sinon.stub();

            localCLI = proxyquire("../../lib/cli", {
                "./ec0lint": { Ec0lint: fakeEc0lint },
                "./shared/logging": log
            });

            const exitCode = await localCLI.execute("--fix-dry-run --fix-type suggestion .");

            assert.strictEqual(exitCode, 0);
        });

        it("should not rewrite files when in fix-dry-run mode", async () => {

            const report = [{
                filePath: "./foo.js",
                output: "bar",
                messages: [
                    {
                        severity: 2,
                        message: "Fake message"
                    }
                ],
                errorCount: 1,
                warningCount: 0
            }];

            // create a fake ESLint class to test with
            const fakeEc0lint = sinon.mock().withExactArgs(sinon.match({ fix: true }));

            Object.defineProperties(fakeEc0lint.prototype, Object.getOwnPropertyDescriptors(Ec0lint.prototype));
            sinon.stub(fakeEc0lint.prototype, "lintFiles").returns(report);
            sinon.stub(fakeEc0lint.prototype, "loadFormatter").returns({ format: () => "done" });
            fakeEc0lint.outputFixes = sinon.mock().never();

            localCLI = proxyquire("../../lib/cli", {
                "./ec0lint": { Ec0lint: fakeEc0lint },
                "./shared/logging": log
            });

            const exitCode = await localCLI.execute("--fix-dry-run .");

            assert.strictEqual(exitCode, 1);

        });

        it("should provide fix predicate when in fix-dry-run mode and quiet mode", async () => {

            const report = [{
                filePath: "./foo.js",
                output: "bar",
                messages: [
                    {
                        severity: 1,
                        message: "Fake message"
                    }
                ],
                errorCount: 0,
                warningCount: 1
            }];

            // create a fake ESLint class to test with
            const fakeEc0lint = sinon.mock().withExactArgs(sinon.match({ fix: sinon.match.func }));

            Object.defineProperties(fakeEc0lint.prototype, Object.getOwnPropertyDescriptors(Ec0lint.prototype));
            sinon.stub(fakeEc0lint.prototype, "lintFiles").returns(report);
            sinon.stub(fakeEc0lint.prototype, "loadFormatter").returns({ format: () => "done" });
            fakeEc0lint.getErrorResults = sinon.stub().returns([]);
            fakeEc0lint.outputFixes = sinon.mock().never();

            localCLI = proxyquire("../../lib/cli", {
                "./ec0lint": { Ec0lint: fakeEc0lint },
                "./shared/logging": log
            });

            const exitCode = await localCLI.execute("--fix-dry-run --quiet .");

            assert.strictEqual(exitCode, 0);

        });

        it("should allow executing on text", async () => {

            const report = [{
                filePath: "./foo.js",
                output: "bar",
                messages: [
                    {
                        severity: 2,
                        message: "Fake message"
                    }
                ],
                errorCount: 1,
                warningCount: 0
            }];

            // create a fake ESLint class to test with
            const fakeEc0lint = sinon.mock().withExactArgs(sinon.match({ fix: true }));

            Object.defineProperties(fakeEc0lint.prototype, Object.getOwnPropertyDescriptors(Ec0lint.prototype));
            sinon.stub(fakeEc0lint.prototype, "lintText").returns(report);
            sinon.stub(fakeEc0lint.prototype, "loadFormatter").returns({ format: () => "done" });
            fakeEc0lint.outputFixes = sinon.mock().never();

            localCLI = proxyquire("../../lib/cli", {
                "./ec0lint": { Ec0lint: fakeEc0lint },
                "./shared/logging": log
            });

            const exitCode = await localCLI.execute("--fix-dry-run .", "foo = bar;");

            assert.strictEqual(exitCode, 1);
        });

        it("should not call ESLint and return 2 when used with --fix", async () => {

            // create a fake ESLint class to test with
            const fakeEc0lint = sinon.mock().never();

            localCLI = proxyquire("../../lib/cli", {
                "./ec0lint": { Ec0lint: fakeEc0lint },
                "./shared/logging": log
            });

            const exitCode = await localCLI.execute("--fix --fix-dry-run .", "foo = bar;");

            assert.strictEqual(exitCode, 2);
        });
    });

    describe("when passing --print-config", () => {
        it("should print out the configuration", async () => {
            const filePath = getFixturePath("xxxx");

            const exitCode = await cli.execute(`--print-config ${filePath}`);

            assert.isTrue(log.info.calledOnce);
            assert.strictEqual(exitCode, 0);
        });

        it("should error if any positional file arguments are passed", async () => {
            const filePath1 = getFixturePath("files", "bar.js");
            const filePath2 = getFixturePath("files", "foo.js");

            const exitCode = await cli.execute(`--print-config ${filePath1} ${filePath2}`);

            assert.isTrue(log.info.notCalled);
            assert.isTrue(log.error.calledOnce);
            assert.strictEqual(exitCode, 2);
        });

        it("should error out when executing on text", async () => {
            const exitCode = await cli.execute("--print-config=myFile.js", "foo = bar;");

            assert.isTrue(log.info.notCalled);
            assert.isTrue(log.error.calledOnce);
            assert.strictEqual(exitCode, 2);
        });
    });

});
