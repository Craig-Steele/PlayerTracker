# Hosting Pricing Estimate

This document captures a rough monthly hosting estimate for a commercial Roll4Initiative deployment on AWS, Azure, or Google Cloud.

These numbers are directional planning estimates, not quoted prices.

## Assumptions

Baseline assumptions for all three providers:

- one US region
- Vapor API plus Server-Sent Events
- PostgreSQL
- low-to-moderate beta/public-launch traffic
- no multi-region deployment
- no high-availability database yet
- modest backups, logs, and snapshots
- no large media or asset pipeline yet

This estimate assumes a small managed deployment, not a single hobby VM and not a fully redundant production stack.

## Estimated Monthly Range

### AWS

Estimated range:

- about `$30 to $70/month` to start

Typical low-complexity shape:

- Lightsail instance for the app
- Lightsail managed PostgreSQL for the database

Rough reasoning:

- app instance: about `$12/month`
- managed database: starts around `$15/month`
- snapshots, logging, domain, and egress buffer: about `$5 to $20/month`

Notes:

- Lightsail is attractive early because billing is simple and predictable.
- If high availability is added, expect the database cost to jump materially.

### Google Cloud

Estimated range:

- about `$15 to $40/month` to start

Typical low-cost managed shape:

- Cloud Run for the app
- Cloud SQL shared-core PostgreSQL for the database

Rough reasoning:

- Cloud SQL `db-f1-micro`: about `$7.67/month`
- 20 GiB SSD storage: about `$3.35/month`
- 20 GiB backup usage: about `$1.58/month`
- Cloud Run app cost: often low single digits to low teens depending on always-on usage and traffic

Notes:

- This is likely the cheapest managed option at low traffic.
- Costs rise quickly if always-on capacity, larger database tiers, or HA are added.

### Azure

Estimated range:

- about `$30 to $70/month` to start

Typical managed shape:

- App Service on Linux or Container Apps for the app
- Azure Database for PostgreSQL Flexible Server for the database

Rough reasoning:

- app tier: roughly `$10 to $25/month`
- managed PostgreSQL: roughly `$15 to $35/month`
- storage, backups, logging: about `$5 to $15/month`

Notes:

- Azure is workable, but for this app it does not currently look cheaper than Google Cloud.
- Public pricing pages make small-tier estimation less straightforward than AWS Lightsail or GCP Cloud SQL.

## Production-Like Cost Ranges

If high availability, more headroom, or stronger production readiness are added:

- lean beta budget: about `$50/month`
- comfortable managed launch budget: about `$100/month`
- production-like with redundancy: about `$150 to $250+/month`

Big cost drivers:

- high-availability or multi-zone PostgreSQL
- always-on warm app instances
- heavier SSE connection load
- logging and monitoring retention
- email provider costs
- backups and snapshots as data grows
- uploaded rulesets, templates, and future assets

## Recommended Reading of the Numbers

If the goal is lowest-cost sane managed hosting:

1. Google Cloud
2. AWS
3. Azure

If the goal is simplest predictable monthly billing:

1. AWS Lightsail

## Suggested Next Step

Before making a provider choice, build one concrete deployment model for each:

- AWS: Lightsail app + Lightsail managed PostgreSQL
- Azure: App Service or Container Apps + PostgreSQL Flexible Server
- Google Cloud: Cloud Run + Cloud SQL

Then estimate:

- app runtime
- database tier
- storage
- backups
- logging
- email
- domain/SSL

## Source Links

- AWS Lightsail instance bundles: https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bundles.html
- AWS Lightsail managed database pricing FAQ: https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-frequently-asked-questions-faq-billing-and-account-management.html
- AWS App Runner pricing: https://aws.amazon.com/apprunner/pricing/
- AWS RDS PostgreSQL pricing: https://aws.amazon.com/rds/postgresql/pricing
- Google Cloud Run pricing: https://cloud.google.com/run
- Google Cloud SQL pricing: https://cloud.google.com/sql/pricing
- Azure App Service on Linux pricing: https://azure.microsoft.com/en-us/pricing/details/app-service/linux/
- Azure Database for PostgreSQL Flexible Server pricing: https://azure.microsoft.com/en-us/pricing/details/postgresql/flexible-server/
