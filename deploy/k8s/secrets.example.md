# k8s Secrets (OPS-03)

Secret values never go into this repository. Create the Secrets by hand in the
`default` namespace before you apply the manifests. This file lists only the
names and keys.

## `cestaky-leaves-secrets` (app, one `secretKeyRef` per key in `app.yml`)

| Key                 | Env var             | Used for                                  |
| ------------------- | ------------------- | ----------------------------------------- |
| `MONGO_URL`         | `MONGO_URL`         | MongoDB connection, contains the password |
| `JWT_ACCESS_SECRET` | `JWT_ACCESS_SECRET` | access token signing (AUTH-02), ≥32 bytes |
| `SMTP_USER`         | `SMTP_USER`         | SMTP login                                |
| `SMTP_PASSWORD`     | `SMTP_PASSWORD`     | SMTP login                                |
| `M2M_USERNAME`      | `M2M_USERNAME`      | attendance M2M API basic auth             |
| `M2M_PASSWORD`      | `M2M_PASSWORD`      | attendance M2M API basic auth             |
| `SSO_USERNAME`      | `SSO_USERNAME`      | SSO meta API (attendance)                 |
| `SSO_PASSWORD`      | `SSO_PASSWORD`      | SSO meta API (attendance)                 |

`MONGO_URL` format (app user created by the `mongo8-rs-init` Job):

```text
mongodb://<app user>:<password>@mongo8-service:27017/cestaky?authSource=cestaky&replicaSet=rs0
```

URL-encode special characters in the user name and password.

## `mongo8-secrets` (MongoDB, `mongo8.yml` and `mongo8-rs-init.yml`)

| Key                          | Used by                                                                    |
| ---------------------------- | -------------------------------------------------------------------------- |
| `MONGO_INITDB_ROOT_USERNAME` | `mongo8-sfset` root user; the backup and restore scripts use it in the pod |
| `MONGO_INITDB_ROOT_PASSWORD` | `mongo8-sfset` root user                                                   |
| `MONGO_APP_USERNAME`         | `mongo8-rs-init` Job: app user in DB `cestaky`                             |
| `MONGO_APP_PASSWORD`         | `mongo8-rs-init` Job: app user password                                    |
| `keyfile`                    | replica-set internal auth, file at `/etc/mongo/keyfile` (mode 0400)        |

## `cestaky-migration-secrets` (cutover only, `migrate-legacy-job.yml`)

Temporary: created in the cutover window (MIG-04 step 11) and deleted the
day after (step 16), see [`deploy/CUTOVER.md`](../CUTOVER.md).

| Key                | Env var            | Used for                                                 |
| ------------------ | ------------------ | -------------------------------------------------------- |
| `LEGACY_MONGO_URL` | `LEGACY_MONGO_URL` | MIG-01 source: the restored old data in `cestaky_legacy` |

Same app user and password as `MONGO_URL` (the user has `read` on
`cestaky_legacy`), only the database differs:

```text
mongodb://<app user>:<password>@mongo8-service:27017/cestaky_legacy?authSource=cestaky&replicaSet=rs0
```

## `instea-registry` (existing)

Docker registry credentials for `registry.instea.co`, used as
`imagePullSecrets`. It already exists in the cluster.

## Create the Secrets and apply the manifests

The `kubectl create secret generic` commands and the apply order are in
[`deploy/README.md`](../README.md#first-time-setup).
