# MongoDB Atlas setup

1. Create a dedicated Atlas project and cluster close to the intended worker region.
2. Create separate least-privilege database users for the web application and worker. During MVP both require read/write access to the application database; rotate credentials independently.
3. Configure network access for the production hosts. Do not leave `0.0.0.0/0` enabled without a compensating private-network control.
4. Put the SRV connection string in `MONGODB_URI` and the database name in `MONGODB_DB_NAME`.
5. Start the app once so Mongoose creates declared indexes, then review indexes in Atlas before production traffic.

The application collections store metadata and object keys only. Never upload image/model/payment binaries into MongoDB. Backups should cover the database and R2 inventory together so references remain consistent.
