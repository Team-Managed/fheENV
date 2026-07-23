import { expect } from "chai";
import { parseEnvNode, serializeEnvNode } from "./env-parser";

describe("Environment Parser", function () {
  describe("parseEnvNode", function () {
    it("should parse simple key=value pairs", function () {
      const raw = "KEY1=value1\nKEY2=value2";
      const parsed = parseEnvNode(raw);

      expect(parsed).to.deep.equal({
        KEY1: "value1",
        KEY2: "value2",
      });
    });

    it("should ignore empty lines", function () {
      const raw = "KEY1=value1\n\nKEY2=value2\n\n";
      const parsed = parseEnvNode(raw);

      expect(parsed).to.deep.equal({
        KEY1: "value1",
        KEY2: "value2",
      });
    });

    it("should ignore comment lines", function () {
      const raw = "# This is a comment\nKEY1=value1\n# Another comment\nKEY2=value2";
      const parsed = parseEnvNode(raw);

      expect(parsed).to.deep.equal({
        KEY1: "value1",
        KEY2: "value2",
      });
    });

    it("should handle inline comments (not standard but robust)", function () {
      const raw = "KEY1=value1 # comment\nKEY2=value2";
      const parsed = parseEnvNode(raw);

      // Current implementation doesn't strip inline comments
      expect(parsed.KEY1).to.equal("value1 # comment");
      expect(parsed.KEY2).to.equal("value2");
    });

    it("should handle quoted values", function () {
      const raw = "KEY1=\"quoted value\"\nKEY2='single quoted'";
      const parsed = parseEnvNode(raw);

      expect(parsed).to.deep.equal({
        KEY1: "quoted value",
        KEY2: "single quoted",
      });
    });

    it("should handle values with spaces", function () {
      const raw = "KEY1=value with spaces\nKEY2=another spaced value";
      const parsed = parseEnvNode(raw);

      expect(parsed).to.deep.equal({
        KEY1: "value with spaces",
        KEY2: "another spaced value",
      });
    });

    it("should handle empty values", function () {
      const raw = "KEY1=\nKEY2=";
      const parsed = parseEnvNode(raw);

      expect(parsed).to.deep.equal({
        KEY1: "",
        KEY2: "",
      });
    });

    it("should handle special characters in values", function () {
      const raw = "KEY1=!@#$%^&*()\nKEY2=<>?/\\|";
      const parsed = parseEnvNode(raw);

      expect(parsed).to.deep.equal({
        KEY1: "!@#$%^&*()",
        KEY2: "<>?/\\|",
      });
    });

    it("should handle multiline values (as separate lines)", function () {
      const raw = "KEY1=line1\nKEY2=line2\nKEY3=line3";
      const parsed = parseEnvNode(raw);

      expect(parsed).to.deep.equal({
        KEY1: "line1",
        KEY2: "line2",
        KEY3: "line3",
      });
    });

    it("should trim whitespace around keys and values", function () {
      const raw = "  KEY1  =  value1  \n  KEY2=value2";
      const parsed = parseEnvNode(raw);

      expect(parsed).to.deep.equal({
        KEY1: "value1",
        KEY2: "value2",
      });
    });

    it("should handle URLs", function () {
      const raw =
        "DATABASE_URL=postgres://user:pass@localhost:5432/db\nAPI_URL=https://api.example.com/v1";
      const parsed = parseEnvNode(raw);

      expect(parsed).to.deep.equal({
        DATABASE_URL: "postgres://user:pass@localhost:5432/db",
        API_URL: "https://api.example.com/v1",
      });
    });

    it("should handle JSON values", function () {
      const raw = 'CONFIG={"key":"value"}\nARRAY=[1,2,3]';
      const parsed = parseEnvNode(raw);

      expect(parsed).to.deep.equal({
        CONFIG: '{"key":"value"}',
        ARRAY: "[1,2,3]",
      });
    });

    it("should handle base64 values", function () {
      const raw = "KEY=SGVsbG8gV29ybGQ=";
      const parsed = parseEnvNode(raw);

      expect(parsed).to.deep.equal({
        KEY: "SGVsbG8gV29ybGQ=",
      });
    });

    it("should skip lines without equals sign", function () {
      const raw = "INVALID_LINE\nKEY1=value1\nANOTHER_INVALID\nKEY2=value2";
      const parsed = parseEnvNode(raw);

      expect(parsed).to.deep.equal({
        KEY1: "value1",
        KEY2: "value2",
      });
    });

    it("should handle equals sign in value", function () {
      const raw = "KEY1=value=with=equals";
      const parsed = parseEnvNode(raw);

      expect(parsed).to.deep.equal({
        KEY1: "value=with=equals",
      });
    });

    it("should handle empty input", function () {
      const parsed = parseEnvNode("");
      expect(parsed).to.deep.equal({});
    });

    it("should handle only comments and empty lines", function () {
      const raw = "# comment\n\n# another comment\n\n";
      const parsed = parseEnvNode(raw);
      expect(parsed).to.deep.equal({});
    });

    it("should handle realistic .env file", function () {
      const raw = `# Database Configuration
DATABASE_URL=postgres://user:password@localhost:5432/mydb
DB_POOL_SIZE=20

# API Configuration
API_KEY=sk-1234567890abcdef
API_SECRET=secret123
API_TIMEOUT=30000

# Feature Flags
FEATURE_NEW_UI=true
FEATURE_BETA=false

# URLs
FRONTEND_URL=https://example.com
BACKEND_URL=https://api.example.com

# Complex Values
PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\\nMIIEpAIBAAKCAQEA..."
JWT_SECRET=your-super-secret-jwt-key-here`;

      const parsed = parseEnvNode(raw);

      expect(parsed.DATABASE_URL).to.equal("postgres://user:password@localhost:5432/mydb");
      expect(parsed.DB_POOL_SIZE).to.equal("20");
      expect(parsed.API_KEY).to.equal("sk-1234567890abcdef");
      expect(parsed.API_SECRET).to.equal("secret123");
      expect(parsed.API_TIMEOUT).to.equal("30000");
      expect(parsed.FEATURE_NEW_UI).to.equal("true");
      expect(parsed.FEATURE_BETA).to.equal("false");
      expect(parsed.FRONTEND_URL).to.equal("https://example.com");
      expect(parsed.BACKEND_URL).to.equal("https://api.example.com");
      expect(parsed.PRIVATE_KEY).to.equal("-----BEGIN RSA PRIVATE KEY-----\\nMIIEpAIBAAKCAQEA...");
      expect(parsed.JWT_SECRET).to.equal("your-super-secret-jwt-key-here");
    });
  });

  describe("serializeEnvNode", function () {
    it("should serialize simple object to env format", function () {
      const vars = {
        KEY1: "value1",
        KEY2: "value2",
      };
      const serialized = serializeEnvNode(vars);

      expect(serialized).to.equal("KEY1=value1\nKEY2=value2\n");
    });

    it("should handle empty object", function () {
      const serialized = serializeEnvNode({});
      expect(serialized).to.equal("\n");
    });

    it("should handle special characters in values", function () {
      const vars = {
        KEY1: "value with spaces",
        KEY2: "!@#$%^&*()",
      };
      const serialized = serializeEnvNode(vars);

      expect(serialized).to.equal("KEY1=value with spaces\nKEY2=!@#$%^&*()\n");
    });

    it("should handle URLs", function () {
      const vars = {
        DATABASE_URL: "postgres://user:pass@localhost:5432/db",
        API_URL: "https://api.example.com/v1",
      };
      const serialized = serializeEnvNode(vars);

      expect(serialized).to.contain("DATABASE_URL=postgres://user:pass@localhost:5432/db");
      expect(serialized).to.contain("API_URL=https://api.example.com/v1");
    });

    it("should preserve order of insertion", function () {
      const vars: Record<string, string> = {};
      vars.KEY1 = "value1";
      vars.KEY2 = "value2";
      vars.KEY3 = "value3";

      const serialized = serializeEnvNode(vars);
      const lines = serialized.split("\n").filter((l: string) => l);

      expect(lines[0]).to.equal("KEY1=value1");
      expect(lines[1]).to.equal("KEY2=value2");
      expect(lines[2]).to.equal("KEY3=value3");
    });
  });

  describe("round-trip parsing and serialization", function () {
    it("should preserve data through parse -> serialize -> parse", function () {
      const original = `KEY1=value1
KEY2=value2
KEY3=value with spaces`;

      const parsed = parseEnvNode(original);
      const serialized = serializeEnvNode(parsed);
      const reparsed = parseEnvNode(serialized);

      expect(reparsed).to.deep.equal(parsed);
    });

    it("should handle realistic .env file round-trip", function () {
      const original = `DATABASE_URL=postgres://user:pass@localhost:5432/db
API_KEY=sk-1234567890
FEATURE_ENABLED=true
TIMEOUT=30000`;

      const parsed = parseEnvNode(original);
      const serialized = serializeEnvNode(parsed);
      const reparsed = parseEnvNode(serialized);

      expect(reparsed).to.deep.equal(parsed);
    });

    it("should handle quoted values in round-trip", function () {
      const original = "KEY1=\"quoted value\"\nKEY2='single quoted'";

      const parsed = parseEnvNode(original);
      const serialized = serializeEnvNode(parsed);
      const reparsed = parseEnvNode(serialized);

      expect(reparsed.KEY1).to.equal("quoted value");
      expect(reparsed.KEY2).to.equal("single quoted");
    });
  });

  describe("edge cases and error handling", function () {
    it("should handle very long values", function () {
      const longValue = "a".repeat(10000);
      const raw = `KEY=${longValue}`;
      const parsed = parseEnvNode(raw);

      expect(parsed.KEY).to.equal(longValue);
    });

    it("should handle very long keys", function () {
      const longKey = "A".repeat(100);
      const raw = `${longKey}=value`;
      const parsed = parseEnvNode(raw);

      expect(parsed[longKey]).to.equal("value");
    });

    it("should handle unicode characters", function () {
      const raw = "KEY1=こんにちは\nKEY2=Привет\nKEY3=مرحبا";
      const parsed = parseEnvNode(raw);

      expect(parsed.KEY1).to.equal("こんにちは");
      expect(parsed.KEY2).to.equal("Привет");
      expect(parsed.KEY3).to.equal("مرحبا");
    });

    it("should handle emoji", function () {
      const raw = "KEY1=🔐🔑\nKEY2=🚀🌕";
      const parsed = parseEnvNode(raw);

      expect(parsed.KEY1).to.equal("🔐🔑");
      expect(parsed.KEY2).to.equal("🚀🌕");
    });

    it("should handle newlines in quoted values", function () {
      const raw = 'KEY1="line1\\nline2"';
      const parsed = parseEnvNode(raw);

      expect(parsed.KEY1).to.equal("line1\\nline2");
    });

    it("should handle tabs in values", function () {
      const raw = "KEY1=value\twith\ttabs";
      const parsed = parseEnvNode(raw);

      expect(parsed.KEY1).to.equal("value\twith\ttabs");
    });
  });
});
