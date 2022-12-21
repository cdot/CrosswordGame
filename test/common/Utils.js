/*Copyright (C) 2019-2022 The Xanado Project https://github.com/cdot/Xanado
  License MIT. See README.md at the root of this distribution for full copyright
  and license information. Author Crawford Currie http://c-dot.co.uk*/
/* eslint-env node, mocha */

/* global Platform */

import { assert } from "chai";
import { ServerPlatform } from "../../src/server/ServerPlatform.js";
global.Platform = ServerPlatform;

import { Utils } from "../../src/common/Utils.js";

describe("common/Utils", () => {

  it("genKey", () => {
    const miss = [ Utils.genKey() ];
    for (let i = 1; i < 1000; i++)
      miss.push(Utils.genKey(miss));
    assert.equal(miss.length, 1000);
  });

  it("formatTimeInterval", () => {
    assert.equal(Utils.formatTimeInterval(0), "00:00");
    assert.equal(Utils.formatTimeInterval(1 * 60 + 1), "01:01");
    assert.equal(Utils.formatTimeInterval(10 * 60 + 1), "10:01");
    assert.equal(Utils.formatTimeInterval(60 * 60 + 1), "01:00:01");
    assert.equal(Utils.formatTimeInterval(24 * 60 * 60 + 1), "1:00:00:01");
    assert.equal(Utils.formatTimeInterval(2 * 24 * 60 * 60 + 1), "2:00:00:01");
    assert.equal(Utils.formatTimeInterval(365 * 24 * 60 * 60 + 1), "365:00:00:01");
    assert.equal(Utils.formatTimeInterval(-(60 * 60 + 1)), "-01:00:01");
  });

  it("andList", () => {
    return Platform.i18n().load("en").then(() => {
      assert.equal(Utils.andList([]), "");
      assert.equal(Utils.andList(["A"]), "A");
      assert.equal(Utils.andList(["A", "B"]), "A and B");
      assert.equal(Utils.andList(["A", "B", "C"]), "A, B and C");
    });
  });

  it("stringify", () => {
    class Thing {
      stringify() { return "XYZZY"; }
    }

    let thing = new Thing();

    assert.equal(Utils.stringify(thing), "XYZZY");
    assert.equal(Utils.stringify("XYZZY"), '"XYZZY"');
    assert.equal(Utils.stringify(69), '69');
    assert.equal(Utils.stringify(true), 'true');
    assert.equal(Utils.stringify(null), 'null');
    assert.equal(Utils.stringify(), '?');
    const d = new Date(100000);
    assert.equal(Utils.stringify(d), d.toISOString());
  });

  it("parseURLArguments", () => {
    const a = Utils.parseURLArguments("http://a.b/c?a=1&b=2;c=3");
    assert.deepEqual(a, { _URL: "http://a.b/c", a: "1", b: "2", c : "3" });

    const b = Utils.parseURLArguments("https://q:9?x&a=&b=c=3;c=?");
    assert.deepEqual(b, { _URL: "https://q:9", x: true, a: "", b: "c=3", c: "?" });

    const c = Utils.parseURLArguments("ftp://q?a=a%20b&b");
    assert.deepEqual(c, { _URL: "ftp://q", a: "a b", b: true });
  });

  it("makeURL", () => {
    const args = { _URL: "x", a: "b", b: true, c: "a b" };
    assert.deepEqual(Utils.parseURLArguments(Utils.makeURL(args)), args);
  });

  it("Uint8ArrayToBase64", () => {
    let ab = new Uint8Array(256);
    for (let i = 0; i < 256; i++)
      ab[i] = i;
    let ps = Utils.Uint8ArrayToBase64(ab);
    assert.equal(ps, "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKissLS4vMDEyMzQ1Njc4OTo7PD0+P0BBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWltcXV5fYGFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6e3x9fn+AgYKDhIWGh4iJiouMjY6PkJGSk5SVlpeYmZqbnJ2en6ChoqOkpaanqKmqq6ytrq+wsbKztLW2t7i5uru8vb6/wMHCw8TFxsfIycrLzM3Oz9DR0tPU1dbX2Nna29zd3t/g4eLj5OXm5+jp6uvs7e7v8PHy8/T19vf4+fr7/P3+/w==");
    let ba = new Uint8Array(Utils.Base64ToUint8Array(ps));
    assert.deepEqual(ba, ab);
  });
});