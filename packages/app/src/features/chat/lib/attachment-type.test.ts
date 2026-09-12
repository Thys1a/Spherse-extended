import { describe, expect, it } from "vitest";
import { toWireAttachmentType } from "./attachment-type";

describe("toWireAttachmentType", () => {
  it("maps images to image and everything else to text", () => {
    expect(toWireAttachmentType("image/png")).toBe("image");
    expect(toWireAttachmentType("image/jpeg")).toBe("image");
    expect(toWireAttachmentType("text/plain")).toBe("text");
    expect(toWireAttachmentType("text/markdown")).toBe("text");
    expect(toWireAttachmentType("application/json")).toBe("text");
  });
});
