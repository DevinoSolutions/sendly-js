import { describe, expect, expectTypeOf, test } from "vitest";
import type {
  AddSuppressionRequest,
  BatchSendRequest,
  BulkCreateContactsRequest,
  CreateContactRequest,
  CreateTemplateRequest,
  SendEmailRequest,
  SendEmailV1Request,
} from "../types";

/**
 * Compile-time pins for the `PartialKeys` corrections in `types.ts`.
 *
 * `openapi-typescript` emits a request property that carries a spec `default`
 * as required. These tests do nothing at runtime: `pnpm check-types` is what
 * fails if a defaulted property turns required again (after a regeneration, or
 * an alias being reverted to the raw generated type).
 */
describe("request types leave server-defaulted properties optional", () => {
  test("emails.send accepts an attachment with no disposition (#8)", () => {
    const withoutDisposition: SendEmailV1Request = {
      to: "someone@example.com",
      subject: "Report",
      body: "<p>Attached.</p>",
      attachments: [{ filename: "report.pdf", content: "JVBERi0=", contentType: "application/pdf" }],
    };
    const withDisposition: SendEmailV1Request = {
      to: "someone@example.com",
      attachments: [{ filename: "logo.png", content: "iVBOR", contentType: "image/png", disposition: "inline" }],
    };
    expect(withoutDisposition.attachments).toHaveLength(1);
    expect(withDisposition.attachments?.[0]?.disposition).toBe("inline");

    type Attachment = NonNullable<SendEmailV1Request["attachments"]>[number];
    expectTypeOf<Attachment["disposition"]>().toEqualTypeOf<"attachment" | "inline" | undefined>();
    // The rest of the attachment is exactly as generated: still required.
    expectTypeOf<Attachment["filename"]>().toEqualTypeOf<string>();
    expectTypeOf<Attachment["content"]>().toEqualTypeOf<string>();
    expectTypeOf<Attachment["contentType"]>().toEqualTypeOf<string>();
  });

  test("a required attachment property is still required", () => {
    const missingContent: SendEmailV1Request = {
      to: "someone@example.com",
      // @ts-expect-error `content` has no default, so it stays required
      attachments: [{ filename: "report.pdf", contentType: "application/pdf" }],
    };
    expect(missingContent.to).toBe("someone@example.com");
  });

  test("the legacy send and the batch send share the same correction", () => {
    type LegacyAttachment = NonNullable<SendEmailRequest["attachments"]>[number];
    type BatchAttachment = NonNullable<BatchSendRequest["emails"][number]["attachments"]>[number];
    expectTypeOf<LegacyAttachment["disposition"]>().toEqualTypeOf<"attachment" | "inline" | undefined>();
    expectTypeOf<BatchAttachment["disposition"]>().toEqualTypeOf<"attachment" | "inline" | undefined>();
  });

  test("the legacy create bodies leave their spec defaults optional", () => {
    expectTypeOf<CreateContactRequest["subscribed"]>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<BulkCreateContactsRequest["contacts"][number]["subscribed"]>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<CreateTemplateRequest["emailCategory"]>().toEqualTypeOf<
      "TRANSACTIONAL" | "MARKETING" | "SELF_MANAGED_UNSUBSCRIBE" | undefined
    >();
    expectTypeOf<AddSuppressionRequest["reason"]>().toEqualTypeOf<
      "HARD_BOUNCE" | "COMPLAINT" | "MANUAL" | "UNSUBSCRIBE" | undefined
    >();

    const contact: CreateContactRequest = { email: "test+a@example.com" };
    const suppression: AddSuppressionRequest = { email: "test+a@example.com" };
    expect(contact.subscribed).toBeUndefined();
    expect(suppression.reason).toBeUndefined();
  });
});
