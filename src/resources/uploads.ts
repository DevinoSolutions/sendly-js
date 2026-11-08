import type { Sendly } from "../client";
import { SendlyError } from "../errors";
import type { UploadedImage } from "../types";

/** The only types the route accepts; anything else is refused with `400`. */
const IMAGE_TYPES_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

function inferImageType(filename: string): string | undefined {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return undefined;
  return IMAGE_TYPES_BY_EXTENSION[filename.slice(dot + 1).toLowerCase()];
}

/**
 * File hosting for email content. Legacy `/api/uploads` route; needs
 * `templates:write`.
 */
export class UploadsResource {
  constructor(private readonly client: Sendly) {}

  /**
   * Host an image (JPEG, PNG, GIF or WebP, up to 10 MB) for use in emails and
   * resolve its hosted `url`. The answer is the bare
   * `{ url, key, filename, contentType, size }`, with no envelope.
   *
   * The server refuses any part whose type is not one of those four, so the
   * type has to be right before the request leaves. It is taken from, in order:
   * `contentType`, the `type` of a `Blob`/`File`, then the extension of
   * `filename`. Raw bytes (`ArrayBuffer`, `Uint8Array`) carry no type of their
   * own. When none of the three gives an image type this throws
   * `SendlyError("invalid_options")` rather than sending a request that cannot
   * succeed. The server also checks the file's contents against the declared
   * type, so a wrong declared type fails too (`400`). A `File` supplies its own
   * `filename`.
   *
   * The limit is 10 MB. The route refuses a larger upload on the declared
   * `Content-Length`, before buffering it, with `413 PAYLOAD_TOO_LARGE`, thrown
   * here as a `SendlyValidationError` that keeps the status and `errorCode`.
   *
   * Sent as `multipart/form-data` under the `image` field. The route also takes
   * JSON (`{ url }` or `{ base64, filename, contentType }`), but the contract
   * publishes no request body for either form, so the SDK uses the multipart
   * one. Answers `503` on a deployment without file storage.
   */
  async image(image: Blob | ArrayBuffer | Uint8Array, filename?: string, contentType?: string): Promise<UploadedImage> {
    const name = filename ?? (image instanceof File ? image.name : "image");
    const declared = image instanceof Blob ? image.type : "";
    const type = contentType ?? (declared in IMAGE_TYPES_BY_TYPE ? declared : undefined) ?? inferImageType(name);
    if (!type || !(type in IMAGE_TYPES_BY_TYPE)) {
      throw new SendlyError(
        0,
        "invalid_options",
        `Sendly: cannot tell what kind of image "${name}" is. Pass a Blob with a JPEG, PNG, GIF or WebP type, a filename ending in one of those extensions, or \`contentType\`.`,
      );
    }
    const part = image instanceof Blob && image.type === type ? image : new Blob([image as BlobPart], { type });
    const form = new FormData();
    form.append("image", part, name);
    return this.client.request<UploadedImage>({
      method: "POST",
      path: "/api/uploads/image",
      form,
    });
  }
}

const IMAGE_TYPES_BY_TYPE: Record<string, true> = {
  "image/jpeg": true,
  "image/jpg": true,
  "image/png": true,
  "image/gif": true,
  "image/webp": true,
};
