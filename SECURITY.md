# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability or include customer data, credentials, signed URLs, object keys, payment proof, or exploit details in GitHub discussions.

Report security concerns privately to the repository owner. Include the affected component, reproduction conditions, impact, and a safe proof of concept when possible. Rotate any credential that may have been exposed before continuing investigation.

## Secrets and customer data

Production secrets are stored only in the deployment platform's secret manager. Environment files, database exports, R2 objects, uploaded images, generated 3D models, payment proof, logs containing private identifiers, and administrator password material must never be committed.

Use separate least-privilege credentials for the web application and worker. Review the runbooks in `docs/security` and `docs/deployment` before changing authentication, authorization, storage, publishing, or queue behavior.
