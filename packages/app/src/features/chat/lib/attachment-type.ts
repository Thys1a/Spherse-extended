export function toWireAttachmentType(mimeType: string): "image" | "text" {
  return mimeType.startsWith("image/") ? "image" : "text";
}
