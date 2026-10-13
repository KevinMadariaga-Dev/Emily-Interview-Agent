import { describe, expect, it } from "vitest";
import { micError } from "@/features/landing/ui";

const dom = (name: string) =>
  Object.assign(new Error(name === "x" ? "" : `${name} message`), { name });

describe("microphone errors are explained, never technical", () => {
  it("maps every browser failure to a clear message, in the conversation's language", () => {
    expect(micError(dom("NotAllowedError"), "es")).toMatch(/permiso/);
    expect(micError(dom("SecurityError"), "en")).toMatch(/permission/);
    expect(micError(new Error("mic-unavailable"), "es")).toMatch(/Safari o Chrome/);
    expect(
      micError(new TypeError("Cannot read properties of undefined (reading 'getUserMedia')"), "en"),
    ).toMatch(/Safari or Chrome/);
    expect(micError(dom("NotFoundError"), "es")).toMatch(/No encontré ningún micrófono/);
    expect(micError(dom("NotReadableError"), "en")).toMatch(/another app/);
    expect(micError(new Error("Could not start audio source"), "es")).toMatch(/otra app/);
    expect(micError(new Error("no-dictation"), "en")).toMatch(/dictation/); // was never shown before
    expect(
      micError(new Error("Minified React error #441; visit https://react.dev/errors/441"), "es"),
    ).toMatch(/No pude abrir el micrófono/);
  });
});
