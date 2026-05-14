import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { generateClientId, type ClientId } from "../src/ids/ClientId";
import { generateOperationId, type OperationId } from "../src/ids/OperationId";
import { compareOperationId } from "../src/ids/compare";

describe("ids", () => {
    describe("ClientId", () => {
        test("generateClientId should return a valid UUID string", () => {
            const id = generateClientId();
            assert.strictEqual(typeof id, "string");
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            assert.match(id, uuidRegex, "Should match UUID v4 format");
        });

        test("generateClientId should generate unique IDs", () => {
            const id1 = generateClientId();
            const id2 = generateClientId();
            assert.notStrictEqual(id1, id2, "Generated IDs should be unique");
        });

        test("generateClientId should generate multiple unique IDs", () => {
            const ids = new Set<ClientId>();
            for (let i = 0; i < 100; i++) {
                const id = generateClientId();
                assert.strictEqual(ids.has(id), false, `ID ${id} should be unique`);
                ids.add(id);
            }
            assert.strictEqual(ids.size, 100, "Should generate 100 unique IDs");
        });
    });

    describe("OperationId", () => {
        test("generateOperationId should return a tuple of ClientId and number", () => {
            const clientId = generateClientId();
            const counter = 42;
            const operationId = generateOperationId(clientId, counter);

            assert.strictEqual(Array.isArray(operationId), true, "Should return an array");
            assert.strictEqual(operationId.length, 2, "Should have exactly 2 elements");
            assert.strictEqual(operationId[0], clientId, "First element should be the clientId");
            assert.strictEqual(operationId[1], counter, "Second element should be the counter");
        });

        test("generateOperationId should work with different counter values", () => {
            const clientId = generateClientId();
            const counters = [0, 1, 100, 1000, Number.MAX_SAFE_INTEGER];

            for (const counter of counters) {
                const operationId = generateOperationId(clientId, counter);
                assert.strictEqual(operationId[0], clientId);
                assert.strictEqual(operationId[1], counter);
            }
        });

        test("generateOperationId should work with different clientIds", () => {
            const clientIds = [generateClientId(), generateClientId(), generateClientId()];
            const counter = 5;

            for (const clientId of clientIds) {
                const operationId = generateOperationId(clientId, counter);
                assert.strictEqual(operationId[0], clientId);
                assert.strictEqual(operationId[1], counter);
            }
        });

        test("OperationId type should be a tuple", () => {
            const clientId = generateClientId();
            const operationId: OperationId = [clientId, 10];
            
            assert.strictEqual(operationId[0], clientId);
            assert.strictEqual(operationId[1], 10);
        });
    });

    describe("compare", () => {
        test("compareOperationId returns 1 when first counter is smaller", () => {
            const clientId1 = generateClientId();
            const clientId2 = generateClientId();
            const op1: OperationId = [clientId1, 5];
            const op2: OperationId = [clientId2, 10];

            assert.strictEqual(compareOperationId(op1, op2), 1);
        });

        test("compareOperationId returns 0 when first counter is larger", () => {
            const clientId1 = generateClientId();
            const clientId2 = generateClientId();
            const op1: OperationId = [clientId1, 10];
            const op2: OperationId = [clientId2, 5];

            assert.strictEqual(compareOperationId(op1, op2), 0);
        });

        test("compareOperationId uses clientId when counters are equal (smaller clientId yields 1)", () => {
            const op1: OperationId = ["a-client-id", 5];
            const op2: OperationId = ["b-client-id", 5];

            assert.strictEqual(compareOperationId(op1, op2), 1);
            assert.strictEqual(compareOperationId(op2, op1), 0);
        });

        test("compareOperationId returns 0 when both ids are identical", () => {
            const clientId = generateClientId();
            const op1: OperationId = [clientId, 5];
            const op2: OperationId = [clientId, 5];

            assert.strictEqual(compareOperationId(op1, op2), 0);
        });

        test("compareOperationId returns 1 when first counter is 0 and second is 1", () => {
            const clientId1 = generateClientId();
            const clientId2 = generateClientId();
            const op1: OperationId = [clientId1, 0];
            const op2: OperationId = [clientId2, 1];

            assert.strictEqual(compareOperationId(op1, op2), 1);
        });

        test("compareOperationId returns 0 when first counter is larger at large magnitudes", () => {
            const clientId1 = generateClientId();
            const clientId2 = generateClientId();
            const op1: OperationId = [clientId1, 1000];
            const op2: OperationId = [clientId2, 999];

            assert.strictEqual(compareOperationId(op1, op2), 0);
        });
    });
});

