import type { Sendly } from "../client";
import type { UploadedImage } from "../types";

/**
 * File hosting for email content. Legacy `/api/uploads` route; needs
 * `templates:write`.
 */
export class UploadsResource {
  constructor(private readonly client: Sendly) {}

  /**
   * Host an image (JPEG, PNG, GIF or WebP, up to 10 MB) for use in emails and
   * resolve its hosted `url`.
   *
   * Sent as `multipart/form-data` under the `image` field. The route also takes
   * JSON (`{ url }` or `{ base64, filename, contentType }`), but the contract
   * publishes no request body for either form, so the SDK uses the multipart
   * one. The server checks the file's contents against its declared type, so a
   * bare `Blob` needs the image's real MIME type. Answers `503` on a
   * deployment without file storage.
   */
  async image(image: Blob, filename = "image"): Promise<UploadedImage> {
    const form = new FormData();
    form.append("image", image, filename);
    return this.client.request<UploadedImage>({
      method: "POST",
      path: "/api/uploads/image",
      form,
    });
  }
}
