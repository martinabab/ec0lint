/**
 * @fileoverview Tests for jUnit Formatter.
 * @author Jamund Ferguson
 */

"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const assert = require("chai").assert,
    formatter = require("../../../../lib/cli-engine/formatters/junit"),
    process = require("process");

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

const suppliedFilePath = (process.platform === "win32") ? "C:\\path\\to\\foo.js" : "/path/to/foo.js";
const expectedClassName = (process.platform === "win32") ? "C:\\path\\to\\foo" : "/path/to/foo";

describe("formatter:junit", () => {
    describe("when there are no problems", () => {
        const code = [];

        it("should not complain about anything", () => {
            const result = formatter(code);

            assert.strictEqual(result.replace(/\n/gu, ""), "<?xml version=\"1.0\" encoding=\"utf-8\"?><testsuites></testsuites>");
        });
    });

    describe("when passed a single message", () => {
        const code = [{
            filePath: suppliedFilePath,
            messages: [{
                message: "Unexpected foo.",
                severity: 2,
                line: 5,
                column: 10,
                ruleId: "foo"
            }]
        }];

        it("should return a single <testcase> with a message and the line and col number in the body (error)", () => {
            const result = formatter(code);

            assert.strictEqual(result.replace(/\n/gu, ""), `<?xml version="1.0" encoding="utf-8"?><testsuites><testsuite package="org.ec0lint" time="0" tests="1" errors="1" name="${suppliedFilePath}"><testcase time="0" name="org.ec0lint.foo" classname="${expectedClassName}"><failure message="Unexpected foo."><![CDATA[line 5, col 10, Error - Unexpected foo. (foo)]]></failure></testcase></testsuite></testsuites>`);
        });

        it("should return a single <testcase> with a message and the line and col number in the body (warning)", () => {
            code[0].messages[0].severity = 1;
            const result = formatter(code);

            assert.strictEqual(result.replace(/\n/gu, ""), `<?xml version="1.0" encoding="utf-8"?><testsuites><testsuite package="org.ec0lint" time="0" tests="1" errors="1" name="${suppliedFilePath}"><testcase time="0" name="org.ec0lint.foo" classname="${expectedClassName}"><failure message="Unexpected foo."><![CDATA[line 5, col 10, Warning - Unexpected foo. (foo)]]></failure></testcase></testsuite></testsuites>`);
        });
    });

    describe("when passed a fatal error message", () => {
        const code = [{
            filePath: suppliedFilePath,
            messages: [{
                fatal: true,
                message: "Unexpected foo.",
                line: 5,
                column: 10,
                ruleId: "foo"
            }]
        }];

        it("should return a single <testcase> and an <error>", () => {
            const result = formatter(code);

            assert.strictEqual(result.replace(/\n/gu, ""), `<?xml version="1.0" encoding="utf-8"?><testsuites><testsuite package="org.ec0lint" time="0" tests="1" errors="1" name="${suppliedFilePath}"><testcase time="0" name="org.ec0lint.foo" classname="${expectedClassName}"><error message="Unexpected foo."><![CDATA[line 5, col 10, Error - Unexpected foo. (foo)]]></error></testcase></testsuite></testsuites>`);
        });
    });

    describe("when passed a fatal error message with no line or column", () => {
        const code = [{
            filePath: suppliedFilePath,
            messages: [{
                fatal: true,
                message: "Unexpected foo."
            }]
        }];

        it("should return a single <testcase> and an <error>", () => {
            const result = formatter(code);

            assert.strictEqual(result.replace(/\n/gu, ""), `<?xml version="1.0" encoding="utf-8"?><testsuites><testsuite package="org.ec0lint" time="0" tests="1" errors="1" name="${suppliedFilePath}"><testcase time="0" name="org.ec0lint.unknown" classname="${expectedClassName}"><error message="Unexpected foo."><![CDATA[line 0, col 0, Error - Unexpected foo.]]></error></testcase></testsuite></testsuites>`);
        });
    });

    describe("when passed a fatal error message with no line, column, or message text", () => {
        const code = [{
            filePath: suppliedFilePath,
            messages: [{
                fatal: true
            }]
        }];

        it("should return a single <testcase> and an <error>", () => {
            const result = formatter(code);

            assert.strictEqual(result.replace(/\n/gu, ""), `<?xml version="1.0" encoding="utf-8"?><testsuites><testsuite package="org.ec0lint" time="0" tests="1" errors="1" name="${suppliedFilePath}"><testcase time="0" name="org.ec0lint.unknown" classname="${expectedClassName}"><error message=""><![CDATA[line 0, col 0, Error - ]]></error></testcase></testsuite></testsuites>`);
        });
    });

    describe("when passed multiple messages", () => {
        const code = [{
            filePath: suppliedFilePath,
            messages: [{
                message: "Unexpected foo.",
                severity: 2,
                line: 5,
                column: 10,
                ruleId: "foo"
            }, {
                message: "Unexpected bar.",
                severity: 1,
                line: 6,
                column: 11,
                ruleId: "bar"
            }]
        }];

        it("should return a multiple <testcase>'s", () => {
            const result = formatter(code);

            assert.strictEqual(result.replace(/\n/gu, ""), `<?xml version="1.0" encoding="utf-8"?><testsuites><testsuite package="org.ec0lint" time="0" tests="2" errors="2" name="${suppliedFilePath}"><testcase time="0" name="org.ec0lint.foo" classname="${expectedClassName}"><failure message="Unexpected foo."><![CDATA[line 5, col 10, Error - Unexpected foo. (foo)]]></failure></testcase><testcase time="0" name="org.ec0lint.bar" classname="${expectedClassName}"><failure message="Unexpected bar."><![CDATA[line 6, col 11, Warning - Unexpected bar. (bar)]]></failure></testcase></testsuite></testsuites>`);
        });
    });

    describe("when passed special characters", () => {
        const code = [{
            filePath: suppliedFilePath,
            messages: [{
                message: "Unexpected <foo></foo>\b\t\n\f\r牛逼.",
                severity: 1,
                line: 5,
                column: 10,
                ruleId: "foo"
            }]
        }];

        it("should make them go away", () => {
            const result = formatter(code);

            assert.strictEqual(result.replace(/\n/gu, ""), `<?xml version="1.0" encoding="utf-8"?><testsuites><testsuite package="org.ec0lint" time="0" tests="1" errors="1" name="${suppliedFilePath}"><testcase time="0" name="org.ec0lint.foo" classname="${expectedClassName}"><failure message="Unexpected &lt;foo&gt;&lt;/foo&gt;&#8;&#9;&#10;&#12;&#13;&#29275;&#36924;."><![CDATA[line 5, col 10, Warning - Unexpected &lt;foo&gt;&lt;/foo&gt;&#8;&#9;&#10;&#12;&#13;&#29275;&#36924;. (foo)]]></failure></testcase></testsuite></testsuites>`);
        });
    });

    describe("when passed multiple files with 1 message each", () => {
        const code = [{
            filePath: suppliedFilePath,
            messages: [{
                message: "Unexpected foo.",
                severity: 1,
                line: 5,
                column: 10,
                ruleId: "foo"
            }]
        }, {
            filePath: "bar.js",
            messages: [{
                message: "Unexpected bar.",
                severity: 2,
                line: 6,
                column: 11,
                ruleId: "bar"
            }]
        }];

        it("should return 2 <testsuite>'s", () => {
            const result = formatter(code);

            assert.strictEqual(result.replace(/\n/gu, ""), `<?xml version="1.0" encoding="utf-8"?><testsuites><testsuite package="org.ec0lint" time="0" tests="1" errors="1" name="${suppliedFilePath}"><testcase time="0" name="org.ec0lint.foo" classname="${expectedClassName}"><failure message="Unexpected foo."><![CDATA[line 5, col 10, Warning - Unexpected foo. (foo)]]></failure></testcase></testsuite><testsuite package="org.ec0lint" time="0" tests="1" errors="1" name="bar.js"><testcase time="0" name="org.ec0lint.bar" classname="bar"><failure message="Unexpected bar."><![CDATA[line 6, col 11, Error - Unexpected bar. (bar)]]></failure></testcase></testsuite></testsuites>`);
        });
    });

    describe("when passed multiple files should print even if no errors", () => {
        const code = [{
            filePath: suppliedFilePath,
            messages: [{
                message: "Unexpected foo.",
                severity: 1,
                line: 5,
                column: 10,
                ruleId: "foo"
            }]
        }, {
            filePath: "bar.js",
            messages: []
        }];

        it("should return 2 <testsuite>", () => {
            const result = formatter(code);

            assert.strictEqual(result.replace(/\n/gu, ""), `<?xml version="1.0" encoding="utf-8"?><testsuites><testsuite package="org.ec0lint" time="0" tests="1" errors="1" name="${suppliedFilePath}"><testcase time="0" name="org.ec0lint.foo" classname="${expectedClassName}"><failure message="Unexpected foo."><![CDATA[line 5, col 10, Warning - Unexpected foo. (foo)]]></failure></testcase></testsuite><testsuite package="org.ec0lint" time="0" tests="1" errors="0" name="bar.js"><testcase time="0" name="bar.js" classname="bar" /></testsuite></testsuites>`);
        });
    });

    describe("when passed a file with no errors", () => {
        const code = [{
            filePath: suppliedFilePath,
            messages: []
        }];

        it("should print a passing <testcase>", () => {
            const result = formatter(code);

            assert.strictEqual(result.replace(/\n/gu, ""), `<?xml version="1.0" encoding="utf-8"?><testsuites><testsuite package="org.ec0lint" time="0" tests="1" errors="0" name="${suppliedFilePath}"><testcase time="0" name="${suppliedFilePath}" classname="${expectedClassName}" /></testsuite></testsuites>`);
        });
    });
});
