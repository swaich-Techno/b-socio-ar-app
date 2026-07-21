# Cloudflare R2 setup

Create two buckets:

- A private bucket for originals, supporting images, processed inputs, drafts, models, thumbnails, QR files and payment proof.
- A public-output bucket for only the final assets explicitly approved for production publication.

Create an R2 API token restricted to these buckets. Populate `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_PRIVATE_BUCKET`, `R2_PUBLIC_BUCKET` and the optional custom `R2_PUBLIC_DOMAIN`.

## Browser upload CORS

Allow `PUT`, `GET` and `HEAD` from the exact application origins/API origin as required, permit `Content-Type`, `Content-Length`, `If-None-Match`, `x-amz-checksum-sha256` and the signed `x-amz-meta-*` headers, expose `ETag` and checksum headers, and keep the origin list narrow. Do not configure the private bucket for anonymous reads.

## Object-key layout

Keys are generated server-side and include tenant/business/product IDs plus a random identifier. A display filename is metadata only. PUTs are single-write (`If-None-Match: *`), R2 validates the signed native SHA-256, and confirmation independently downloads the object to re-hash it and verify file magic, size, MIME and ownership before the asset becomes usable.

## Publication

Do not change a private object's ACL in place. Copy the approved immutable output to a public production prefix, record the version and audit event, then publish the AR experience. Revocation updates the AR record/redirect first and removes public objects as a controlled operation.
