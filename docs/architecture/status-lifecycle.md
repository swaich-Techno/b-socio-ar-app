# Shared lifecycle and job statuses

The web application and worker use the following exact status vocabulary:

```text
UPLOADED
QUEUED
LOCKED
VALIDATING_IMAGE
PROCESSING_BACKGROUND
LOADING_MODEL
GENERATING_MESH
BAKING_TEXTURE
CONVERTING_GLB
OPTIMISING_MODEL
GENERATING_THUMBNAIL
UPLOADING_RESULTS
READY_FOR_REVIEW
NEEDS_MANUAL_REVIEW
CHANGES_REQUESTED
APPROVED_DEMO
REJECTED
AWAITING_PACKAGE
AWAITING_PAYMENT
PRODUCTION_APPROVED
PUBLISHED
FAILED
CANCELLED
```

Worker progress is monotonic within an attempt and includes a current-step label. `FAILED` requires an actual processing/validation/provider failure; worker absence leaves the job `QUEUED`. `READY_FOR_REVIEW` creates draft AR and QR records but does not make either public. `PUBLISHED` is reachable only after payment verification and final production approval.

Terminal/review states are changed through explicit action endpoints. Generic update APIs must not accept a free-form status from the client.
